#include "ifwg_api.h"
#include "frotz.h"

#include <setjmp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#define EM_ASM(code, ...) ((void)0)
#endif

extern void init_header (void);
extern void init_setup (void);
extern void os_init_setup (void);
extern void os_process_arguments (int argc, char *argv[]);
extern void init_buffer (void);
extern void init_err (void);
extern void init_memory (void);
extern void init_process (void);
extern void init_sound (void);
extern void os_init_screen (void);
extern void init_undo (void);
extern void z_restart (void);
extern void interpret (void);
extern void reset_screen (void);
extern void reset_memory (void);
extern void os_reset_screen (void);

extern void ifwg_dumb_get_room_name (char *buf, int size);
extern void ifwg_dumb_get_status_right (char *buf, int size);
extern void ifwg_dumb_get_cursor_prompt (char *buf, int size);
extern void ifwg_dumb_get_full_screen (char *text_buf, char *style_buf, int size);
extern void ifwg_dumb_get_sensory_panel (char *buf, int size);
extern void ifwg_dumb_get_stats_line (char *buf, int size);
extern void ifwg_dumb_get_cursor_pos (int *row, int *col);
extern const char *ifwg_dumb_get_description (void);
extern void ifwg_dumb_reset_description (void);
extern void ifwg_interp_set_line_input (const char *input, int is_key_response);
extern int  ifwg_find_object_by_name (const char *name);

extern zbyte *pcp;
extern zbyte *ifwg_pre_opcode_pcp;

static jmp_buf ifwg_yield_buf;
static int ifwg_interp_active = 0;

/* do_yield is called deep inside interpret()'s own (potentially recursive)
 * call chain via longjmp/setjmp — these buffers used to live on its stack
 * frame, and doubling them (adding style_mask alongside full_screen) pushed
 * total frame size high enough to overflow the WASM stack and corrupt
 * adjacent memory (screen_data, zmp), which showed up as garbled control
 * characters spliced into otherwise-normal room text. do_yield is not
 * reentrant — it runs synchronously and longjmps away immediately after
 * building this one snapshot — so static storage is safe and avoids
 * growing the stack frame at all. */
static char ifwg_title[256];
static char ifwg_status_right[128];
static char ifwg_cursor_prompt[256];
static char ifwg_full_screen[4096];
static char ifwg_style_mask[4096];
static char ifwg_sensory_panel[2048];
static char ifwg_stats_line[256];

static void do_yield (int key_press_mode)
{
    int cursor_row, cursor_col;
    zword globals_addr, location;

    if (!ifwg_interp_active)
        return;

    ifwg_dumb_get_room_name (ifwg_title, sizeof (ifwg_title));
    ifwg_dumb_get_status_right (ifwg_status_right, sizeof (ifwg_status_right));
    ifwg_dumb_get_cursor_prompt (ifwg_cursor_prompt, sizeof (ifwg_cursor_prompt));
    ifwg_dumb_get_full_screen (ifwg_full_screen, ifwg_style_mask, sizeof (ifwg_full_screen));
    ifwg_dumb_get_sensory_panel (ifwg_sensory_panel, sizeof (ifwg_sensory_panel));
    ifwg_dumb_get_stats_line (ifwg_stats_line, sizeof (ifwg_stats_line));
    ifwg_dumb_get_cursor_pos (&cursor_row, &cursor_col);

    /* V1-V3: global 0 is spec-mandated as the current location.
     * V4+: no mandated location global, so scan the object table for an
     * object whose short name matches the status-bar room name. */
    if (zmp[0] <= 3) {
        globals_addr = ((zword) zmp[H_GLOBALS] << 8) | (zword) zmp[H_GLOBALS + 1];
        location     = ((zword) zmp[globals_addr] << 8) | (zword) zmp[globals_addr + 1];
    } else {
        location = (zword) ifwg_find_object_by_name (ifwg_title);
    }

    /* Pass isKeyPress=true when called from os_read_key so the player UI
       shows "press any key" and accepts any keydown instead of the prompt.
       cursor_prompt carries any inline game prompt (e.g. "? (y/n) >" or
       "(Please type YES or NO.)") that dumb_show_screen skips as redundant.
       fullScreen/cursorRow/cursorCol carry the complete, always-in-sync
       screen grid — used to render @read_char-driven forms/menus faithfully
       instead of reconstructing them from the lossy changed-rows-only
       description stream. */
    EM_ASM({
        var id            = $0;
        var title         = UTF8ToString($1);
        var desc          = UTF8ToString($2);
        var status        = UTF8ToString($3);
        var isKeyPress    = !!$4;
        var cursorPrompt  = UTF8ToString($5);
        var fullScreen    = UTF8ToString($6);
        var cursorRow     = $7;
        var cursorCol     = $8;
        var styleMask     = UTF8ToString($9);
        var sensoryPanel  = UTF8ToString($10);
        var statsLine     = UTF8ToString($11);
        if (typeof window !== 'undefined' && typeof window.enteredRoom === 'function')
            window.enteredRoom({
                id: id, title: title, description: desc, statusRight: status,
                isKeyPress: isKeyPress, cursorPrompt: cursorPrompt,
                fullScreen: fullScreen, cursorRow: cursorRow, cursorCol: cursorCol,
                styleMask: styleMask, sensoryPanel: sensoryPanel, statsLine: statsLine
            });
    }, (int) location, ifwg_title, ifwg_dumb_get_description (), ifwg_status_right, key_press_mode,
       ifwg_cursor_prompt, ifwg_full_screen, cursor_row, cursor_col, ifwg_style_mask, ifwg_sensory_panel,
       ifwg_stats_line);

    ifwg_dumb_reset_description ();

    /* Rewind PC to the start of the read opcode so interpret() re-executes
     * it cleanly with the input buffer populated.  */
    if (ifwg_pre_opcode_pcp)
        pcp = ifwg_pre_opcode_pcp;

    longjmp (ifwg_yield_buf, 1);
}

void ifwg_yield (void)     { do_yield (0); }
void ifwg_yield_key (void) { do_yield (1); }

EMSCRIPTEN_KEEPALIVE
void ifwg_interp_step (const char *input, int is_key_response)
{
    ifwg_interp_set_line_input (input, is_key_response);
    ifwg_dumb_reset_description ();

    ifwg_interp_active = 1;
    if (setjmp (ifwg_yield_buf) == 0)
        interpret ();
    ifwg_interp_active = 0;
}

EMSCRIPTEN_KEEPALIVE
void ifwg_interp_start (const char *story_path)
{
    char *argv[2];
    argv[0] = "dfrotz";
    argv[1] = (char *) story_path;

    ifwg_dumb_reset_description ();

    init_header ();
    init_setup ();
    os_init_setup ();
    os_process_arguments (2, argv);
    init_buffer ();
    init_err ();
    init_memory ();
    init_process ();
    init_sound ();
    os_init_screen ();
    init_undo ();
    z_restart ();

    ifwg_interp_active = 1;
    if (setjmp (ifwg_yield_buf) == 0)
        interpret ();
    ifwg_interp_active = 0;
}

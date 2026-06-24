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
extern const char *ifwg_dumb_get_description (void);
extern void ifwg_dumb_reset_description (void);
extern void ifwg_interp_set_line_input (const char *input);
extern int  ifwg_find_object_by_name (const char *name);

extern zbyte *pcp;
extern zbyte *ifwg_pre_opcode_pcp;

static jmp_buf ifwg_yield_buf;
static int ifwg_interp_active = 0;

void ifwg_yield (void)
{
    char title[256];
    char status_right[128];
    zword globals_addr, location;

    if (!ifwg_interp_active)
        return;

    ifwg_dumb_get_room_name (title, sizeof (title));
    ifwg_dumb_get_status_right (status_right, sizeof (status_right));

    /* V1-V3: global 0 is spec-mandated as the current location.
     * V4+: no mandated location global, so scan the object table for an
     * object whose short name matches the status-bar room name. */
    if (zmp[0] <= 3) {
        globals_addr = ((zword) zmp[H_GLOBALS] << 8) | (zword) zmp[H_GLOBALS + 1];
        location     = ((zword) zmp[globals_addr] << 8) | (zword) zmp[globals_addr + 1];
    } else {
        location = (zword) ifwg_find_object_by_name (title);
    }

    EM_ASM({
        var id     = $0;
        var title  = UTF8ToString($1);
        var desc   = UTF8ToString($2);
        var status = UTF8ToString($3);
        if (typeof window !== 'undefined' && typeof window.enteredRoom === 'function')
            window.enteredRoom(id, title, desc, status);
    }, (int) location, title, ifwg_dumb_get_description (), status_right);

    ifwg_dumb_reset_description ();

    /* Rewind PC to the start of the read opcode so interpret() re-executes
     * it cleanly with the input buffer populated.  */
    if (ifwg_pre_opcode_pcp)
        pcp = ifwg_pre_opcode_pcp;

    longjmp (ifwg_yield_buf, 1);
}

EMSCRIPTEN_KEEPALIVE
void ifwg_interp_step (const char *input)
{
    ifwg_interp_set_line_input (input);
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

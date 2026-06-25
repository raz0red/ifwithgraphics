#include "ifwg_api.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <setjmp.h>
#include <stdarg.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#include "tx.h"

extern void show_header (void);
extern void show_objects (int);
extern void show_tree (void);
extern int ifwg_ztools_txd_main (int argc, char *argv[]);
extern int optind;

static jmp_buf ifwg_ztools_exit_buffer;
static int ifwg_ztools_exit_status = 0;

typedef struct ifwg_capture {
    char *data;
    size_t length;
    size_t capacity;
} ifwg_capture_t;

static const char *ifwg_v3_alphabet[3] = {
    "abcdefghijklmnopqrstuvwxyz",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    " \n0123456789.,!?_#'\"/\\-:()"
};

void ifwg_ztools_exit (int status)
{
    ifwg_ztools_exit_status = status;
    longjmp (ifwg_ztools_exit_buffer, 1);
}

static void ifwg_prepare_story (const char *story_path)
{
    open_story (story_path);
    configure (V1, V8);
    load_cache ();
}

static void ifwg_close_story (void)
{
    close_story ();
}

static char *ifwg_copy_string (const char *value)
{
    char *copy;
    size_t length;

    if (value == NULL)
        value = "";

    length = strlen (value) + 1;
    copy = (char *) malloc (length);
    if (copy != NULL)
        memcpy (copy, value, length);

    return copy;
}

static char *ifwg_stub_result (const char *method, const char *story_path)
{
    char buffer[512];

    if (story_path == NULL)
        story_path = "(null)";

    printf ("IFWG bridge stub: %s(%s)\n", method, story_path);
    snprintf (buffer, sizeof (buffer),
              "IFWG bridge stub\nmethod: %s\nstory_path: %s\n",
              method, story_path);

    return ifwg_copy_string (buffer);
}

static int ifwg_capture_reserve (ifwg_capture_t *capture, size_t needed)
{
    char *next;
    size_t capacity;

    if (needed <= capture->capacity)
        return 1;

    capacity = capture->capacity ? capture->capacity : 4096;
    while (capacity < needed)
        capacity *= 2;

    next = (char *) realloc (capture->data, capacity);
    if (next == NULL)
        return 0;

    capture->data = next;
    capture->capacity = capacity;
    return 1;
}

static void ifwg_capture_append (ifwg_capture_t *capture, const char *text)
{
    size_t length;

    if (capture == NULL || text == NULL)
        return;

    length = strlen (text);
    if (!ifwg_capture_reserve (capture, capture->length + length + 1))
        return;

    memcpy (capture->data + capture->length, text, length);
    capture->length += length;
    capture->data[capture->length] = '\0';
}

static void ifwg_capture_appendf (ifwg_capture_t *capture, const char *format, ...)
{
    char buffer[4096];
    va_list ap;

    va_start (ap, format);
    vsnprintf (buffer, sizeof (buffer), format, ap);
    va_end (ap);

    ifwg_capture_append (capture, buffer);
}

static void ifwg_text_append_char (char *buffer, size_t capacity, size_t *length, char value)
{
    if (*length + 1 >= capacity)
        return;

    buffer[*length] = value;
    (*length)++;
    buffer[*length] = '\0';
}

static int ifwg_decode_zstring_at (unsigned long start, char *buffer, size_t capacity, int depth)
{
    unsigned long address = start;
    unsigned int data, code;
    int i, words = 0;
    int shift_state = 0;
    int shift_lock = 0;
    int abbreviation = 0;
    int ascii_state = 0;
    int ascii_value = 0;
    size_t length = 0;

    if (depth > 3 || capacity == 0)
        return 0;

    buffer[0] = '\0';

    do {
        if (address + 1 >= file_size || words++ > 512)
            return 0;

        data = read_data_word (&address);

        for (i = 10; i >= 0; i -= 5) {
            code = (data >> i) & 0x1f;

            if (abbreviation) {
                unsigned long abbreviation_address;
                char abbreviation_buffer[512];
                abbreviation_address = (unsigned long) get_word ((unsigned int) header.abbreviations + (((abbreviation - 1) * 32 + code) * 2)) * 2;
                if (ifwg_decode_zstring_at (abbreviation_address, abbreviation_buffer, sizeof (abbreviation_buffer), depth + 1)) {
                    size_t j;
                    for (j = 0; abbreviation_buffer[j] != '\0'; j++)
                        ifwg_text_append_char (buffer, capacity, &length, abbreviation_buffer[j]);
                }
                abbreviation = 0;
                shift_state = shift_lock;
            } else if (ascii_state) {
                if (ascii_state == 1) {
                    ascii_value = (int) code << 5;
                    ascii_state = 2;
                } else {
                    ifwg_text_append_char (buffer, capacity, &length, (char) (ascii_value | (int) code));
                    ascii_state = 0;
                }
            } else if (code == 0) {
                ifwg_text_append_char (buffer, capacity, &length, ' ');
            } else if ((unsigned int) header.version >= V3 && code < 4) {
                abbreviation = (int) code;
            } else if ((unsigned int) header.version >= V3 && code < 6) {
                shift_state = (int) code - 3;
                shift_lock = 0;
            } else if (code > 5) {
                unsigned int zchar = code - 6;
                if (shift_state == 2 && zchar == 0) {
                    ascii_state = 1;
                } else if (shift_state == 2 && zchar == 1) {
                    ifwg_text_append_char (buffer, capacity, &length, '\n');
                } else if (zchar < 26) {
                    ifwg_text_append_char (buffer, capacity, &length, ifwg_v3_alphabet[shift_state][zchar]);
                }
                shift_state = shift_lock;
            }
        }
    } while ((data & 0x8000) == 0);

    return length > 0;
}

EMSCRIPTEN_KEEPALIVE
char *ifwg_inspect_dump_header (const char *story_path)
{
    printf ("IFWG bridge: dumping Z-code header for %s\n", story_path);

    ifwg_prepare_story (story_path);
    show_header ();
    ifwg_close_story ();

    return ifwg_copy_string ("ifwg_inspect_dump_header completed\n");
}

EMSCRIPTEN_KEEPALIVE
char *ifwg_inspect_dump_objects (const char *story_path)
{
    printf ("IFWG bridge: dumping Z-code objects for %s\n", story_path);

    ifwg_prepare_story (story_path);
    show_objects (0);
    ifwg_close_story ();

    return ifwg_copy_string ("ifwg_inspect_dump_objects completed\n");
}

EMSCRIPTEN_KEEPALIVE
char *ifwg_inspect_dump_tree (const char *story_path)
{
    printf ("IFWG bridge: dumping Z-code object tree for %s\n", story_path);

    ifwg_prepare_story (story_path);
    show_tree ();
    ifwg_close_story ();

    return ifwg_copy_string ("ifwg_inspect_dump_tree completed\n");
}

EMSCRIPTEN_KEEPALIVE
char *ifwg_inspect_dump_dictionary (const char *story_path)
{
    return ifwg_stub_result ("ifwg_inspect_dump_dictionary", story_path);
}

EMSCRIPTEN_KEEPALIVE
char *ifwg_inspect_dump_disassembly (const char *story_path)
{
    char *argv[6];

    printf ("IFWG bridge: dumping Z-code strings for %s\n", story_path);

    argv[0] = "txd";
    argv[1] = "-S";
    argv[2] = "0x4b54";
    argv[3] = "-w";
    argv[4] = "0";
    argv[5] = (char *) story_path;

    optind = 1;
    ifwg_ztools_exit_status = 0;
    if (setjmp (ifwg_ztools_exit_buffer) == 0)
        (void) ifwg_ztools_txd_main (6, argv);

    if (ifwg_ztools_exit_status != 0)
        return ifwg_copy_string ("ifwg_inspect_dump_disassembly failed\n");

    return ifwg_copy_string ("ifwg_inspect_dump_strings completed\n");
}

EMSCRIPTEN_KEEPALIVE
char *ifwg_inspect_find_text (const char *story_path, const char *query)
{
    ifwg_capture_t capture;
    unsigned long address;
    unsigned int matches = 0;
    char decoded[2048];

    memset (&capture, 0, sizeof (capture));

    if (query == NULL || query[0] == '\0')
        return ifwg_copy_string ("No search query provided.\n");

    printf ("IFWG bridge: searching decoded Z-code strings for \"%s\" in %s\n", query, story_path);

    ifwg_prepare_story (story_path);
    ifwg_capture_appendf (&capture, "Searching for: %s\n\n", query);

    for (address = (unsigned long) header.resident_size; address + 1 < file_size; address += 2) {
        if (ifwg_decode_zstring_at (address, decoded, sizeof (decoded), 0) && strstr (decoded, query) != NULL) {
            ifwg_capture_appendf (&capture, "0x%05lx: %s\n\n", address, decoded);
            matches++;
            if (matches >= 50) {
                ifwg_capture_append (&capture, "Stopped after 50 matches.\n");
                break;
            }
        }
    }

    ifwg_close_story ();

    if (matches == 0)
        ifwg_capture_append (&capture, "No matches found.\n");

    return capture.data ? capture.data : ifwg_copy_string ("No matches found.\n");
}

EMSCRIPTEN_KEEPALIVE
char *ifwg_inspect_dump_full (const char *story_path)
{
    return ifwg_stub_result ("ifwg_inspect_dump_full", story_path);
}

EMSCRIPTEN_KEEPALIVE
void ifwg_free_string (char *value)
{
    free (value);
}

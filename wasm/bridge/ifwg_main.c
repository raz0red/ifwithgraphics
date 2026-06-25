#include "ifwg_api.h"

#include <stdio.h>

int main (int argc, char **argv)
{
    char *result;
    const char *story_path;

    puts ("IFWG WASM bridge loaded.");

    if (argc < 2)
        return 0;

    story_path = argv[1];
    result = ifwg_inspect_dump_objects (story_path);
    if (result != NULL) {
        fputs (result, stdout);
        ifwg_free_string (result);
    }

    return 0;
}

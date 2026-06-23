#ifndef IFWG_API_H
#define IFWG_API_H

char *ifwg_inspect_dump_header (const char *story_path);
char *ifwg_inspect_dump_objects (const char *story_path);
char *ifwg_inspect_dump_tree (const char *story_path);
char *ifwg_inspect_dump_dictionary (const char *story_path);
char *ifwg_inspect_dump_disassembly (const char *story_path);
char *ifwg_inspect_find_text (const char *story_path, const char *query);
char *ifwg_inspect_dump_full (const char *story_path);
void ifwg_free_string (char *value);

void ifwg_interp_start (const char *story_path);

#endif

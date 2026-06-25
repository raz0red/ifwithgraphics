EMCC ?= emcc

BUILD_DIR := build
BRIDGE_DIR := bridge
ZTOOLS_DIR := ztools/source
FROTZ_COMMON_DIR := frotz/src/common
FROTZ_DUMB_DIR := frotz/src/dumb
BUILDER_WASM_DIR := ../../builder/wasm
PLAYER_WASM_DIR  := ../../player/wasm

OUT_JS         := $(BUILD_DIR)/ifwg.js
PUBLIC_JS      := $(BUILDER_WASM_DIR)/ifwg.js
PUBLIC_WASM    := $(BUILDER_WASM_DIR)/ifwg.wasm
PLAYER_JS      := $(PLAYER_WASM_DIR)/ifwg.js
PLAYER_WASM_F  := $(PLAYER_WASM_DIR)/ifwg.wasm
TXD_OBJ := $(BUILD_DIR)/txd.o
FROTZ_MAIN_OBJ := $(BUILD_DIR)/frotz_main.o

BRIDGE_SOURCES := \
	$(BRIDGE_DIR)/ifwg_main.c \
	$(BRIDGE_DIR)/ifwg_api.c \
	$(BRIDGE_DIR)/ifwg_interp.c

ZTOOLS_SOURCES := \
	$(ZTOOLS_DIR)/showhead.c \
	$(ZTOOLS_DIR)/showobj.c \
	$(ZTOOLS_DIR)/showverb.c \
	$(ZTOOLS_DIR)/infinfo.c \
	$(ZTOOLS_DIR)/symbols.c \
	$(ZTOOLS_DIR)/txio.c

# Frotz common core — main.c excluded (entry point not needed in WASM build)
FROTZ_COMMON_SOURCES := \
	$(FROTZ_COMMON_DIR)/buffer.c \
	$(FROTZ_COMMON_DIR)/err.c \
	$(FROTZ_COMMON_DIR)/fastmem.c \
	$(FROTZ_COMMON_DIR)/files.c \
	$(FROTZ_COMMON_DIR)/getopt.c \
	$(FROTZ_COMMON_DIR)/hotkey.c \
	$(FROTZ_COMMON_DIR)/input.c \
	$(FROTZ_COMMON_DIR)/math.c \
	$(FROTZ_COMMON_DIR)/missing.c \
	$(FROTZ_COMMON_DIR)/object.c \
	$(FROTZ_COMMON_DIR)/process.c \
	$(FROTZ_COMMON_DIR)/quetzal.c \
	$(FROTZ_COMMON_DIR)/random.c \
	$(FROTZ_COMMON_DIR)/redirect.c \
	$(FROTZ_COMMON_DIR)/screen.c \
	$(FROTZ_COMMON_DIR)/sound.c \
	$(FROTZ_COMMON_DIR)/stream.c \
	$(FROTZ_COMMON_DIR)/table.c \
	$(FROTZ_COMMON_DIR)/text.c \
	$(FROTZ_COMMON_DIR)/variable.c

FROTZ_DUMB_SOURCES := \
	$(FROTZ_DUMB_DIR)/dblorb.c \
	$(FROTZ_DUMB_DIR)/dinit.c \
	$(FROTZ_DUMB_DIR)/dinput.c \
	$(FROTZ_DUMB_DIR)/doutput.c \
	$(FROTZ_DUMB_DIR)/dpic.c

FROTZ_SOURCES := $(FROTZ_COMMON_SOURCES) $(FROTZ_DUMB_SOURCES)

FROTZ_DEFS := $(FROTZ_COMMON_DIR)/defs.h
FROTZ_HASH := $(FROTZ_COMMON_DIR)/hash.h

FROTZ_CFLAGS := \
	-I $(FROTZ_COMMON_DIR) \
	-I $(FROTZ_DUMB_DIR) \
	-D_POSIX_C_SOURCE=200809L

EXPORTED_FUNCTIONS := ["_ifwg_inspect_dump_header","_ifwg_inspect_dump_objects","_ifwg_inspect_dump_tree","_ifwg_inspect_dump_dictionary","_ifwg_inspect_dump_disassembly","_ifwg_inspect_find_text","_ifwg_inspect_dump_full","_ifwg_free_string","_ifwg_interp_start","_ifwg_interp_step","_malloc","_free"]
EXPORTED_RUNTIME_METHODS := ["FS","UTF8ToString","lengthBytesUTF8","stringToUTF8"]

.PHONY: all clean

all: $(PUBLIC_JS) $(PUBLIC_WASM) $(PLAYER_JS) $(PLAYER_WASM_F)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BUILDER_WASM_DIR):
	mkdir -p $(BUILDER_WASM_DIR)

$(PLAYER_WASM_DIR):
	mkdir -p $(PLAYER_WASM_DIR)

$(FROTZ_DEFS):
	@echo "#ifndef COMMON_DEFINES_H" > $@
	@echo "#define COMMON_DEFINES_H" >> $@
	@echo "#define VERSION \"2.56pre\"" >> $@
	@echo "#define RELEASE_NOTES \"Development release.\"" >> $@
	@echo "#define UNIX" >> $@
	@echo "#define NO_BLORB" >> $@
	@echo "#define NO_SOUND" >> $@
	@echo "#define MAX_UNDO_SLOTS 500" >> $@
	@echo "#define MAX_FILE_NAME 80" >> $@
	@echo "#define TEXT_BUFFER_SIZE 512" >> $@
	@echo "#define INPUT_BUFFER_SIZE 200" >> $@
	@echo "#define STACK_SIZE 1024" >> $@
	@echo "#endif /* COMMON_DEFINES_H */" >> $@

$(FROTZ_HASH):
	@echo "#ifndef VERSION" > $@
	@echo "#define VERSION \"2.56pre\"" >> $@
	@echo "#endif" >> $@
	@echo "#ifndef RELEASE_NOTES" >> $@
	@echo "#define RELEASE_NOTES \"Development release.\"" >> $@
	@echo "#endif" >> $@
	@echo "#define GIT_HASH \"unknown\"" >> $@
	@echo "#define GIT_HASH_SHORT \"unknown\"" >> $@
	@echo "#define GIT_DATE \"unknown\"" >> $@

$(FROTZ_MAIN_OBJ): $(FROTZ_COMMON_DIR)/main.c $(FROTZ_DEFS) $(FROTZ_HASH) | $(BUILD_DIR)
	$(EMCC) \
		$(FROTZ_COMMON_DIR)/main.c \
		-I $(FROTZ_COMMON_DIR) \
		-D_POSIX_C_SOURCE=200809L \
		-Dmain=ifwg_frotz_main \
		-O2 \
		-c \
		-o $(FROTZ_MAIN_OBJ)

$(TXD_OBJ): $(ZTOOLS_DIR)/txd.c $(ZTOOLS_DIR)/tx.h | $(BUILD_DIR)
	$(EMCC) \
		$(ZTOOLS_DIR)/txd.c \
		-I $(ZTOOLS_DIR) \
		-Dmain=ifwg_ztools_txd_main \
		-Dexit=ifwg_ztools_exit \
		-O2 \
		-c \
		-o $(TXD_OBJ)

$(OUT_JS): $(BRIDGE_SOURCES) $(ZTOOLS_SOURCES) $(FROTZ_SOURCES) $(TXD_OBJ) $(FROTZ_MAIN_OBJ) \
           $(BRIDGE_DIR)/ifwg_api.h $(ZTOOLS_DIR)/tx.h \
           $(FROTZ_DEFS) $(FROTZ_HASH) | $(BUILD_DIR)
	$(EMCC) \
		$(BRIDGE_SOURCES) \
		$(ZTOOLS_SOURCES) \
		$(FROTZ_SOURCES) \
		$(TXD_OBJ) \
		$(FROTZ_MAIN_OBJ) \
		-I $(ZTOOLS_DIR) \
		$(FROTZ_CFLAGS) \
		-O2 \
		-s MODULARIZE=1 \
		-s EXPORT_NAME=createIfwgModule \
		-s FORCE_FILESYSTEM=1 \
		-s 'EXPORTED_RUNTIME_METHODS=$(EXPORTED_RUNTIME_METHODS)' \
		-s 'EXPORTED_FUNCTIONS=$(EXPORTED_FUNCTIONS)' \
		-o $(OUT_JS)

$(PUBLIC_JS): $(OUT_JS) | $(BUILDER_WASM_DIR)
	cp $(BUILD_DIR)/ifwg.js $(BUILDER_WASM_DIR)/ifwg.js

$(PUBLIC_WASM): $(OUT_JS) | $(BUILDER_WASM_DIR)
	cp $(BUILD_DIR)/ifwg.wasm $(BUILDER_WASM_DIR)/ifwg.wasm

$(PLAYER_JS): $(OUT_JS) | $(PLAYER_WASM_DIR)
	cp $(BUILD_DIR)/ifwg.js $(PLAYER_WASM_DIR)/ifwg.js

$(PLAYER_WASM_F): $(OUT_JS) | $(PLAYER_WASM_DIR)
	cp $(BUILD_DIR)/ifwg.wasm $(PLAYER_WASM_DIR)/ifwg.wasm

clean:
	rm -rf $(BUILD_DIR)
	rm -rf $(BUILDER_WASM_DIR)
	rm -rf $(PLAYER_WASM_DIR)
	rm -f $(FROTZ_DEFS) $(FROTZ_HASH)

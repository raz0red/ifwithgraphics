CC      ?= gcc
CFLAGS  := -O2 -D_POSIX_C_SOURCE=200809L -DIFWG_MONITOR

FROTZ_COMMON := ../../wasm/frotz/src/common
FROTZ_DUMB   := ../../wasm/frotz/src/dumb

BUILD := build
BIN   := bin

FROTZ_DEFS := $(FROTZ_COMMON)/defs.h
FROTZ_HASH := $(FROTZ_COMMON)/hash.h

INCLUDES := -I $(FROTZ_COMMON) -I $(FROTZ_DUMB)

SOURCES := \
	$(FROTZ_COMMON)/main.c \
	$(FROTZ_COMMON)/buffer.c \
	$(FROTZ_COMMON)/err.c \
	$(FROTZ_COMMON)/fastmem.c \
	$(FROTZ_COMMON)/files.c \
	$(FROTZ_COMMON)/getopt.c \
	$(FROTZ_COMMON)/hotkey.c \
	$(FROTZ_COMMON)/input.c \
	$(FROTZ_COMMON)/math.c \
	$(FROTZ_COMMON)/missing.c \
	$(FROTZ_COMMON)/object.c \
	$(FROTZ_COMMON)/process.c \
	$(FROTZ_COMMON)/quetzal.c \
	$(FROTZ_COMMON)/random.c \
	$(FROTZ_COMMON)/redirect.c \
	$(FROTZ_COMMON)/screen.c \
	$(FROTZ_COMMON)/sound.c \
	$(FROTZ_COMMON)/stream.c \
	$(FROTZ_COMMON)/table.c \
	$(FROTZ_COMMON)/text.c \
	$(FROTZ_COMMON)/variable.c \
	$(FROTZ_DUMB)/dblorb.c \
	$(FROTZ_DUMB)/dinit.c \
	$(FROTZ_DUMB)/dinput.c \
	$(FROTZ_DUMB)/doutput.c \
	$(FROTZ_DUMB)/dpic.c

TARGET := $(BIN)/dfrotz

.PHONY: all clean

all: $(TARGET)

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

$(TARGET): $(SOURCES) $(FROTZ_DEFS) $(FROTZ_HASH)
	mkdir -p $(BIN)
	$(CC) $(CFLAGS) $(INCLUDES) $(SOURCES) -o $@

clean:
	rm -rf $(BIN)
	rm -f $(FROTZ_DEFS) $(FROTZ_HASH)

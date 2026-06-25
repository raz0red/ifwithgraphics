/* Suppress Emscripten's native browser prompt for stdin fgetc (os_read_key).
   Returning "" feeds '\n' which most games accept as a keypress. */
const _np = window.prompt;
window.prompt = (m, d) => m === "Input: " ? "" : _np?.call(window, m, d) ?? "";

export function createEngine(wasmPath, onRoomEntered, onSave) {
  let moduleInstance = null;

  /* The C bridge calls window.enteredRoom() via EM_ASM on every yield. */
  window.enteredRoom = onRoomEntered;

  /* Called by EM_ASM in fastmem.c z_save after the save file is written. */
  window.ifwgOnSave = filename => {
    try {
      const bytes = moduleInstance.FS.readFile(filename);
      if (onSave) onSave(filename, bytes);
    } catch (e) {
      console.warn("ifwgOnSave: could not read", filename, e);
    }
  };

  function writeString(s) {
    const len = moduleInstance.lengthBytesUTF8(s) + 1;
    const ptr = moduleInstance._malloc(len);
    moduleInstance.stringToUTF8(s, ptr, len);
    return ptr;
  }

  function init() {
    return createIfwgModule({
      locateFile: p => wasmPath + p,
      print:      () => {},
      printErr:   () => {}
    }).then(mod => { moduleInstance = mod; });
  }

  function start(storyPath) {
    if (!moduleInstance || !storyPath) return;
    const ptr = writeString(storyPath);
    moduleInstance._ifwg_interp_start(ptr);
    moduleInstance._free(ptr);
  }

  function step(command) {
    if (!moduleInstance) return;
    const ptr = writeString(command);
    moduleInstance._ifwg_interp_step(ptr);
    moduleInstance._free(ptr);
  }

  function writeFile(path, bytes) {
    try { moduleInstance.FS.mkdir("/input"); } catch (_) { /* already exists */ }
    moduleInstance.FS.writeFile(path, bytes);
  }

  function writeSave(path, bytes) {
    try { moduleInstance.FS.writeFile(path, bytes); } catch (e) {
      console.warn("writeSave failed:", e);
    }
  }

  return { init, start, step, writeFile, writeSave };
}

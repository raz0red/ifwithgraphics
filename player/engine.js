/* Suppress Emscripten's native browser prompt for stdin fgetc (os_read_key).
   Returning "" feeds '\n' which most games accept as a keypress. */
(function () {
  var _np = window.prompt;
  window.prompt = function (m, d) {
    if (m === "Input: ") return "";
    return _np ? _np.call(window, m, d) : "";
  };
})();

export function createEngine(wasmPath, onRoomEntered, onSave) {
  var moduleInstance = null;

  /* The C bridge calls window.enteredRoom() via EM_ASM on every yield. */
  window.enteredRoom = onRoomEntered;

  /* Called by EM_ASM in fastmem.c z_save after the save file is written. */
  window.ifwgOnSave = function (filename) {
    try {
      var bytes = moduleInstance.FS.readFile(filename);
      if (onSave) onSave(filename, bytes);
    } catch (e) {
      console.warn("ifwgOnSave: could not read", filename, e);
    }
  };

  function writeString(s) {
    var len = moduleInstance.lengthBytesUTF8(s) + 1;
    var ptr = moduleInstance._malloc(len);
    moduleInstance.stringToUTF8(s, ptr, len);
    return ptr;
  }

  function init() {
    return createIfwgModule({
      locateFile: function (p) { return wasmPath + p; },
      print:      function () {},
      printErr:   function () {}
    }).then(function (mod) {
      moduleInstance = mod;
    });
  }

  function start(storyPath) {
    if (!moduleInstance || !storyPath) return;
    var ptr = writeString(storyPath);
    moduleInstance._ifwg_interp_start(ptr);
    moduleInstance._free(ptr);
  }

  function step(command) {
    if (!moduleInstance) return;
    var ptr = writeString(command);
    moduleInstance._ifwg_interp_step(ptr);
    moduleInstance._free(ptr);
  }

  function writeFile(path, bytes) {
    try { moduleInstance.FS.mkdir("/input"); } catch (_) {}
    moduleInstance.FS.writeFile(path, bytes);
  }

  function writeSave(path, bytes) {
    try { moduleInstance.FS.writeFile(path, bytes); } catch (e) {
      console.warn("writeSave failed:", e);
    }
  }

  return {
    init:      init,
    start:     start,
    step:      step,
    writeFile: writeFile,
    writeSave: writeSave
  };
}

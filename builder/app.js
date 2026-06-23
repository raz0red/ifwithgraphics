(function () {
  var moduleInstance = null;
  var storyPath = null;
  var printLines = [];

  var status = document.getElementById("status");
  var output = document.getElementById("output");
  var clearOutput = document.getElementById("clearOutput");
  var dropZone = document.getElementById("dropZone");
  var storyFile = document.getElementById("storyFile");
  var fileStatus = document.getElementById("fileStatus");
  var runFrotz = document.getElementById("runFrotz");
  var frotzInput = document.getElementById("frotzInput");
  var frotzSend = document.getElementById("frotzSend");
  var textQuery = document.getElementById("textQuery");
  var findText = document.getElementById("findText");
  var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-method]"));

  function appendOutput(kind, text) {
    var timestamp = new Date().toLocaleTimeString();
    var el = document.createElement("div");
    el.className = "output-block";
    el.innerHTML =
      "<span class=\"output-label\">[" + timestamp + "] " + kind + "</span>" +
      "<pre class=\"output-text\">" + escapeHtml(text) + "</pre>";
    output.appendChild(el);
    output.scrollTop = output.scrollHeight;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function flushPrint(label) {
    if (printLines.length === 0) return;
    appendOutput(label, printLines.join("\n"));
    printLines = [];
  }

  var frotzStarted = false;

  function setReady(ready) {
    buttons.forEach(function (button) {
      button.disabled = !ready || !storyPath;
    });
    findText.disabled = !ready || !storyPath;
    runFrotz.disabled = !ready || !storyPath;
    frotzInput.disabled = !ready || !storyPath || !frotzStarted;
    frotzSend.disabled = !ready || !storyPath || !frotzStarted;
  }

  function sendFrotzInput() {
    var input = frotzInput.value.trim();
    if (!input || !moduleInstance) return;
    frotzInput.value = "";
    printLines = [];
    var ptr = writeString(input);
    moduleInstance._ifwg_interp_step(ptr);
    moduleInstance._free(ptr);
    flushPrint("frotz");
  }

  function writeString(value) {
    var length = moduleInstance.lengthBytesUTF8(value) + 1;
    var pointer = moduleInstance._malloc(length);
    moduleInstance.stringToUTF8(value, pointer, length);
    return pointer;
  }

  function readAndFreeString(resultPtr) {
    if (!resultPtr) return "";
    var result = moduleInstance.UTF8ToString(resultPtr);
    moduleInstance._ifwg_free_string(resultPtr);
    return result;
  }

  function callStringMethod(exportName, storyPath) {
    var pathPtr = writeString(storyPath);
    var resultPtr = moduleInstance[exportName](pathPtr);
    moduleInstance._free(pathPtr);
    return readAndFreeString(resultPtr);
  }

  function callFindText(storyPath, query) {
    var pathPtr = writeString(storyPath);
    var queryPtr = writeString(query);
    var resultPtr = moduleInstance._ifwg_inspect_find_text(pathPtr, queryPtr);
    moduleInstance._free(pathPtr);
    moduleInstance._free(queryPtr);
    return readAndFreeString(resultPtr);
  }

  var methods = {
    header: "_ifwg_inspect_dump_header",
    objects: "_ifwg_inspect_dump_objects",
    tree: "_ifwg_inspect_dump_tree",
    dictionary: "_ifwg_inspect_dump_dictionary",
    disassembly: "_ifwg_inspect_dump_disassembly",
    full: "_ifwg_inspect_dump_full"
  };

  runFrotz.addEventListener("click", function () {
    frotzStarted = false;
    printLines = [];
    var pathPtr = writeString(storyPath);
    moduleInstance._ifwg_interp_start(pathPtr);
    moduleInstance._free(pathPtr);
    flushPrint("frotz");
    frotzStarted = true;
    setReady(true);
    frotzInput.focus();
  });

  frotzSend.addEventListener("click", sendFrotzInput);

  frotzInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendFrotzInput();
  });

  clearOutput.addEventListener("click", function () {
    output.innerHTML = "";
  });

  function ensureInputDirectory() {
    try {
      moduleInstance.FS.mkdir("/input");
    } catch (error) {
      if (!String(error).includes("File exists")) throw error;
    }
  }

  function writeStoryFile(file) {
    if (!moduleInstance) {
      appendOutput("error", "WASM module is not loaded yet.");
      return;
    }

    file.arrayBuffer().then(function (buffer) {
      ensureInputDirectory();
      storyPath = "/input/" + file.name;
      moduleInstance.FS.writeFile(storyPath, new Uint8Array(buffer));
      fileStatus.textContent = file.name + " (" + file.size + " bytes)";
      status.textContent = "Story file loaded.";
      appendOutput("file", file.name + " -> " + storyPath);
      setReady(true);
    }).catch(function (error) {
      appendOutput("error", String(error && error.stack ? error.stack : error));
    });
  }

  storyFile.addEventListener("change", function () {
    if (storyFile.files && storyFile.files[0]) writeStoryFile(storyFile.files[0]);
  });

  dropZone.addEventListener("dragover", function (event) {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });

  dropZone.addEventListener("dragleave", function () {
    dropZone.classList.remove("is-dragging");
  });

  dropZone.addEventListener("drop", function (event) {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      writeStoryFile(event.dataTransfer.files[0]);
    }
  });

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      printLines = [];
      var methodName = button.getAttribute("data-method");
      var exportName = methods[methodName];
      var result = callStringMethod(exportName, storyPath);
      flushPrint(methodName);
      if (result && result.trim()) appendOutput(methodName, result);
    });
  });

  findText.addEventListener("click", function () {
    var query = textQuery.value.trim();
    if (!query) { appendOutput("error", "Enter a search query."); return; }
    printLines = [];
    var result = callFindText(storyPath, query);
    flushPrint("find-text");
    appendOutput("find-text", result);
  });

  window.enteredRoom = function (title, description) {
    appendOutput("enteredRoom", "Title: " + title + "\n\nDescription:\n" + description.trim());
  };

  createIfwgModule({
    locateFile: function (path) {
      return "./public/wasm/" + path;
    },
    print: function (text) {
      printLines.push(text);
    },
    printErr: function (text) {
      appendOutput("stderr", text);
    }
  }).then(function (module) {
    moduleInstance = module;
    status.textContent = "WASM module loaded. Choose a story file.";
    setReady(true);
  }).catch(function (error) {
    status.textContent = "WASM module failed to load.";
    appendOutput("error", String(error && error.stack ? error.stack : error));
  });
})();

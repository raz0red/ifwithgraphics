(function () {
  var moduleInstance = null;
  var storyPath      = null;
  var started        = false;
  var fullDescription = "";

  var dropOverlay      = document.getElementById("dropOverlay");
  var player           = document.getElementById("player");
  var storyFile        = document.getElementById("storyFile");
  var statusRoom       = document.getElementById("statusRoom");
  var statusScore      = document.getElementById("statusScore");
  var sceneImg         = document.getElementById("sceneImg");
  var scenePlaceholder = document.getElementById("scenePlaceholder");
  var placeholderLabel = document.getElementById("placeholderLabel");
  var sceneText        = document.getElementById("sceneText");
  var cmdInput         = document.getElementById("cmdInput");
  var cmdDisplay       = document.getElementById("cmdDisplay");
  var cmdCursor        = document.getElementById("cmdCursor");
  var continueHint     = document.getElementById("continueHint");
  var prompt           = document.getElementById("cmdPrompt");
  var aiProvider       = document.getElementById("aiProvider");
  var aiKey            = document.getElementById("aiKey");

  /* ── Persist settings on change ────────────────────────────────────── */
  function saveSettings() {
    ImageGen.saveSettings(aiProvider.value, aiKey.value.trim());
  }

  aiProvider.addEventListener("change", saveSettings);
  aiKey.addEventListener("change", saveSettings);
  aiKey.addEventListener("blur", saveSettings);

  (function loadStoredSettings() {
    var s = ImageGen.loadSettings();
    if (s.provider) aiProvider.value = s.provider;
    if (s.apiKey)   aiKey.value      = s.apiKey;
  })();

  /* ── Paged text ─────────────────────────────────────────────────────── */
  var textPages = [];
  var pageIndex = 0;

  function linesPerPage() {
    var lineH = parseFloat(getComputedStyle(sceneText).lineHeight) ||
                parseFloat(getComputedStyle(sceneText).fontSize) * 1.4;
    return Math.max(1, Math.floor(sceneText.clientHeight / lineH));
  }

  function buildPages(text) {
    var per  = linesPerPage();
    var ctx2 = document.createElement("canvas").getContext("2d");
    var cs2  = getComputedStyle(sceneText);
    ctx2.font = cs2.fontSize + " " + cs2.fontFamily;
    var charW = ctx2.measureText("M").width || 10;
    var cpl   = Math.max(10, Math.floor(sceneText.clientWidth / charW));

    var lines  = text.split("\n");
    var pages  = [];
    var cur    = [];
    var count  = 0;

    function flush() {
      if (cur.length) { pages.push(cur.join("\n")); cur = []; count = 0; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line   = lines[i];
      var visual = Math.max(1, Math.ceil((line.length || 1) / cpl));
      if (count + visual > per) flush();
      cur.push(line);
      count += visual;
    }
    flush();
    return pages.length ? pages : [""];
  }

  function showPage(idx) {
    var last = idx >= textPages.length - 1;
    if (last) {
      sceneText.textContent    = fullDescription;
      sceneText.style.overflow = "auto";
      sceneText.scrollTop      = sceneText.scrollHeight;
      continueHint.hidden = true;
      prompt.hidden       = false;
      cmdDisplay.hidden   = false;
      cmdCursor.hidden    = false;
      cmdInput.disabled   = false;
      cmdInput.focus();
    } else {
      sceneText.textContent = textPages[idx];
      continueHint.hidden   = false;
      prompt.hidden         = true;
      cmdDisplay.hidden     = true;
      cmdCursor.hidden      = true;
      cmdInput.disabled     = true;
    }
  }

  player.addEventListener("click", function () {
    if (!cmdInput.disabled) cmdInput.focus();
  });

  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" && !continueHint.hidden) {
      e.preventDefault();
      pageIndex = Math.min(pageIndex + 1, textPages.length - 1);
      showPage(pageIndex);
    }
  });

  /* ── Scene image ────────────────────────────────────────────────────── */
  var sceneWrap      = document.querySelector(".scene-wrap");
  var diskLed        = document.getElementById("diskLed");
  var dotLabel       = document.getElementById("dotLabel");
  var ledTimer       = null;
  var dotTimer       = null;

  function startDiskAnimation() {
    var dotCount = 0;
    dotTimer = setInterval(function () {
      dotLabel.textContent = dotCount > 0 ? Array(dotCount + 1).join(".") : "";
      dotCount = (dotCount + 1) % 4;
    }, 1800);

    (function cycle() {
      /* ── Sustained read: LED on for a while ── */
      diskLed.classList.add("active");
      var burstMs = 250 + Math.random() * 500;

      /* ── Mid-burst flutter ~60% of the time ── */
      if (Math.random() < 0.6) {
        var flutterAt = burstMs * (0.35 + Math.random() * 0.4);
        ledTimer = setTimeout(function () {
          diskLed.classList.remove("active");
          ledTimer = setTimeout(function () {
            diskLed.classList.add("active");
            ledTimer = setTimeout(function () {
              diskLed.classList.remove("active");
              /* ── Seek pause before next burst ── */
              ledTimer = setTimeout(cycle, 180 + Math.random() * 550);
            }, burstMs - flutterAt);
          }, 18 + Math.random() * 35);
        }, flutterAt);
      } else {
        /* Clean burst, no flutter */
        ledTimer = setTimeout(function () {
          diskLed.classList.remove("active");
          ledTimer = setTimeout(cycle, 180 + Math.random() * 550);
        }, burstMs);
      }
    })();
  }

  function stopDiskAnimation() {
    clearInterval(dotTimer);
    clearTimeout(ledTimer);
    dotTimer = null;
    ledTimer = null;
    diskLed.classList.remove("active");
    dotLabel.textContent = "";
  }
  var currentRoomKey = null;
  var currentImageAR   = null;   /* aspect ratio of first loaded image */
  var playerWidthLocked = false; /* true after first image sets the width */

  function applyPlayerWidth(animated) {
    if (!currentImageAR) return;
    var newW = Math.min(sceneWrap.offsetHeight * currentImageAR, window.innerWidth);
    if (animated) {
      player.style.transition = "width 0.5s ease";
      setTimeout(function () { player.style.transition = ""; }, 550);
    }
    player.style.width = newW + "px";
  }

  window.addEventListener("resize", function () { applyPlayerWidth(false); });

  function showPlaceholder(label) {
    stopDiskAnimation();
    sceneImg.removeAttribute("src");
    sceneImg.hidden                = true;
    scenePlaceholder.style.display = "flex";
    placeholderLabel.textContent   = label || "";
    if (label === "LOADING IMAGE") startDiskAnimation();
  }

  function revealWithBlinds() {
    var STRIPS = 10;
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;pointer-events:none;";
    for (var i = 0; i < STRIPS; i++) {
      var s = document.createElement("div");
      s.style.cssText = "flex:1;background:#000;transform-origin:center;transition:transform 1.2s ease-in-out;";
      overlay.appendChild(s);
    }
    sceneWrap.appendChild(overlay);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (var i = 0; i < overlay.children.length; i++)
          overlay.children[i].style.transform = "scaleY(0)";
        setTimeout(function () { sceneWrap.removeChild(overlay); }, 1300);
      });
    });
  }

  function showImage(url, roomKey) {
    sceneImg.onload = function () {
      if (roomKey !== currentRoomKey) return; /* moved on while image was decoding */
      stopDiskAnimation();
      scenePlaceholder.style.display = "none";
      sceneImg.hidden = false;
      requestAnimationFrame(function () {
        if (!playerWidthLocked) {
          currentImageAR    = sceneImg.naturalWidth / sceneImg.naturalHeight;
          playerWidthLocked = true;
          applyPlayerWidth(true);
        }
        revealWithBlinds();
      });
    };
    sceneImg.onerror = function () { showPlaceholder(""); };
    sceneImg.src = url;
  }

  /* ── Room callback ──────────────────────────────────────────────────── */
  window.enteredRoom = function (id, title, description, statusRight) {
    statusRoom.textContent  = title;
    statusScore.textContent = statusRight || "";

    var roomKey = String(id);
    if (roomKey !== currentRoomKey) {
      currentRoomKey = roomKey;
      (function (genKey) {
        ImageGen.generate(id, title, description, function () {
          if (genKey !== currentRoomKey) return;
          showPlaceholder("LOADING IMAGE");
        })
          .then(function (url) {
            if (genKey !== currentRoomKey) return; /* moved on — discard */
            if (url) showImage(url, genKey);
            else     showPlaceholder("");
          })
          .catch(function (err) {
            if (genKey !== currentRoomKey) return;
            console.error("ImageGen error:", err && err.message || err);
            showPlaceholder("ERROR");
          });
      })(roomKey);
    }

    /* Text pages — collapse frotz word-wrap newlines but keep intentional breaks */
    fullDescription = (function (text) {
      var WRAP_W = 60;
      var lines  = text.replace(/\r\n/g, "\n").split("\n");
      var out    = [];
      for (var i = 0; i < lines.length; i++) {
        if (i === 0 || lines[i - 1].length < WRAP_W) {
          out.push(lines[i]);              /* intentional break — keep */
        } else {
          out[out.length - 1] += " " + lines[i]; /* word-wrap — join */
        }
      }
      return out.join("\n").trim();
    })(description);
    sceneText.style.overflow = "hidden";
    requestAnimationFrame(function () {
      textPages = buildPages(fullDescription);
      pageIndex = 0;
      showPage(0);
    });
  };

  /* ── Send command ───────────────────────────────────────────────────── */
  function sendCommand() {
    var cmd = cmdInput.value.trim();
    if (!cmd || !started) return;
    cmdInput.value        = "";
    cmdDisplay.textContent = "";
    cmdInput.disabled     = true;
    prompt.hidden         = true;
    cmdDisplay.hidden     = true;
    cmdCursor.hidden      = true;
    var ptr = writeString(cmd);
    moduleInstance._ifwg_interp_step(ptr);
    moduleInstance._free(ptr);
  }

  cmdInput.addEventListener("input", function () {
    cmdDisplay.textContent = cmdInput.value.toUpperCase();
  });

  cmdInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendCommand();
  });

  /* ── WASM helpers ───────────────────────────────────────────────────── */
  function writeString(s) {
    var len = moduleInstance.lengthBytesUTF8(s) + 1;
    var ptr = moduleInstance._malloc(len);
    moduleInstance.stringToUTF8(s, ptr, len);
    return ptr;
  }

  function startGame() {
    if (!moduleInstance || !storyPath) return;
    cmdInput.disabled = true;
    prompt.hidden     = true;
    var ptr = writeString(storyPath);
    moduleInstance._ifwg_interp_start(ptr);
    moduleInstance._free(ptr);
    started = true;
  }

  /* ── File handling ──────────────────────────────────────────────────── */
  function loadFile(file) {
    if (!moduleInstance) return;
    file.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      crypto.subtle.digest("SHA-256", buf).then(function (hashBuf) {
        var hex = Array.from(new Uint8Array(hashBuf))
          .map(function (b) { return b.toString(16).padStart(2, "0"); })
          .join("");
        ImageGen.setGame(hex);
        saveSettings();
        try { moduleInstance.FS.mkdir("/input"); } catch (_) {}
        storyPath = "/input/" + file.name;
        moduleInstance.FS.writeFile(storyPath, bytes);
        dropOverlay.style.display = "none";
        player.hidden = false;
        startGame();
      });
    });
  }

  storyFile.addEventListener("change", function () {
    if (storyFile.files && storyFile.files[0]) loadFile(storyFile.files[0]);
  });

  dropOverlay.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropOverlay.classList.add("is-dragging");
  });
  dropOverlay.addEventListener("dragleave", function () {
    dropOverlay.classList.remove("is-dragging");
  });
  dropOverlay.addEventListener("drop", function (e) {
    e.preventDefault();
    dropOverlay.classList.remove("is-dragging");
    if (e.dataTransfer.files && e.dataTransfer.files[0])
      loadFile(e.dataTransfer.files[0]);
  });

  /* ── Boot WASM ──────────────────────────────────────────────────────── */
  createIfwgModule({
    locateFile: function (p) { return "./public/wasm/" + p; },
    print:    function () {},
    printErr: function () {}
  }).then(function (mod) {
    moduleInstance = mod;
  }).catch(function () {
    placeholderLabel.textContent = "WASM LOAD FAILED";
  });
})();

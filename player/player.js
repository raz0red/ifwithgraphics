/* Emscripten's stdin TTY handler calls window.prompt("Input: ") when frotz
   reads a single char via fgetc (os_read_key — press-any-key, Y/N prompts).
   Returning "" makes Emscripten feed '\n' to fgetc, which most games accept
   as an Enter / "any key" press, without showing a native browser dialog. */
(function () { var _np = window.prompt; window.prompt = function (m, d) { if (m === "Input: ") return ""; return _np ? _np.call(window, m, d) : ""; }; })();

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
  var sceneTextInner   = document.getElementById("sceneTextInner");
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

  /* ── Text display ──────────────────────────────────────────────────── */
  var sliding          = false;
  var scrollAnimating  = false;
  var contentCompleted = false;   /* true once the bottom has been reached */
  var awaitingKeyPress = false;   /* true when os_read_key yielded (any-key mode) */

  function showCursor(on) {
    cmdCursor.classList.toggle("shown", on);
  }

  /* Shrink sceneText height to the largest exact multiple of lineH that fits,
     so scrollTop multiples of (n×lineH) land perfectly on line boundaries. */
  function calibrateTextHeight() {
    sceneText.style.height = "";           /* reset to CSS-computed value first */
    var cs    = getComputedStyle(sceneText);
    var pt    = parseFloat(cs.paddingTop) || 0;
    var lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    var n     = Math.max(1, Math.floor((sceneText.clientHeight - pt) / lineH));
    sceneText.style.height = Math.round(pt + n * lineH) + "px";
  }

  /* Three display states:
     1. More content below  → "PRESS SPACE TO CONTINUE" hint
     2. awaitingKeyPress    → "PRESS ANY KEY TO CONTINUE" hint (any keydown fires step)
     3. contentCompleted    → prompt (sticky — scrolling back up keeps it) */
  function updateUI() {
    if (sliding || scrollAnimating) return;
    var atBottom = sceneText.scrollHeight <= sceneText.scrollTop + sceneText.clientHeight + 2;
    if (atBottom) {
      if (awaitingKeyPress) {
        continueHint.textContent = "PRESS ANY KEY TO CONTINUE";
        continueHint.hidden = false;
        prompt.hidden       = true;
        cmdDisplay.hidden   = true;
        showCursor(false);
        cmdInput.disabled   = true;
        return;
      }
      contentCompleted    = true;
      continueHint.hidden = true;
      prompt.hidden       = false;
      cmdDisplay.hidden   = false;
      showCursor(true);
      cmdInput.disabled   = false;
      cmdInput.focus();
      return;
    }
    if (contentCompleted) {
      continueHint.hidden = true;
      prompt.hidden       = false;
      cmdDisplay.hidden   = false;
      showCursor(true);
      cmdInput.disabled   = false;
      cmdInput.focus();
      return;
    }
    continueHint.textContent = "PRESS SPACE TO CONTINUE";
    continueHint.hidden = false;
    prompt.hidden       = true;
    cmdDisplay.hidden   = true;
    showCursor(false);
    cmdInput.disabled   = true;
  }

  /* Scroll forward one page.  Page size = n×lineH (integer multiple of lineH)
     so that every page boundary is a clean line boundary with no partial line. */
  function scrollDownAnimated() {
    if (scrollAnimating || sliding) return;

    var cs    = getComputedStyle(sceneText);
    var pt    = parseFloat(cs.paddingTop) || 0;
    var lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    var H     = sceneText.clientHeight;
    var n     = Math.max(1, Math.floor((H - pt) / lineH));
    var pageH = n * lineH;

    var currentPage = Math.round(sceneText.scrollTop / pageH);
    var targetTop   = Math.min(
      Math.round((currentPage + 1) * pageH),
      sceneText.scrollHeight - H
    );

    if (targetTop <= sceneText.scrollTop + 1) {
      scrollAnimating = false;
      updateUI();
      return;
    }

    scrollAnimating     = true;
    continueHint.hidden = true;

    var startTop  = sceneText.scrollTop;
    var startTime = null;
    var duration  = n * 160;

    function step(ts) {
      if (!startTime) startTime = ts;
      var t = Math.min((ts - startTime) / duration, 1);
      sceneText.scrollTop = Math.round(startTop + (targetTop - startTop) * t);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        sceneText.scrollTop = targetTop;
        scrollAnimating = false;
        updateUI();
      }
    }
    requestAnimationFrame(step);
  }

  /* Re-evaluate hint/prompt when the user manually scrolls. */
  sceneText.addEventListener("scroll", updateUI);

  /* Manual scroll (mouse wheel / trackpad) — overflow:hidden clips partial
     lines but blocks native scroll, so we drive it ourselves here. */
  sceneText.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (scrollAnimating || sliding) return;
    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 20;        /* line mode → pixels */
    if (e.deltaMode === 2) delta *= sceneText.clientHeight; /* page mode */
    sceneText.scrollTop = Math.max(0, Math.min(
      sceneText.scrollTop + delta,
      sceneText.scrollHeight - sceneText.clientHeight
    ));
    updateUI();
  }, { passive: false });

  /* Slide new content in from below. curPane captures whatever the user
     currently sees (accounting for scrollTop), nxtPane is the new text. */
  function slideToContent(newText) {
    contentCompleted = false;
    awaitingKeyPress = false;
    sliding = true;
    showCursor(false);
    continueHint.hidden = true;
    prompt.hidden = true; cmdDisplay.hidden = true;
    cmdInput.disabled = true;

    var cs       = getComputedStyle(sceneText);
    var rect     = sceneText.getBoundingClientRect();
    var H        = sceneText.clientHeight;
    var lineH    = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    var duration = Math.max(1, Math.floor(H / lineH)) * 160;

    var blw  = parseFloat(cs.borderLeftWidth) || 0;
    var btw  = parseFloat(cs.borderTopWidth)  || 0;
    var clip = document.createElement("div");
    clip.style.cssText = [
      "position:fixed",
      "top:"    + (rect.top  + btw) + "px",
      "left:"   + (rect.left + blw) + "px",
      "width:"  + sceneText.clientWidth  + "px",
      "height:" + H + "px",
      "overflow:hidden",
      "z-index:50",
      "pointer-events:none"
    ].join(";");

    var textStyle = [
      "padding:"        + cs.padding,
      "white-space:"    + cs.whiteSpace,
      "font-family:"    + cs.fontFamily,
      "font-size:"      + cs.fontSize,
      "letter-spacing:" + cs.letterSpacing,
      "line-height:"    + cs.lineHeight,
      "text-transform:" + cs.textTransform,
      "color:"          + cs.color,
      "box-sizing:border-box"
    ].join(";");

    /* curPane shows the currently visible portion (user may have scrolled). */
    var scrollOff = sceneText.scrollTop;
    var curPane   = document.createElement("div");
    curPane.style.cssText = "background:#000;height:" + H + "px;overflow:hidden;";
    var curInner  = document.createElement("div");
    curInner.style.cssText = textStyle + ";height:auto;margin-top:-" + scrollOff + "px;";
    curInner.textContent   = sceneTextInner.textContent;
    curPane.appendChild(curInner);

    var nxtPane = document.createElement("div");
    nxtPane.style.cssText = "background:#000;height:" + H + "px;overflow:hidden;" + textStyle;
    nxtPane.textContent   = newText;

    var slide = document.createElement("div");
    slide.appendChild(curPane);
    slide.appendChild(nxtPane);
    clip.appendChild(slide);
    document.body.appendChild(clip);

    /* Pre-load new content into sceneText (hidden behind clip). */
    sceneTextInner.textContent = newText;
    sceneText.scrollTop = 0;

    function finish() {
      document.body.removeChild(clip);
      sliding = false;
      updateUI();
    }

    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var t = Math.min((ts - startTime) / duration, 1);
      slide.style.transform = "translateY(-" + Math.round(H * t) + "px)";
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        requestAnimationFrame(finish);
      }
    }
    requestAnimationFrame(step);
  }

  player.addEventListener("click", function () {
    if (!cmdInput.disabled) cmdInput.focus();
  });

  /* SPACE: scroll forward one page (line-snapped, animated). */
  document.addEventListener("keydown", function (e) {
    /* Any-key mode: any keydown (except modifier-only) fires the step. */
    if (awaitingKeyPress && !continueHint.hidden) {
      var atBottom = sceneText.scrollHeight <= sceneText.scrollTop + sceneText.clientHeight + 2;
      if (atBottom) {
        if (e.key === "Control" || e.key === "Alt" || e.key === "Shift" || e.key === "Meta") return;
        e.preventDefault();
        awaitingKeyPress = false;
        if (moduleInstance) {
          var ptr = writeString("");
          moduleInstance._ifwg_interp_step(ptr);
          moduleInstance._free(ptr);
        }
        return;
      }
    }
    if (e.code === "Space" && !continueHint.hidden) {
      e.preventDefault();
      scrollDownAnimated();
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
      diskLed.classList.add("active");
      var burstMs = 250 + Math.random() * 500;

      if (Math.random() < 0.6) {
        var flutterAt = burstMs * (0.35 + Math.random() * 0.4);
        ledTimer = setTimeout(function () {
          diskLed.classList.remove("active");
          ledTimer = setTimeout(function () {
            diskLed.classList.add("active");
            ledTimer = setTimeout(function () {
              diskLed.classList.remove("active");
              ledTimer = setTimeout(cycle, 180 + Math.random() * 550);
            }, burstMs - flutterAt);
          }, 18 + Math.random() * 35);
        }, flutterAt);
      } else {
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
  var currentImageAR   = null;
  var playerWidthLocked = false;

  function applyPlayerWidth(animated) {
    if (!currentImageAR) return;
    var newW = Math.min(sceneWrap.offsetHeight * currentImageAR, window.innerWidth);
    if (animated) {
      player.style.transition = "width 0.5s ease";
      setTimeout(function () { player.style.transition = ""; }, 550);
    }
    player.style.width = newW + "px";
  }

  window.addEventListener("resize", function () {
    applyPlayerWidth(false);
    calibrateTextHeight();
  });

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
      if (roomKey !== currentRoomKey) return;
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
  window.enteredRoom = function (id, title, description, statusRight, isKeyPress) {
    awaitingKeyPress = !!isKeyPress;
    statusRoom.textContent  = title;
    statusScore.textContent = statusRight || "";

    var roomKey = id > 0 ? String(id) : (title || "0");
    var wordCount = description.trim().split(/\s+/).length;
    if (roomKey !== currentRoomKey) {
      currentRoomKey = roomKey;
      (function (genKey) {
        if (wordCount < 25) { return; }
        ImageGen.generate(roomKey, title, description, function () {
          if (genKey !== currentRoomKey) return;
          showPlaceholder("LOADING IMAGE");
        })
          .then(function (url) {
            if (genKey !== currentRoomKey) return;
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

    /* Collapse frotz word-wrap newlines but keep intentional paragraph breaks. */
    fullDescription = (function (text) {
      var WRAP_W = 60;
      var lines  = text.replace(/\r\n/g, "\n").split("\n");
      var out    = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var prev = lines[i - 1] || "";
        var joinWrap   = i > 0 && prev.length >= WRAP_W;
        var joinOrphan = i > 0 && /^\s*[^\w\s]\s*$/.test(line) && out.length > 0;
        if (joinWrap || joinOrphan) {
          out[out.length - 1] += (joinOrphan ? "" : " ") + line.trim();
        } else {
          out.push(line);
        }
      }
      return out.join("\n").trim();
    })(description);

    /* First room: direct display (fonts should be ready by game-start time).
       Subsequent rooms: slide animation from whatever the user last saw. */
    if (sceneTextInner.textContent) {
      slideToContent(fullDescription);
    } else {
      contentCompleted = false;
      calibrateTextHeight();
      sceneTextInner.textContent = fullDescription;
      sceneText.scrollTop = 0;
      updateUI();
    }
  };

  /* ── Send command ───────────────────────────────────────────────────── */
  function sendCommand() {
    var cmd = cmdInput.value.trim();
    if (!cmd || !started) return;
    cmdInput.value         = "";
    cmdDisplay.textContent = "";
    cmdInput.disabled      = true;
    prompt.hidden          = true;
    cmdDisplay.hidden      = true;
    showCursor(false);
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

  /* Calibrate once fonts are ready so lineH is accurate. */
  document.fonts.ready.then(calibrateTextHeight);

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

import { render }        from "./render.js";
import { createEngine }  from "./engine.js";
import { createTextUI }  from "./ui/text.js";
import { createImageUI } from "./ui/image.js";
import { createInputUI } from "./ui/input.js";
import { ImageGen }      from "./imagegen/index.js";
import { IFWGConfig }    from "./config.js";

/* Collapse frotz word-wrap newlines but keep intentional paragraph breaks. */
function processDescription(text) {
  var WRAP_W = 60;
  var lines  = text.replace(/\r\n/g, "\n").split("\n");
  var out    = [];
  for (var i = 0; i < lines.length; i++) {
    var line       = lines[i];
    var prev       = lines[i - 1] || "";
    var joinWrap   = i > 0 && prev.length >= WRAP_W;
    var joinOrphan = i > 0 && /^\s*[^\w\s]\s*$/.test(line) && out.length > 0;
    if (joinWrap || joinOrphan) {
      out[out.length - 1] += (joinOrphan ? "" : " ") + line.trim();
    } else {
      out.push(line);
    }
  }
  return out.join("\n").trim();
}

export var IFWGPlayer = {
  create: function (container, config) {
    if (!(config instanceof IFWGConfig)) {
      throw new Error("IFWGPlayer.create: config must be an instance of IFWGConfig");
    }

    var el = render(container);

    var state = {
      sliding:          false,
      scrollAnimating:  false,
      contentCompleted: false,
      awaitingKeyPress: false,
      started:          false,
      storyPath:        null,
      currentRoomKey:   null
    };

    /* Seed ImageGen with whatever the config reports. */
    ImageGen.saveSettings(config.getProvider(), config.getApiKey());

    /* ── UI modules ─────────────────────────────────────────────────── */
    var inputUI = createInputUI(el, state, sendCommand);
    var textUI  = createTextUI(el, state, inputUI.showCursor);
    var imageUI = createImageUI(el, state, textUI.calibrateTextHeight);

    /* ── Settings wiring (drop-overlay) ─────────────────────────────── */
    el.aiProvider.value = config.getProvider();
    el.aiKey.value      = config.getApiKey();

    function onSettingsPersist() {
      var settings = { provider: el.aiProvider.value, apiKey: el.aiKey.value.trim() };
      ImageGen.saveSettings(settings.provider, settings.apiKey);
      config.onSettingsChange(settings);
    }
    el.aiProvider.addEventListener("change", onSettingsPersist);
    el.aiKey.addEventListener("change",      onSettingsPersist);
    el.aiKey.addEventListener("blur",        onSettingsPersist);

    /* ── Room callback ───────────────────────────────────────────────── */
    function onRoomEntered(id, title, description, statusRight, isKeyPress) {
      state.awaitingKeyPress    = !!isKeyPress;
      el.statusRoom.textContent  = title;
      el.statusScore.textContent = statusRight || "";

      var roomKey   = id > 0 ? String(id) : (title || "0");
      var wordCount = description.trim().split(/\s+/).length;

      if (roomKey !== state.currentRoomKey) {
        state.currentRoomKey = roomKey;
        (function (genKey) {
          if (wordCount < 25) return;
          ImageGen.generate(roomKey, title, description, function () {
            if (genKey !== state.currentRoomKey) return;
            imageUI.showPlaceholder("LOADING IMAGE");
          })
          .then(function (url) {
            if (genKey !== state.currentRoomKey) return;
            if (url) imageUI.showImage(url, genKey);
            else     imageUI.showPlaceholder("");
          })
          .catch(function (err) {
            if (genKey !== state.currentRoomKey) return;
            console.error("ImageGen error:", err && err.message || err);
            imageUI.showPlaceholder("ERROR");
          });
        })(roomKey);
      }

      var processed = processDescription(description);

      if (el.sceneTextInner.textContent) {
        textUI.slideToContent(processed);
      } else {
        state.contentCompleted        = false;
        textUI.calibrateTextHeight();
        el.sceneTextInner.textContent = processed;
        el.sceneText.scrollTop        = 0;
        textUI.updateUI();
      }
    }

    /* ── Engine ──────────────────────────────────────────────────────── */
    var engine = createEngine(config.getWasmPath(), onRoomEntered, function (filename, bytes) {
      config.onSave(filename, bytes);
    });

    /* ── Send command ────────────────────────────────────────────────── */
    function sendCommand() {
      var cmd = el.cmdInput.value.trim();
      if (!cmd || !state.started) return;
      el.cmdInput.value         = "";
      el.cmdDisplay.textContent = "";
      el.cmdInput.disabled      = true;
      el.cmdPrompt.hidden       = true;
      el.cmdDisplay.hidden      = true;
      inputUI.showCursor(false);
      engine.step(cmd);
    }

    /* ── Keydown: SPACE to scroll, any key in any-key mode ───────────── */
    document.addEventListener("keydown", function (e) {
      if (state.awaitingKeyPress && !el.continueHint.hidden) {
        var atBottom = el.sceneText.scrollHeight <= el.sceneText.scrollTop + el.sceneText.clientHeight + 2;
        if (atBottom) {
          if (e.key === "Control" || e.key === "Alt" || e.key === "Shift" || e.key === "Meta") return;
          e.preventDefault();
          state.awaitingKeyPress = false;
          engine.step("");
          return;
        }
      }
      if (e.code === "Space" && !el.continueHint.hidden) {
        e.preventDefault();
        textUI.scrollDownAnimated();
      }
    });

    /* ── File loading ────────────────────────────────────────────────── */
    function loadFile(file) {
      file.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        crypto.subtle.digest("SHA-256", buf).then(function (hashBuf) {
          var hex = Array.from(new Uint8Array(hashBuf))
            .map(function (b) { return b.toString(16).padStart(2, "0"); })
            .join("");
          ImageGen.setGame(hex);

          state.storyPath = "/input/" + file.name;
          engine.writeFile(state.storyPath, bytes);

          el.dropOverlay.style.display = "none";
          el.player.hidden = false;

          var savePath = state.storyPath + ".qzl";
          config.onRestore(savePath, function (saveBytes) {
            if (saveBytes) engine.writeSave(savePath, saveBytes);
            state.started = true;
            engine.start(state.storyPath);
            config.onGameLoaded(hex, file.name);
          });
        });
      });
    }

    el.storyFile.addEventListener("change", function () {
      if (el.storyFile.files && el.storyFile.files[0]) loadFile(el.storyFile.files[0]);
    });
    el.dropOverlay.addEventListener("dragover", function (e) {
      e.preventDefault();
      el.dropOverlay.classList.add("is-dragging");
    });
    el.dropOverlay.addEventListener("dragleave", function () {
      el.dropOverlay.classList.remove("is-dragging");
    });
    el.dropOverlay.addEventListener("drop", function (e) {
      e.preventDefault();
      el.dropOverlay.classList.remove("is-dragging");
      if (e.dataTransfer.files && e.dataTransfer.files[0])
        loadFile(e.dataTransfer.files[0]);
    });

    /* ── Boot ────────────────────────────────────────────────────────── */
    document.fonts.ready.then(textUI.calibrateTextHeight);

    engine.init().catch(function () {
      imageUI.showPlaceholder("WASM LOAD FAILED");
    });

    return { loadFile: loadFile };
  }
};

import { render }        from "./render.js";
import { createEngine }  from "./engine.js";
import { createTextUI }  from "./ui/text.js";
import { createImageUI } from "./ui/image.js";
import { createInputUI } from "./ui/input.js";
import { ImageGen }      from "./imagegen/index.js";
import { IFWGConfig }    from "./config.js";
import { Game }          from "./game.js";

/* Read Z-machine release.serial from raw bytes — stable game identity. */
function readGameId(bytes) {
  var release = (bytes[2] << 8) | bytes[3];
  var serial  = String.fromCharCode(
    bytes[0x12], bytes[0x13], bytes[0x14],
    bytes[0x15], bytes[0x16], bytes[0x17]
  );
  return release + "." + serial;
}

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

    /* ── UI modules ─────────────────────────────────────────────────── */
    var inputUI = createInputUI(el, state, sendCommand);
    var textUI  = createTextUI(el, state, inputUI.showCursor);
    var imageUI = createImageUI(el, state, textUI.calibrateTextHeight);

    /* ── Room callback ───────────────────────────────────────────────── */
    function onRoomEntered(id, title, description, statusRight, isKeyPress) {
      state.awaitingKeyPress     = !!isKeyPress;
      el.statusRoom.textContent  = title;
      el.statusScore.textContent = statusRight || "";

      var roomKey   = id > 0 ? String(id) : (title || "0");
      var wordCount = description.trim().split(/\s+/).length;

      if (roomKey !== state.currentRoomKey) {
        state.currentRoomKey = roomKey;
        (function (genKey) {
          /* Pass onCacheMiss only when the description is substantial enough
             to warrant an API call. Cache hits are always served. */
          var canGenerate = wordCount >= 25;
          ImageGen.generate(
            roomKey, title, description,
            canGenerate ? function () {
              if (genKey !== state.currentRoomKey) return;
              imageUI.showPlaceholder("LOADING IMAGE");
            } : null
          )
          .then(function (url) {
            if (genKey !== state.currentRoomKey) return;
            if (url)              imageUI.showImage(url, genKey);
            else if (canGenerate) imageUI.showPlaceholder("");
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

    /* ── Boot ────────────────────────────────────────────────────────── */
    document.fonts.ready.then(textUI.calibrateTextHeight);

    engine.init().catch(function () {
      imageUI.showPlaceholder("WASM LOAD FAILED");
    });

    /* ── loadGame ────────────────────────────────────────────────────── */
    function startWithBuffer(buf, filename) {
      var bytes  = new Uint8Array(buf);
      var gameId = readGameId(bytes);
      Game.setId(gameId);

      state.storyPath  = "/input/" + filename;
      engine.writeFile(state.storyPath, bytes);
      el.player.hidden = false;

      var savePath = state.storyPath + ".qzl";
      config.onRestore(savePath, function (saveBytes) {
        if (saveBytes) engine.writeSave(savePath, saveBytes);
        state.started = true;
        engine.start(state.storyPath);
        config.onGameLoaded(gameId, filename);
      });
    }

    function loadGame(source, name) {
      if (source instanceof File) {
        source.arrayBuffer().then(function (buf) {
          startWithBuffer(buf, source.name);
        });
      } else if (typeof source === "string") {
        var filename = name || source.split("/").pop() || "game.z5";
        fetch(source).then(function (r) { return r.arrayBuffer(); })
          .then(function (buf) { startWithBuffer(buf, filename); });
      } else if (source instanceof ArrayBuffer) {
        startWithBuffer(source, name || "game.z5");
      } else if (source instanceof Uint8Array) {
        startWithBuffer(source.buffer, name || "game.z5");
      }
    }

    return { loadGame: loadGame };
  }
};

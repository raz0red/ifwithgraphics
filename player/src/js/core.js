import { render } from "./render.js";
import { createEngine } from "./engine.js";
import { createTextUI } from "./ui/text.js";
import { createImageUI } from "./ui/image.js";
import { createInputUI } from "./ui/input.js";
import { createGridUI } from "./ui/grid.js";
import { ImageGen, GAMES, ALIASES } from "./imagegen/index.js";
import { TITLE_FALLBACKS } from "../context/titleFallbacks.js";
import { IFWGConfig, StandaloneConfig } from "./config.js";
import { Game } from "./game.js";
import { renderLaunchPanel } from "./launchPanel.js";

/* Read Z-machine release.serial from raw bytes — stable game identity. */
function readGameId(bytes) {
  const release = (bytes[2] << 8) | bytes[3];
  const serial = String.fromCharCode(
    bytes[0x12],
    bytes[0x13],
    bytes[0x14],
    bytes[0x15],
    bytes[0x16],
    bytes[0x17]
  );
  return `${release}.${serial}`;
}

/* Strip dynamic status-bar suffixes to get the bare room name. Status bars
   right-align their score/time/custom-stat text with a wide run of padding
   spaces after the room name — stripping at the first 2+-space gap handles
   any game's custom stat label (e.g. Bureaucracy's "Blood Pressure: 135/87"),
   not just the common Time/Score/Moves/Turns names. The named-label pattern
   stays as a fallback for status bars that don't pad with multiple spaces. */
function roomName(title) {
  return title
    .replace(/\s{2,}.*$/, "")
    .replace(/\s+(Time|Score|Moves|Turns):.*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* Every real room title across our cataloged games is well under 30
   characters ("Reactor Lobby", "Wharf Road", "Crew's Quarters"). During a
   narrative cutscene — before the game has a real "current room" at all —
   the status-bar text-capture can end up scraping a fragment of scrolling
   prose instead (e.g. "Y'Gael's dry chuckle stilled the murmur of the
   crowd. \"You forget your own"), which is technically non-empty but not a
   room name by any reasonable definition. Reject anything implausibly long
   rather than treating scraped prose as a real title. */
function isPlausibleRoomTitle(title) {
  return !!title && title.length <= 40;
}

/* Z-machine special key codes (frotz.h ZC_*) — a single-keystroke read
   (@read_char) can be a real menu (Beyond Zork's stat allocation, Bureaucracy's
   form editing) that needs the actual key, not just "any key = continue".
   String.fromCharCode round-trips correctly through the WASM bridge's UTF-8
   encode/decode (frotz is built with USE_UTF8) back to the matching zchar. */
function zcharForKeydown(e) {
  switch (e.key) {
    case "ArrowUp":
      return String.fromCharCode(0x81);
    case "ArrowDown":
      return String.fromCharCode(0x82);
    case "ArrowLeft":
      return String.fromCharCode(0x83);
    case "ArrowRight":
      return String.fromCharCode(0x84);
    case "Escape":
      return String.fromCharCode(0x1b);
    case "Backspace":
      return String.fromCharCode(0x08);
    case "Enter":
      return "\r";
    case "Tab":
      return null;
    default:
      return e.key.length === 1 ? e.key : null;
  }
}

/* Collapse frotz word-wrap newlines but keep intentional paragraph breaks. */
function processDescription(text) {
  const WRAP_W = 60;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = lines[i - 1] || "";
    const joinWrap = i > 0 && prev.length >= WRAP_W;
    const joinOrphan = i > 0 && /^\s*[^\w\s]\s*$/.test(line) && out.length > 0;
    if (joinWrap || joinOrphan) {
      out[out.length - 1] += (joinOrphan ? "" : " ") + line.trim();
    } else {
      out.push(line);
    }
  }
  return out.join("\n").trim();
}

export const IFWGPlayer = {
  create(container, config) {
    if (!(config instanceof IFWGConfig)) {
      throw new Error("IFWGPlayer.create: config must be an instance of IFWGConfig");
    }

    const el = render(container);

    const state = {
      sliding: false,
      scrollAnimating: false,
      contentCompleted: false,
      awaitingKeyPress: false,
      started: false,
      storyPath: null,
      currentRoomKey: null,
      pendingRoomKey: null,
      pendingTitle: null,
      pendingDesc: null,
      pendingTimer: null,
      lastTitle: null
    };

    /* ── UI modules ─────────────────────────────────────────────────── */
    const inputUI = createInputUI(el, state, sendCommand);
    const textUI = createTextUI(el, state, inputUI.showCursor);
    const imageUI = createImageUI(el, state, textUI.calibrateTextHeight);
    const gridUI = createGridUI(el);

    /* ── Room callback ───────────────────────────────────────────────── */
    function onRoomEntered({
      id,
      title,
      description,
      statusRight,
      isKeyPress,
      cursorPrompt,
      fullScreen,
      cursorRow,
      cursorCol,
      styleMask,
      sensoryPanel,
      statsLine
    }) {
      state.awaitingKeyPress = !!isKeyPress;
      el.statusRoom.textContent = title;
      el.statusScore.textContent = statusRight || "";
      el.cmdPrompt.textContent = cursorPrompt ? cursorPrompt : ">";

      if (sensoryPanel && sensoryPanel.trim()) {
        el.sensoryPanel.textContent = sensoryPanel.replace(/\n+$/, "");
        el.sensoryPanel.hidden = false;
      } else {
        el.sensoryPanel.hidden = true;
      }

      /* Beyond Zork's attribute line lives in its own persistent status
         window in the real game — it only reaches us on the turn it
         happens to get redrawn, so once shown, keep showing the last known
         value instead of hiding it the moment a turn doesn't redraw it. */
      if (statsLine && statsLine.trim()) {
        el.statsLine.textContent = statsLine.trim();
        el.statsLine.hidden = false;
        el.player.classList.add("has-stats-line");
      }

      if (isKeyPress) {
        /* @read_char-driven forms/menus (Bureaucracy's field entry, Beyond
           Zork's character menu) are absolute-position screens — the
           game's own row/column layout IS the content. Render the real
           screen buffer verbatim instead of trying to reconstruct meaning
           from the lossy, changed-rows-only description stream (see
           doutput.c's show_row/ifwg_desc_append). No image generation and
           no narrative text UI while one of these is up — it isn't a room. */
        el.sceneText.hidden = true;
        el.sceneWrap.hidden = true;
        gridUI.show();
        gridUI.render(fullScreen, cursorRow, cursorCol, styleMask);
        textUI.updateUI();
        return;
      }
      gridUI.hide();
      el.sceneText.hidden = false;
      el.sceneWrap.hidden = false;

      /* id comes from the WASM bridge's best-effort room lookup — spec-
         guaranteed for V1-V3 (Global Variable 0), but for V4+ it's a scan
         for an object whose short name matches the status-bar title, which
         can legitimately fail (id=0) for some rooms/games. Falling back to
         null here — as this used to — meant the whole image pipeline
         silently never ran for that room. Fall back to the title itself so
         a room lookup still happens even when the id lookup comes up empty.

         Plausibility must be checked on the cleaned title, not the raw one —
         roomName() only strips a fixed list of known status suffixes
         (Time/Score/Moves/Turns:), so a game with its own custom status
         stat (e.g. Bureaucracy's "Blood Pressure: 135/87") leaves that
         suffix attached to the raw title, pushing every single title over
         the 40-char plausibility limit and silently killing image
         generation for the entire game. */
      const titleFallback = TITLE_FALLBACKS[ALIASES[Game.getId()]];
      const cleanedTitle = titleFallback
        ? titleFallback(title, roomName(title), description, state)
        : roomName(title);
      const roomKey =
        id > 0 ? String(id) : isPlausibleRoomTitle(cleanedTitle) ? `title:${cleanedTitle}` : null;

      const wordCount = description.trim().split(/\s+/).length;

      console.info(
        "[IFWG] room entered — id:%o title:%o roomKey:%o wordCount:%o same:%o isKeyPress:%o cursorPrompt:%o desc:%o",
        id,
        title,
        roomKey,
        wordCount,
        roomKey === state.currentRoomKey,
        isKeyPress,
        cursorPrompt,
        description.substring(0, 80)
      );

      if (roomKey) {
        const isNewRoom = roomKey !== state.currentRoomKey;
        if (isNewRoom) {
          state.currentRoomKey = roomKey;
          if (state.pendingTimer) {
            clearTimeout(state.pendingTimer);
            state.pendingTimer = null;
          }
        }
        /* Debounce only during the settling window: on room change, or while the timer
           is still running (preamble yields same room twice before the real description). */
        if (isNewRoom || state.pendingTimer !== null) {
          state.pendingRoomKey = roomKey;
          state.pendingTitle = cleanedTitle;
          state.pendingDesc = description;
          if (state.pendingTimer) clearTimeout(state.pendingTimer);
          state.pendingTimer = setTimeout(() => {
            state.pendingTimer = null;
            const genKey = state.pendingRoomKey;
            if (genKey !== state.currentRoomKey) return;
            const desc = state.pendingDesc;
            const ttl = state.pendingTitle;
            const wc = desc.trim().split(/\s+/).length;
            const canGenerate = wc >= 10;
            console.info("[IFWG] image lookup — roomKey:%o canGenerate:%o", genKey, canGenerate);
            ImageGen.generate(
              genKey,
              ttl,
              desc,
              canGenerate
                ? () => {
                    if (genKey !== state.currentRoomKey) return;
                    console.info("[IFWG] cache miss — starting generation for %o", genKey);
                    imageUI.showPlaceholder("LOADING IMAGE");
                  }
                : null
            )
              .then((url) => {
                if (genKey !== state.currentRoomKey) return;
                console.info(
                  "[IFWG] image result — roomKey:%o url:%o",
                  genKey,
                  url ? url.substring(0, 60) : null
                );
                if (url) imageUI.showImage(url, genKey);
                else imageUI.showPlaceholder("", roomName(ttl));
              })
              .catch((err) => {
                if (genKey !== state.currentRoomKey) return;
                console.error("ImageGen error:", err?.message ?? err);
                imageUI.showPlaceholder("ERROR");
              });
          }, 150);
        }
      }

      const processed = processDescription(description);

      if (el.sceneTextInner.textContent) {
        textUI.slideToContent(processed);
      } else {
        state.contentCompleted = false;
        textUI.calibrateTextHeight();
        el.sceneTextInner.textContent = processed;
        el.sceneText.scrollTop = 0;
        textUI.updateUI();
      }
    }

    /* ── Engine ──────────────────────────────────────────────────────── */
    const engine = createEngine(config.getWasmPath(), onRoomEntered, (filename, bytes) => {
      config.onSave(filename, bytes);
    });

    /* ── Send command ────────────────────────────────────────────────── */
    function sendCommand() {
      const cmd = el.cmdInput.value.trim();
      /* A blank line is a legitimate answer to plenty of real prompts
         ("Press RETURN to continue.", empty responses in forms) — only
         gate on the engine being ready, not on there being any text typed. */
      if (!state.started) return;
      el.cmdInput.value = "";
      el.cmdDisplay.textContent = "";
      el.cmdInput.disabled = true;
      el.cmdPrompt.hidden = true;
      el.cmdDisplay.hidden = true;
      inputUI.showCursor(false);
      engine.step(cmd, false);
    }

    /* ── Keydown: SPACE to scroll, any key in any-key mode ───────────── */
    document.addEventListener("keydown", (e) => {
      /* awaitingKeyPress is captured unconditionally — not gated on scroll
         position. These reads (menus, form fields) redraw the whole static
         body on every keystroke; whether the game currently wants a key has
         nothing to do with where that body happens to be scrolled. */
      if (state.awaitingKeyPress) {
        if (e.key === "Control" || e.key === "Alt" || e.key === "Shift" || e.key === "Meta") return;
        const zchar = zcharForKeydown(e);
        if (zchar == null) return;
        e.preventDefault();
        state.awaitingKeyPress = false;
        engine.step(zchar, true);
        return;
      }
      if (e.code === "Space" && !el.continueHint.hidden) {
        e.preventDefault();
        textUI.scrollDownAnimated();
      }
    });

    /* ── Tap: touch equivalents of the keyboard shortcuts ─────────────────
       So the game plays on mobile without a physical keyboard: tapping the
       player advances a "press a key" prompt, or pages the "press space to
       continue" pager. In normal input mode this does nothing here and the
       focus handler in input.js raises the on-screen keyboard instead. */
    const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

    /* The on-screen keyboard hides the in-player command row, so on touch we
       reveal a dedicated input at the top of the screen instead (see
       render.js / .mobile-cmd). It routes through the real command flow by
       feeding cmdInput and re-dispatching Enter, so history/echo/guards all
       still apply. */
    function showMobileCmd() {
      el.mobileCmdInput.value = "";
      el.mobileCmd.classList.add("shown");
      el.mobileCmdInput.focus();
    }
    function hideMobileCmd() {
      el.mobileCmd.classList.remove("shown");
      el.mobileCmdInput.blur();
    }
    el.mobileCmdInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const value = el.mobileCmdInput.value;
        hideMobileCmd();
        if (state.started && !el.cmdInput.disabled) {
          el.cmdInput.value = value;
          el.cmdInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        }
      } else if (e.key === "Escape") {
        hideMobileCmd();
      }
    });

    el.player.addEventListener("click", () => {
      if (state.awaitingKeyPress) {
        state.awaitingKeyPress = false;
        engine.step("\r", true);
        return;
      }
      if (!el.continueHint.hidden) {
        textUI.scrollDownAnimated();
        return;
      }
      /* Command mode: on touch, toggle the on-screen command input; on desktop
         the focus handler in input.js keeps the physical keyboard in the
         hidden field. */
      if (isTouch) {
        if (el.mobileCmd.classList.contains("shown")) hideMobileCmd();
        else if (!el.cmdInput.disabled) showMobileCmd();
      }
    });

    /* ── Boot ────────────────────────────────────────────────────────── */
    document.fonts.ready.then(textUI.calibrateTextHeight);

    const engineReady = engine.init().catch(() => {
      imageUI.showPlaceholder("WASM LOAD FAILED");
    });

    /* ── loadGame ────────────────────────────────────────────────────── */
    function startWithBuffer(buf, filename) {
      const bytes = new Uint8Array(buf);
      const gameId = readGameId(bytes);
      Game.setId(gameId);
      Game.setVersion(bytes[0]);
      console.info("[IFWG] loaded gameId:%o filename:%o version:%o", gameId, filename, bytes[0]);

      /* V6 games (Zork Zero, Shogun, Journey) have no built-in status line
         at all — the Z-machine spec gives them total control over their
         own custom windowing, so there's no reliable, universal way to
         read a room name/title at the interpreter level (unlike V1-V3's
         spec-guaranteed Global Variable 0, or V4/V5's best-effort object-
         name-matching fallback). Rather than let the player hit garbled
         titles and nonsense images, refuse to load V6 outright. */
      if (bytes[0] === 6) {
        config.onValidationFailed(".z6 format is not supported yet.", "NOT SUPPORTED", {
          allowRetry: false
        });
        return;
      }

      /* Some games have a canonicalGameId — the one specific release a
         precise, room-ID-keyed image set was generated from. Loading any
         other release still works fine (falls back to the title-keyed
         path), just less precisely for rooms that reuse one title for
         multiple distinct places — worth telling the player, not blocking.
         Only relevant when pregen is actually in play — canonicalGameId
         never affects anything when every image comes from live generation. */
      const name = ALIASES[gameId];

      /* On a game-specific (provide-your-own) page, reject a file that isn't a
         recognized release of that game — either a different known game, or a
         release/serial we don't have catalogued. The recognized releases are
         listed on the launch screen for reference. */
      const expected = config.getExpectedGame();
      if (expected && name !== expected) {
        const expTitle = GAMES[expected]?.title || expected;
        const detected = name ? GAMES[name]?.title || name : null;
        const msg = detected
          ? `This looks like ${detected}, not ${expTitle}. Please provide a ${expTitle} story file.`
          : `Release ${gameId} isn't a recognized version of ${expTitle}. See the recognized releases and try a different file.`;
        config.onValidationFailed(msg, "UNRECOGNIZED VERSION", { allowRetry: false });
        return;
      }

      const canonicalGameId = name ? GAMES[name]?.canonicalGameId : null;
      const pregenEnabled = ImageGen.getSettings().getPregenEnabled();
      if (pregenEnabled && canonicalGameId && canonicalGameId !== gameId) {
        el.versionNoticeText.textContent =
          `For the best image accuracy in ${GAMES[name].title}, use release/serial ${canonicalGameId} ` +
          `(this file is ${gameId}).`;
        el.versionNotice.hidden = false;
      } else {
        el.versionNotice.hidden = true;
      }

      state.storyPath = `/input/${filename}`;

      engineReady.then(async () => {
        engine.writeFile(state.storyPath, bytes);

        const settings = ImageGen.getSettings();
        if (settings.getApiKey()) {
          const result = await ImageGen.validate();
          if (!result.ok) {
            config.onValidationFailed(
              "API key validation failed. Please update your settings and retry."
            );
            return;
          }
          el.player.hidden = false;
        } else {
          el.player.hidden = false;
        }

        // Frotz derives the save name as: basename(storyFile), strip extension, append ".qzl"
        // e.g. "zork1.z3" → "zork1.qzl" (NOT "/input/zork1.z3.qzl")
        const saveName = filename.replace(/\.[^.]*$/, "") + ".qzl";
        config.onRestore(saveName, (saveBytes) => {
          if (saveBytes) engine.writeSave(saveName, saveBytes);
          state.started = true;
          engine.start(state.storyPath);
          config.onGameLoaded(gameId, filename);
        });
      });
    }

    function loadGame(source, name) {
      if (source instanceof File) {
        source.arrayBuffer().then((buf) => startWithBuffer(buf, source.name));
      } else if (typeof source === "string") {
        const filename = name || source.split("/").pop() || "game.z5";
        fetch(source)
          .then((r) => r.arrayBuffer())
          .then((buf) => startWithBuffer(buf, filename));
      } else if (source instanceof ArrayBuffer) {
        startWithBuffer(source, name || "game.z5");
      } else if (source instanceof Uint8Array) {
        startWithBuffer(source.buffer, name || "game.z5");
      }
    }

    return { loadGame };
  },

  /* Manifest-driven boot for a self-contained game page: fetch
     ./ifwg-manifest.json (relative to the hosting page), then show the
     launch screen with the shared image-gen settings panel. A missing/
     invalid manifest is a misconfiguration, not a fallback — pages using
     boot() always ship one.

     Two page shapes, keyed by whether the story file ships with the page:
       • bundled (game.path)      — title + PLAY button; the file is ours.
       • provide-your-own (no path, game.name) — a drop target plus the list
         of recognized release/serials for that title, since we can't ship
         the file ourselves. */
  boot(container) {
    fetch("./ifwg-manifest.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((manifest) => {
        const game = manifest?.game;
        if (!game || (!game.path && !game.name)) {
          throw new Error("manifest needs game.path (bundled) or game.name (provide-your-own)");
        }
        bootGame(container, game);
      })
      .catch((err) => {
        console.error("[IFWG] boot: failed to load ifwg-manifest.json —", err?.message ?? err);
        const msg = document.createElement("div");
        msg.style.cssText = "color:#f44;font-family:monospace;padding:2rem;text-align:center;";
        msg.textContent = "IFWG: no game manifest found for this page.";
        container.appendChild(msg);
      });
  }
};

/* Every release/serial known to map to this game, plus the one release the
   pregen image set was actually built from (canonicalGameId), if any. Used
   to tell a provide-your-own player which files are recognized and which is
   the recommended match for the most accurate pregen art. */
function recognizedReleases(name) {
  const ids = Object.keys(ALIASES)
    .filter((id) => ALIASES[id] === name)
    .sort();
  return { ids, recommended: GAMES[name]?.canonicalGameId || null };
}

function bootGame(container, game) {
  if (game.title) document.title = game.title;

  /* Pregen games always start with image gen Disabled (pregen supplies the
     art), regardless of any provider/key the user saved on a live-gen page.
     An in-memory session override — never persisted — pins that default;
     the settings panel drops it the moment the player opts into live gen. */
  if (game.pregenerated) {
    ImageGen.setSessionOverride({ provider: "none", pregenEnabled: true });
  }

  const bundled = !!game.path;
  let panel = null;
  let lastFile = null;

  class BootConfig extends StandaloneConfig {
    onValidationFailed(error, title, options) {
      if (!panel) panel = mountPanel();
      panel.overlay.hidden = false;
      panel.showError(error, title, options);
    }
    /* Only provide-your-own pages validate the dropped file against the game
       they front — a bundled page ships its own known-good story file. */
    getExpectedGame() {
      return bundled ? null : game.name || null;
    }
  }

  const player = IFWGPlayer.create(container, new BootConfig());

  /* Bundled: game-title header + a PLAY target box — same layout as the
     provide-your-own idle (title header, then a bordered box), so the title
     gets identical treatment on both. The file is ours, so one click plays. */
  function buildBundledIdle() {
    const idle = document.createElement("div");
    idle.className = "launch-provide";

    const title = document.createElement("div");
    title.className = "launch-game-title";
    title.textContent = game.title || "";
    idle.appendChild(title);

    const playTarget = document.createElement("div");
    playTarget.className = "drop-target";
    const playTitle = document.createElement("span");
    playTitle.className = "drop-title";
    playTitle.textContent = "PLAY";
    const playSub = document.createElement("span");
    playSub.className = "drop-sub";
    playSub.textContent = "click to start";
    playTarget.appendChild(playTitle);
    playTarget.appendChild(playSub);
    playTarget.addEventListener("click", () => run(game.path, game.path.split("/").pop()));
    idle.appendChild(playTarget);

    return idle;
  }

  /* Provide-your-own: a drop target plus the list of recognized releases for
     this title (we can't ship the file). The file input / drag-drop wiring
     lives on the overlay (see mountPanel), since dragging happens there. */
  function buildProvideIdle() {
    const idle = document.createElement("div");
    idle.className = "launch-provide";

    const title = document.createElement("div");
    title.className = "launch-game-title";
    title.textContent = game.title || "";
    idle.appendChild(title);

    const dropTarget = document.createElement("label");
    dropTarget.className = "drop-target";
    dropTarget.htmlFor = "ifwg-story-file";

    const dropTitle = document.createElement("span");
    dropTitle.className = "drop-title";
    dropTitle.textContent = "DROP STORY FILE";

    const dropSub = document.createElement("span");
    dropSub.className = "drop-sub";
    dropSub.textContent = "or click to choose";

    const input = document.createElement("input");
    input.id = "ifwg-story-file";
    input.type = "file";
    input.accept = ".z1,.z2,.z3,.z4,.z5,.z6,.z7,.z8,.dat,.zcode";
    input.addEventListener("change", () => {
      if (input.files?.[0]) run(input.files[0]);
    });

    dropTarget.appendChild(dropTitle);
    dropTarget.appendChild(dropSub);
    dropTarget.appendChild(input);
    idle.appendChild(dropTarget);

    const { ids, recommended } = recognizedReleases(game.name);
    if (ids.length) {
      const list = document.createElement("div");
      list.className = "launch-idlist";

      const heading = document.createElement("div");
      heading.className = "launch-idlist-title";
      heading.textContent = "SUPPORTED GAME FILES";
      list.appendChild(heading);

      const rows = document.createElement("div");
      rows.className = "launch-idlist-rows";
      for (const id of ids) {
        const row = document.createElement("div");
        row.className = "launch-idlist-item";

        const serial = document.createElement("span");
        serial.className = "launch-idlist-serial";
        serial.textContent = id;
        row.appendChild(serial);

        if (id === recommended) {
          row.classList.add("is-recommended");
          const badge = document.createElement("span");
          badge.className = "launch-idlist-badge";
          badge.textContent = "RECOMMENDED";
          row.appendChild(badge);
        }
        rows.appendChild(row);
      }
      list.appendChild(rows);
      idle.appendChild(list);
    }

    return idle;
  }

  function mountPanel() {
    const overlay = document.createElement("div");
    overlay.className = "drop-overlay";
    container.appendChild(overlay);

    /* Back to the site's game directory. Game pages live at
       <root>/player/games/<id>/, so three levels up is the deploy root;
       #library tells the site to open the directory view directly. */
    const back = document.createElement("a");
    back.className = "launch-back";
    back.href = "../../../#library";
    back.innerHTML =
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg> BACK';
    overlay.appendChild(back);

    /* Saves live in the browser (IndexedDB), keyed to the story file — remind
       the player how to use them. */
    const hint = document.createElement("div");
    hint.className = "launch-hint";
    hint.innerHTML =
      "When playing, type <b>SAVE</b> to save your progress, and <b>RESTORE</b> to pick up where you left off.";
    overlay.appendChild(hint);

    const idle = bundled ? buildBundledIdle() : buildProvideIdle();

    const p = renderLaunchPanel(overlay, {
      idle,
      onRetry: () => (bundled ? run(game.path, game.path.split("/").pop()) : run(lastFile)),
      pregenDefault: !!game.pregenerated
    });

    /* Drag-and-drop only applies to the provide-your-own shape. Gate on
       isReady() so files are ignored until image-gen is satisfied (Disabled
       or a validated key) — same rule the click/change path uses via run(). */
    if (!bundled) {
      overlay.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (p.isReady()) overlay.classList.add("is-dragging");
      });
      overlay.addEventListener("dragleave", () => overlay.classList.remove("is-dragging"));
      overlay.addEventListener("drop", (e) => {
        e.preventDefault();
        overlay.classList.remove("is-dragging");
        if (e.dataTransfer.files?.[0]) run(e.dataTransfer.files[0]);
      });
    }

    return { overlay, showError: p.showError, isReady: p.isReady };
  }

  /* Bundled passes a path string; provide-your-own passes a File. Both defer
     to the panel's readiness gate so a live-gen game can't start before its
     key is validated. */
  function run(source, filename) {
    if (source instanceof File) lastFile = source;
    if (panel && !panel.isReady()) return;
    if (panel) panel.overlay.hidden = true;
    player.loadGame(source, filename);
  }

  panel = mountPanel();
}

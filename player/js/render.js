export function render(container) {
  if (!document.querySelector("link[data-ifwg-css]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("../player.css", import.meta.url).href;
    link.setAttribute("data-ifwg-css", "1");
    document.head.appendChild(link);
  }

  container.innerHTML = "";

  /* ── Player ───────────────────────────────────────────────────────── */
  const player = document.createElement("main");
  player.className = "player";
  player.hidden = true;

  /* Version notice — shown when the dropped file isn't the specific release
     a game's precise room-ID-keyed images were generated from. Dismissible,
     never blocks play. */
  const versionNotice = document.createElement("div");
  versionNotice.className = "version-notice";
  versionNotice.hidden = true;
  const versionNoticeText = document.createElement("span");
  const versionNoticeClose = document.createElement("button");
  versionNoticeClose.type = "button";
  versionNoticeClose.className = "version-notice-close";
  versionNoticeClose.textContent = "×";
  versionNoticeClose.addEventListener("click", () => {
    versionNotice.hidden = true;
  });
  versionNotice.appendChild(versionNoticeText);
  versionNotice.appendChild(versionNoticeClose);

  /* Status bar */
  const statusBar = document.createElement("div");
  statusBar.className = "status-bar";
  const statusRoom = document.createElement("span");
  const statusScore = document.createElement("span");
  statusBar.appendChild(statusRoom);
  statusBar.appendChild(statusScore);

  /* Character-attribute line (Beyond Zork's "EN:16 ST:08 ..." readout) —
     a persistent status strip, like statusBar, not part of the scrolling
     narrative text. Hidden until the first value is known. */
  const statsLine = document.createElement("div");
  statsLine.className = "stats-line";
  statsLine.hidden = true;

  /* Scene wrap */
  const sceneWrap = document.createElement("div");
  sceneWrap.className = "scene-wrap";

  const sceneImg = document.createElement("img");
  sceneImg.className = "scene-img";
  sceneImg.alt = "";
  sceneImg.hidden = true;

  const scenePlaceholder = document.createElement("div");
  scenePlaceholder.id = "ifwg-scene-placeholder";
  scenePlaceholder.className = "scene-placeholder";
  scenePlaceholder.style.display = "none";

  const bezel = document.createElement("div");
  bezel.className = "gen-drive-bezel";
  bezel.innerHTML =
    '<div class="gen-in-use">IN USE &#9658;</div>' +
    '<div class="gen-led" id="ifwg-disk-led"></div>' +
    '<div class="gen-drive-label">disk II</div>';

  const genStatus = document.createElement("div");
  genStatus.className = "gen-status";
  const placeholderLabel = document.createElement("span");
  const dotLabel = document.createElement("span");
  dotLabel.id = "ifwg-dot-label";
  genStatus.appendChild(placeholderLabel);
  genStatus.appendChild(dotLabel);

  const roomTitleLabel = document.createElement("div");
  roomTitleLabel.className = "scene-room-title";

  scenePlaceholder.appendChild(bezel);
  scenePlaceholder.appendChild(genStatus);
  scenePlaceholder.appendChild(roomTitleLabel);
  sceneWrap.appendChild(sceneImg);
  sceneWrap.appendChild(scenePlaceholder);

  /* Sensory panel — some games (Beyond Zork) draw a small ascii-art icon
     (a real, functional cue: it's the only indication of some available
     exits/scenery, not decoration) in a window that shares screen rows
     with the main room text in the interpreter's flat screen model. Shown
     as its own small corner box instead of letting it splice into the
     prose — matching how period-accurate interpreters (Apple II, WinFrotz)
     render it in their own dedicated area. Hidden whenever there's none. */
  const sensoryPanel = document.createElement("pre");
  sensoryPanel.className = "sensory-panel";
  sensoryPanel.hidden = true;
  sceneWrap.appendChild(sensoryPanel);

  /* Scene text */
  const sceneText = document.createElement("div");
  sceneText.className = "scene-text";
  const sceneTextInner = document.createElement("div");
  sceneText.appendChild(sceneTextInner);

  /* Grid view — a faithful, fixed-width rendering of the game's own screen
     buffer (row/col addressed), used for @read_char-driven forms/menus
     where absolute position is part of the game's actual output (e.g.
     Bureaucracy's field-entry form, Beyond Zork's character menu). These
     can't be represented as scrolling prose the way normal room
     descriptions can. Hidden by default; shown instead of sceneText only
     while such a screen is active. */
  const gridView = document.createElement("div");
  gridView.className = "scene-text grid-view";
  gridView.hidden = true;
  const gridInner = document.createElement("pre");
  gridInner.className = "grid-inner";
  const gridCursor = document.createElement("span");
  gridCursor.className = "grid-cursor";
  gridView.appendChild(gridInner);
  gridView.appendChild(gridCursor);

  /* Command row */
  const cmdRow = document.createElement("div");
  cmdRow.className = "cmd-row";

  const continueHint = document.createElement("span");
  continueHint.className = "continue-hint";
  continueHint.hidden = true;
  continueHint.textContent = "PRESS SPACE TO CONTINUE";

  const cmdPrompt = document.createElement("span");
  cmdPrompt.className = "prompt";
  cmdPrompt.hidden = true;
  cmdPrompt.textContent = ">";

  const cmdDisplay = document.createElement("span");
  cmdDisplay.className = "cmd-display";
  cmdDisplay.hidden = true;

  const cmdCursor = document.createElement("span");
  cmdCursor.className = "cmd-cursor";

  const cmdInput = document.createElement("input");
  cmdInput.className = "cmd-input";
  cmdInput.type = "text";
  cmdInput.autocomplete = "off";
  cmdInput.spellcheck = false;
  // Mobile keyboards "help" by autocapitalizing/autocorrecting, which mangles
  // parser input (ne -> He, x lamp -> X lamp, etc.). Turn all of it off, and
  // label the return key "Go" instead of a newline.
  cmdInput.setAttribute("autocorrect", "off");
  cmdInput.setAttribute("autocapitalize", "none");
  cmdInput.setAttribute("enterkeyhint", "go");
  cmdInput.disabled = true;

  cmdRow.appendChild(continueHint);
  cmdRow.appendChild(cmdPrompt);
  cmdRow.appendChild(cmdDisplay);
  cmdRow.appendChild(cmdCursor);
  cmdRow.appendChild(cmdInput);

  player.appendChild(versionNotice);
  player.appendChild(statusBar);
  player.appendChild(statsLine);
  player.appendChild(sceneWrap);
  player.appendChild(sceneText);
  player.appendChild(gridView);
  player.appendChild(cmdRow);

  container.appendChild(player);

  /* Mobile command input — revealed only when the player taps the screen while
     the game is awaiting a command (see core.js). Pinned to the top of the
     viewport so it clears the on-screen keyboard; the in-player command row
     would otherwise sit under the keyboard where you can't see what you type.
     Hidden entirely on desktop (the tap-to-show logic is touch-gated). */
  const mobileCmd = document.createElement("div");
  mobileCmd.className = "mobile-cmd";
  const mobileCmdPrompt = document.createElement("span");
  mobileCmdPrompt.className = "mobile-cmd-prompt";
  mobileCmdPrompt.textContent = ">";
  const mobileCmdInput = document.createElement("input");
  mobileCmdInput.className = "mobile-cmd-input";
  mobileCmdInput.type = "text";
  mobileCmdInput.autocomplete = "off";
  mobileCmdInput.spellcheck = false;
  mobileCmdInput.setAttribute("autocorrect", "off");
  mobileCmdInput.setAttribute("autocapitalize", "none");
  mobileCmdInput.setAttribute("enterkeyhint", "go");
  mobileCmdInput.setAttribute("aria-label", "Command");
  mobileCmdInput.placeholder = "type a command…";
  mobileCmd.appendChild(mobileCmdPrompt);
  mobileCmd.appendChild(mobileCmdInput);
  container.appendChild(mobileCmd);

  const diskLed = bezel.querySelector("#ifwg-disk-led");

  return {
    player,
    versionNotice,
    versionNoticeText,
    statusRoom,
    statusScore,
    statsLine,
    sceneWrap,
    sceneImg,
    sensoryPanel,
    scenePlaceholder,
    placeholderLabel,
    roomTitleLabel,
    diskLed,
    dotLabel,
    sceneText,
    sceneTextInner,
    gridView,
    gridInner,
    gridCursor,
    continueHint,
    cmdPrompt,
    cmdDisplay,
    cmdCursor,
    cmdInput,
    mobileCmd,
    mobileCmdInput
  };
}

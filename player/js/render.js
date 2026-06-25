export function render(container) {
  if (!document.querySelector("link[data-ifwg-css]")) {
    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = new URL("../player.css", import.meta.url).href;
    link.setAttribute("data-ifwg-css", "1");
    document.head.appendChild(link);
  }

  container.innerHTML = "";

  /* ── Player ───────────────────────────────────────────────────────── */
  const player = document.createElement("main");
  player.className = "player";
  player.hidden    = true;

  /* Status bar */
  const statusBar   = document.createElement("div");
  statusBar.className = "status-bar";
  const statusRoom  = document.createElement("span");
  const statusScore = document.createElement("span");
  statusBar.appendChild(statusRoom);
  statusBar.appendChild(statusScore);

  /* Scene wrap */
  const sceneWrap = document.createElement("div");
  sceneWrap.className = "scene-wrap";

  const sceneImg = document.createElement("img");
  sceneImg.className = "scene-img";
  sceneImg.alt       = "";
  sceneImg.hidden    = true;

  const scenePlaceholder = document.createElement("div");
  scenePlaceholder.id            = "ifwg-scene-placeholder";
  scenePlaceholder.className     = "scene-placeholder";
  scenePlaceholder.style.display = "none";

  const bezel = document.createElement("div");
  bezel.className = "gen-drive-bezel";
  bezel.innerHTML =
    '<div class="gen-in-use">IN USE &#9658;</div>' +
    '<div class="gen-led" id="ifwg-disk-led"></div>' +
    '<div class="gen-drive-label">disk II</div>';

  const genStatus      = document.createElement("div");
  genStatus.className  = "gen-status";
  const placeholderLabel = document.createElement("span");
  const dotLabel         = document.createElement("span");
  dotLabel.id = "ifwg-dot-label";
  genStatus.appendChild(placeholderLabel);
  genStatus.appendChild(dotLabel);

  scenePlaceholder.appendChild(bezel);
  scenePlaceholder.appendChild(genStatus);
  sceneWrap.appendChild(sceneImg);
  sceneWrap.appendChild(scenePlaceholder);

  /* Scene text */
  const sceneText      = document.createElement("div");
  sceneText.className  = "scene-text";
  const sceneTextInner = document.createElement("div");
  sceneText.appendChild(sceneTextInner);

  /* Command row */
  const cmdRow = document.createElement("div");
  cmdRow.className = "cmd-row";

  const continueHint = document.createElement("span");
  continueHint.className   = "continue-hint";
  continueHint.hidden      = true;
  continueHint.textContent = "PRESS SPACE TO CONTINUE";

  const cmdPrompt = document.createElement("span");
  cmdPrompt.className   = "prompt";
  cmdPrompt.hidden      = true;
  cmdPrompt.textContent = ">";

  const cmdDisplay = document.createElement("span");
  cmdDisplay.className = "cmd-display";
  cmdDisplay.hidden    = true;

  const cmdCursor = document.createElement("span");
  cmdCursor.className = "cmd-cursor";

  const cmdInput = document.createElement("input");
  cmdInput.className    = "cmd-input";
  cmdInput.type         = "text";
  cmdInput.autocomplete = "off";
  cmdInput.spellcheck   = false;
  cmdInput.disabled     = true;

  cmdRow.appendChild(continueHint);
  cmdRow.appendChild(cmdPrompt);
  cmdRow.appendChild(cmdDisplay);
  cmdRow.appendChild(cmdCursor);
  cmdRow.appendChild(cmdInput);

  player.appendChild(statusBar);
  player.appendChild(sceneWrap);
  player.appendChild(sceneText);
  player.appendChild(cmdRow);

  container.appendChild(player);

  const diskLed = bezel.querySelector("#ifwg-disk-led");

  return {
    player,
    statusRoom,
    statusScore,
    sceneWrap,
    sceneImg,
    scenePlaceholder,
    placeholderLabel,
    diskLed,
    dotLabel,
    sceneText,
    sceneTextInner,
    continueHint,
    cmdPrompt,
    cmdDisplay,
    cmdCursor,
    cmdInput
  };
}

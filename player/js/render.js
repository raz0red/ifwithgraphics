export function render(container) {
  if (!document.querySelector("link[data-ifwg-css]")) {
    var link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = new URL("../player.css", import.meta.url).href;
    link.setAttribute("data-ifwg-css", "1");
    document.head.appendChild(link);
  }

  container.innerHTML = "";

  /* ── Player ───────────────────────────────────────────────────────── */
  var player = document.createElement("main");
  player.className = "player";
  player.hidden    = true;

  /* Status bar */
  var statusBar = document.createElement("div");
  statusBar.className = "status-bar";
  var statusRoom  = document.createElement("span");
  var statusScore = document.createElement("span");
  statusBar.appendChild(statusRoom);
  statusBar.appendChild(statusScore);

  /* Scene wrap */
  var sceneWrap = document.createElement("div");
  sceneWrap.className = "scene-wrap";

  var sceneImg = document.createElement("img");
  sceneImg.className = "scene-img";
  sceneImg.alt       = "";
  sceneImg.hidden    = true;

  var scenePlaceholder = document.createElement("div");
  scenePlaceholder.id            = "ifwg-scene-placeholder";
  scenePlaceholder.className     = "scene-placeholder";
  scenePlaceholder.style.display = "none";

  var bezel = document.createElement("div");
  bezel.className = "gen-drive-bezel";
  bezel.innerHTML =
    '<div class="gen-in-use">IN USE &#9658;</div>' +
    '<div class="gen-led" id="ifwg-disk-led"></div>' +
    '<div class="gen-drive-label">disk II</div>';

  var genStatus = document.createElement("div");
  genStatus.className = "gen-status";
  var placeholderLabel = document.createElement("span");
  var dotLabel         = document.createElement("span");
  dotLabel.id = "ifwg-dot-label";
  genStatus.appendChild(placeholderLabel);
  genStatus.appendChild(dotLabel);

  scenePlaceholder.appendChild(bezel);
  scenePlaceholder.appendChild(genStatus);
  sceneWrap.appendChild(sceneImg);
  sceneWrap.appendChild(scenePlaceholder);

  /* Scene text */
  var sceneText = document.createElement("div");
  sceneText.className = "scene-text";
  var sceneTextInner = document.createElement("div");
  sceneText.appendChild(sceneTextInner);

  /* Command row */
  var cmdRow = document.createElement("div");
  cmdRow.className = "cmd-row";

  var continueHint = document.createElement("span");
  continueHint.className   = "continue-hint";
  continueHint.hidden      = true;
  continueHint.textContent = "PRESS SPACE TO CONTINUE";

  var cmdPrompt = document.createElement("span");
  cmdPrompt.className   = "prompt";
  cmdPrompt.hidden      = true;
  cmdPrompt.textContent = ">";

  var cmdDisplay = document.createElement("span");
  cmdDisplay.className = "cmd-display";
  cmdDisplay.hidden    = true;

  var cmdCursor = document.createElement("span");
  cmdCursor.className = "cmd-cursor";

  var cmdInput = document.createElement("input");
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

  var diskLed = bezel.querySelector("#ifwg-disk-led");

  return {
    player:           player,
    statusRoom:       statusRoom,
    statusScore:      statusScore,
    sceneWrap:        sceneWrap,
    sceneImg:         sceneImg,
    scenePlaceholder: scenePlaceholder,
    placeholderLabel: placeholderLabel,
    diskLed:          diskLed,
    dotLabel:         dotLabel,
    sceneText:        sceneText,
    sceneTextInner:   sceneTextInner,
    continueHint:     continueHint,
    cmdPrompt:        cmdPrompt,
    cmdDisplay:       cmdDisplay,
    cmdCursor:        cmdCursor,
    cmdInput:         cmdInput
  };
}

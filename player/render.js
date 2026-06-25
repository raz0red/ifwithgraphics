var _cssBase = new URL("./", import.meta.url).href;

export function render(container) {
  /* Inject player.css once, resolved relative to this module. */
  if (!document.querySelector("link[data-ifwg-css]")) {
    var link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = _cssBase + "player.css";
    link.setAttribute("data-ifwg-css", "1");
    document.head.appendChild(link);
  }

  container.innerHTML = "";

  /* ── Drop overlay ─────────────────────────────────────────────────── */
  var dropOverlay = document.createElement("div");
  dropOverlay.className = "drop-overlay";

  var dropTarget = document.createElement("label");
  dropTarget.className  = "drop-target";
  dropTarget.htmlFor    = "ifwg-story-file";
  dropTarget.innerHTML  =
    '<span class="drop-title">DROP STORY FILE</span>' +
    '<span class="drop-sub">or click to choose</span>';

  var storyFile = document.createElement("input");
  storyFile.id     = "ifwg-story-file";
  storyFile.type   = "file";
  storyFile.accept = ".z1,.z2,.z3,.z4,.z5,.z6,.z7,.z8,.dat,.zcode";
  dropTarget.appendChild(storyFile);

  var dropSettings = document.createElement("div");
  dropSettings.className = "drop-settings";
  dropSettings.innerHTML =
    '<div class="setting-row">' +
      '<label class="setting-label" for="ifwg-ai-provider">IMAGE GEN</label>' +
      '<select id="ifwg-ai-provider" class="setting-select">' +
        '<option value="openai">OpenAI DALL-E 3</option>' +
        '<option value="none">Disabled</option>' +
      '</select>' +
    '</div>' +
    '<div class="setting-row">' +
      '<label class="setting-label" for="ifwg-ai-key">API KEY</label>' +
      '<input id="ifwg-ai-key" class="setting-input" type="password" ' +
             'placeholder="sk-…" autocomplete="off" spellcheck="false">' +
    '</div>';

  dropOverlay.appendChild(dropTarget);
  dropOverlay.appendChild(dropSettings);

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
  scenePlaceholder.id           = "ifwg-scene-placeholder";
  scenePlaceholder.className    = "scene-placeholder";
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
  continueHint.className = "continue-hint";
  continueHint.hidden    = true;
  continueHint.textContent = "PRESS SPACE TO CONTINUE";

  var cmdPrompt = document.createElement("span");
  cmdPrompt.className = "prompt";
  cmdPrompt.hidden    = true;
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

  container.appendChild(dropOverlay);
  container.appendChild(player);

  var diskLed = bezel.querySelector("#ifwg-disk-led");

  return {
    dropOverlay:      dropOverlay,
    player:           player,
    storyFile:        storyFile,
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
    cmdInput:         cmdInput,
    aiProvider:       dropSettings.querySelector("#ifwg-ai-provider"),
    aiKey:            dropSettings.querySelector("#ifwg-ai-key")
  };
}

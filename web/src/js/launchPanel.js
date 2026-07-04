import { ImageGen, PROVIDERS } from "./imagegen/index.js";

function settingRow(labelText, forId) {
  const row = document.createElement("div");
  row.className = "setting-row";
  const label = document.createElement("label");
  label.className = "setting-label";
  label.htmlFor   = forId;
  label.textContent = labelText;
  row.appendChild(label);
  return row;
}

function buildSettings() {
  const wrap = document.createElement("div");
  wrap.className = "drop-settings";

  const providerRow = settingRow("IMAGE GEN", "ifwg-ai-provider");
  const provider = document.createElement("select");
  provider.id        = "ifwg-ai-provider";
  provider.className = "setting-select";
  providerRow.appendChild(provider);

  const modelRow = settingRow("MODEL", "ifwg-ai-model");
  const model = document.createElement("select");
  model.id        = "ifwg-ai-model";
  model.className = "setting-select";
  modelRow.appendChild(model);

  const keyRow = settingRow("API KEY", "ifwg-ai-key");
  const key = document.createElement("input");
  key.id            = "ifwg-ai-key";
  key.className     = "setting-input";
  key.type          = "password";
  key.autocomplete  = "off";
  key.spellcheck    = false;
  key.placeholder   = "sk-…";
  keyRow.appendChild(key);

  const pregenRow   = settingRow("PRE-GEN", "ifwg-pregen");
  const pregenLabel = document.createElement("label");
  pregenLabel.className = "setting-toggle-wrap";
  const pregen = document.createElement("input");
  pregen.id        = "ifwg-pregen";
  pregen.type      = "checkbox";
  pregen.className = "setting-toggle";
  const track = document.createElement("span");
  track.className = "setting-toggle-track";
  const thumb = document.createElement("span");
  thumb.className = "setting-toggle-thumb";
  track.appendChild(thumb);
  pregenLabel.appendChild(pregen);
  pregenLabel.appendChild(track);
  pregenRow.appendChild(pregenLabel);

  wrap.appendChild(providerRow);
  wrap.appendChild(modelRow);
  wrap.appendChild(keyRow);
  wrap.appendChild(pregenRow);

  Object.entries(PROVIDERS).forEach(([value, { label: text }]) => {
    const opt = document.createElement("option");
    opt.value       = value;
    opt.textContent = text;
    provider.appendChild(opt);
  });

  function populateModels(providerValue, selectedModel) {
    const { models = [], keyPlaceholder = "…" } = PROVIDERS[providerValue] || {};
    model.innerHTML = models.map(m =>
      `<option value="${m.value}"${m.value === selectedModel ? " selected" : ""}>${m.label}</option>`
    ).join("");
    modelRow.hidden = models.length === 0;
    keyRow.hidden   = models.length === 0;
    key.placeholder = keyPlaceholder;
  }

  const settings = ImageGen.getSettings();
  provider.value = settings.getProvider();
  if (!provider.value) provider.selectedIndex = 0;
  key.value      = settings.getApiKey();
  pregen.checked = settings.getPregenEnabled();
  populateModels(provider.value, settings.getModel());

  function apply() {
    const s = ImageGen.getSettings();
    s.setProvider(provider.value);
    s.setApiKey(key.value.trim());
    s.setModel(model.value);
    s.setPregenEnabled(pregen.checked);
    ImageGen.setSettings(s);
  }
  provider.addEventListener("change", () => {
    const s = ImageGen.getSettings();
    s.setProvider(provider.value);
    key.value = s.getApiKey();
    populateModels(provider.value, "");
    apply();
  });
  model.addEventListener("change",  apply);
  key.addEventListener("change",    apply);
  key.addEventListener("blur",      apply);
  pregen.addEventListener("change", apply);

  return wrap;
}

/* Shared launcher chrome: an idle action slot (caller-supplied — a drop
   target, or a title+RUN block) next to the image-gen settings, plus a
   swappable error/retry state used when API key validation fails. */
export function renderLaunchPanel(container, { idle, onRetry }) {
  const panel = document.createElement("div");
  panel.className = "launch-panel";

  const action = document.createElement("div");
  action.className = "launch-action";

  const errorBlock = document.createElement("div");
  errorBlock.className = "launch-error";
  errorBlock.hidden = true;

  const errTitle = document.createElement("div");
  errTitle.className = "launch-error-title";
  errTitle.textContent = "API KEY ERROR";

  const errMsg = document.createElement("div");
  errMsg.className = "launch-error-msg";

  const retryBtn = document.createElement("button");
  retryBtn.type        = "button";
  retryBtn.className   = "launch-retry";
  retryBtn.textContent  = "RETRY";
  retryBtn.addEventListener("click", () => {
    showIdle();
    onRetry();
  });

  errorBlock.appendChild(errTitle);
  errorBlock.appendChild(errMsg);
  errorBlock.appendChild(retryBtn);

  action.appendChild(idle);
  action.appendChild(errorBlock);

  panel.appendChild(action);
  panel.appendChild(buildSettings());
  container.appendChild(panel);

  function showError(msg) {
    idle.hidden       = true;
    errorBlock.hidden = false;
    errMsg.textContent = msg || "API key validation failed.";
  }
  function showIdle() {
    idle.hidden        = false;
    errorBlock.hidden  = true;
  }

  return { showError, showIdle };
}

import { ImageGen, PROVIDERS } from "./imagegen/index.js";

function settingRow(labelText, forId) {
  const row = document.createElement("div");
  row.className = "setting-row";
  const label = document.createElement("label");
  label.className = "setting-label";
  label.htmlFor = forId;
  label.textContent = labelText;
  row.appendChild(label);
  return row;
}

const LOCKED_PROMPT = "Set Image Gen to Disabled, or enter an API key and press Validate.";

/* Live image-gen providers (anything but "none"/Disabled) now require an
   explicit validated key before the caller's idle action (drop target, RUN
   button) is allowed to appear — onLocked/onReady drive that from outside,
   since the idle element itself belongs to the caller, not this module. */
function buildSettings({ onLocked, onReady }) {
  const wrap = document.createElement("div");
  wrap.className = "drop-settings";

  const providerRow = settingRow("IMAGE GEN", "ifwg-ai-provider");
  const provider = document.createElement("select");
  provider.id = "ifwg-ai-provider";
  provider.className = "setting-select";
  providerRow.appendChild(provider);

  const modelRow = settingRow("MODEL", "ifwg-ai-model");
  const model = document.createElement("select");
  model.id = "ifwg-ai-model";
  model.className = "setting-select";
  modelRow.appendChild(model);

  const keyRow = settingRow("API KEY", "ifwg-ai-key");
  const keyWrap = document.createElement("div");
  keyWrap.className = "setting-key-wrap";
  const key = document.createElement("input");
  key.id = "ifwg-ai-key";
  key.className = "setting-input";
  key.type = "password";
  key.autocomplete = "off";
  key.spellcheck = false;
  const validateBtn = document.createElement("button");
  validateBtn.type = "button";
  validateBtn.className = "setting-validate-btn";
  validateBtn.textContent = "VALIDATE";
  keyWrap.appendChild(key);
  keyWrap.appendChild(validateBtn);
  keyRow.appendChild(keyWrap);

  const statusRow = document.createElement("div");
  statusRow.className = "setting-status";
  statusRow.hidden = true;

  const pregenRow = settingRow("PRE-GEN", "ifwg-pregen");
  const pregenLabel = document.createElement("label");
  pregenLabel.className = "setting-toggle-wrap";
  const pregen = document.createElement("input");
  pregen.id = "ifwg-pregen";
  pregen.type = "checkbox";
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
  wrap.appendChild(statusRow);
  wrap.appendChild(pregenRow);

  Object.entries(PROVIDERS).forEach(([value, { label: text }]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    provider.appendChild(opt);
  });

  function setStatus(text) {
    statusRow.hidden = !text;
    statusRow.textContent = text || "";
  }

  function updateVisibility(providerValue, modelCount) {
    const needsKey = providerValue !== "none";
    key.placeholder = PROVIDERS[providerValue]?.keyPlaceholder || "…";
    keyRow.hidden = !needsKey;
    modelRow.hidden = !needsKey || modelCount === 0;
    if (!needsKey) setStatus("");
  }

  function populateModelOptions(models, selectedValue) {
    model.innerHTML = models
      .map(
        (m) =>
          `<option value="${m.value}"${m.value === selectedValue ? " selected" : ""}>${m.label}</option>`
      )
      .join("");
  }

  /* Full save, including whatever the model <select> currently holds. Only
     safe to call once the model list has actually been populated for this
     provider — see applyProviderAndKey() below for the alternative used
     while that's still pending. */
  function apply() {
    const s = ImageGen.getSettings();
    s.setProvider(provider.value);
    s.setApiKey(key.value.trim());
    s.setModel(model.value);
    s.setPregenEnabled(pregen.checked);
    ImageGen.setSettings(s);
  }

  /* Save provider/key/pregen only, leaving the stored model field alone.
     Used before/during validation, when the model <select> is still empty
     (not yet populated) — calling the full apply() at that point would
     clobber the real saved model with "" before checkAndValidate() gets a
     chance to restore it. */
  function applyProviderAndKey() {
    const s = ImageGen.getSettings();
    s.setProvider(provider.value);
    s.setApiKey(key.value.trim());
    s.setPregenEnabled(pregen.checked);
    ImageGen.setSettings(s);
  }

  /* Re-checks validity for whatever's currently in the form — called on
     mount (covers "already have a saved key" return visits), on provider
     switch, and on explicit Validate clicks. */
  async function checkAndValidate() {
    const providerValue = provider.value;
    const keyValue = key.value.trim();
    const previousModel = ImageGen.getSettings().getModel();

    updateVisibility(providerValue, 0);

    if (providerValue === "none") {
      applyProviderAndKey();
      onReady();
      return;
    }

    if (!keyValue) {
      applyProviderAndKey();
      onLocked(LOCKED_PROMPT);
      return;
    }

    applyProviderAndKey();
    validateBtn.disabled = true;
    setStatus("Validating…");
    onLocked("Validating…");

    const result = await ImageGen.validate();

    validateBtn.disabled = false;

    if (!result.ok) {
      setStatus("");
      onLocked(result.error || LOCKED_PROMPT);
      return;
    }

    setStatus("");
    const models = result.models || [];
    const selected = models.some((m) => m.value === previousModel)
      ? previousModel
      : models[0]?.value || "";

    updateVisibility(providerValue, models.length);
    populateModelOptions(models, selected);
    model.value = selected;
    apply();
    onReady();
  }

  const settings = ImageGen.getSettings();
  provider.value = settings.getProvider();
  if (!provider.value) provider.selectedIndex = 0;
  key.value = settings.getApiKey();
  pregen.checked = settings.getPregenEnabled();

  provider.addEventListener("change", () => {
    const s = ImageGen.getSettings();
    s.setProvider(provider.value);
    key.value = s.getApiKey();
    ImageGen.setSettings(s);
    checkAndValidate();
  });
  model.addEventListener("change", apply);
  key.addEventListener("blur", apply);
  pregen.addEventListener("change", apply);
  validateBtn.addEventListener("click", checkAndValidate);

  /* Kick off an initial check — this is what makes a returning visit with
     an already-saved key "just work" without the user pressing Validate
     again, per the same shape as the launcher's existing retry flow. */
  checkAndValidate();

  return wrap;
}

/* Shared launcher chrome: an idle action slot (caller-supplied — a drop
   target, or a title+RUN block) next to the image-gen settings, plus a
   swappable error/retry state used when API key validation fails, and a
   locked state that hides the idle action until image-gen is either
   Disabled or backed by a validated key. */
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

  const errMsg = document.createElement("div");
  errMsg.className = "launch-error-msg";

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "launch-retry";
  retryBtn.textContent = "RETRY";
  retryBtn.addEventListener("click", () => {
    showIdle();
    onRetry();
  });

  errorBlock.appendChild(errTitle);
  errorBlock.appendChild(errMsg);
  errorBlock.appendChild(retryBtn);

  const lockedBlock = document.createElement("div");
  lockedBlock.className = "launch-locked";
  lockedBlock.hidden = true;

  const lockedMsg = document.createElement("div");
  lockedMsg.className = "launch-locked-msg";
  lockedBlock.appendChild(lockedMsg);

  action.appendChild(idle);
  action.appendChild(errorBlock);
  action.appendChild(lockedBlock);

  panel.appendChild(action);

  let ready = false;

  panel.appendChild(
    buildSettings({
      onLocked(msg) {
        ready = false;
        idle.hidden = true;
        errorBlock.hidden = true;
        lockedMsg.textContent = msg;
        lockedBlock.hidden = false;
      },
      onReady() {
        ready = true;
        idle.hidden = false;
        errorBlock.hidden = true;
        lockedBlock.hidden = true;
      }
    })
  );

  container.appendChild(panel);

  /* allowRetry=false is for errors where retrying the exact same file can
     never succeed (e.g. an unsupported story file format) — retrying only
     makes sense for something the player can actually fix and reattempt,
     like a bad API key. In that case, leave idle (the drop target) visible
     alongside the message so picking a different file is still obvious. */
  function showError(msg, title, { allowRetry = true } = {}) {
    idle.hidden = allowRetry;
    lockedBlock.hidden = true;
    errorBlock.hidden = false;
    retryBtn.hidden = !allowRetry;
    errTitle.textContent = title || "API KEY ERROR";
    errMsg.textContent = msg || "API key validation failed.";
  }
  function showIdle() {
    idle.hidden = false;
    errorBlock.hidden = true;
    lockedBlock.hidden = true;
  }

  return { showError, showIdle, isReady: () => ready };
}

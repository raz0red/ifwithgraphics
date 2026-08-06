export function createInputUI(el, state, onSend) {
  /* el: cmdInput, cmdDisplay, cmdCursor, player */

  const history = [];
  let historyIndex = -1; // -1 == editing a fresh, unsubmitted command
  let draft = "";

  function showCursor(on) {
    el.cmdCursor.classList.toggle("shown", on);
  }

  function setValue(v) {
    el.cmdInput.value = v;
    el.cmdDisplay.textContent = v.toUpperCase();
  }

  el.cmdInput.addEventListener("input", function () {
    el.cmdDisplay.textContent = el.cmdInput.value.toUpperCase();
    if (historyIndex === -1) draft = el.cmdInput.value;
  });

  el.cmdInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      const cmd = el.cmdInput.value.trim();
      if (cmd && cmd !== history[history.length - 1]) history.push(cmd);
      historyIndex = -1;
      draft = "";
      onSend();
      /* onSend() -> engine.step() runs synchronously and can land the game
         on a fresh @read_char prompt, flipping state.awaitingKeyPress to
         true before this same keydown finishes bubbling to document's
         listener — which would then replay this same Enter as the answer
         to that brand-new prompt. Stop it here so one keystroke is one
         action. */
      e.stopPropagation();
      return;
    }
    if (e.key === "ArrowUp") {
      if (history.length === 0) return;
      e.preventDefault();
      if (historyIndex === -1) draft = el.cmdInput.value;
      historyIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setValue(history[historyIndex]);
      return;
    }
    if (e.key === "ArrowDown") {
      if (historyIndex === -1) return;
      e.preventDefault();
      historyIndex += 1;
      if (historyIndex >= history.length) {
        historyIndex = -1;
        setValue(draft);
      } else {
        setValue(history[historyIndex]);
      }
      return;
    }
    /* Caret movement is disabled for now — keep it pinned to the end. */
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      return;
    }
  });

  el.player.addEventListener("click", function () {
    // On touch, core.js reveals the on-screen command input at the top of the
    // screen instead of focusing this hidden field (which you can't see).
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
    if (!el.cmdInput.disabled) el.cmdInput.focus();
  });

  /* Exposed so the mobile command bar (core.js) can replay recent commands
     via tap-to-cycle — there's no ArrowUp/ArrowDown on a touch keyboard, so
     it needs a different way to reach the same history this tracks. */
  /* setValue is exposed so callers can seed the input programmatically and
     still get the desktop echo — cmdDisplay only mirrors cmdInput via the
     "input" event, which assigning .value directly does not fire, so a bare
     el.cmdInput.value = "..." would send the right command while showing an
     empty prompt line. */
  return { showCursor: showCursor, getHistory: () => history, setValue: setValue };
}

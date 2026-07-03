export function createInputUI(el, state, onSend) {
  /* el: cmdInput, cmdDisplay, cmdCursor, player */

  const history = [];
  let historyIndex = -1; // -1 == editing a fresh, unsubmitted command
  let draft = "";

  function showCursor(on) {
    el.cmdCursor.classList.toggle("shown", on);
  }

  function setValue(v) {
    el.cmdInput.value         = v;
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
    if (!el.cmdInput.disabled) el.cmdInput.focus();
  });

  return { showCursor: showCursor };
}

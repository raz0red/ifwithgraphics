export function createInputUI(el, state, onSend) {
  /* el: cmdInput, cmdDisplay, cmdCursor, player */

  function showCursor(on) {
    el.cmdCursor.classList.toggle("shown", on);
  }

  el.cmdInput.addEventListener("input", function () {
    el.cmdDisplay.textContent = el.cmdInput.value.toUpperCase();
  });

  el.cmdInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") onSend();
  });

  el.player.addEventListener("click", function () {
    if (!el.cmdInput.disabled) el.cmdInput.focus();
  });

  return { showCursor: showCursor };
}

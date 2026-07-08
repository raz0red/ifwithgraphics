export function createGridUI(el) {
  /* el: gridView, gridInner, gridCursor */
  let lastRenderArgs = null;

  /* Split a line of text and its same-shaped '1'/'0' style mask into runs,
     wrapping reverse-video runs in a span. Some screens (Beyond Zork's
     character menu) move the highlighted item via reverse video alone, with
     no other visible change — without rendering this, arrow-key navigation
     looks completely dead even though it's working. */
  function renderLine(text, styleLine) {
    const frag = document.createDocumentFragment();
    let i = 0;
    while (i < text.length) {
      const rv = styleLine[i] === "1";
      let j = i + 1;
      while (j < text.length && (styleLine[j] === "1") === rv) j++;
      const run = text.slice(i, j);
      /* A reverse-video run of pure whitespace has no visible content of
         its own — it only ever shows up as a solid block (Bureaucracy
         marks every form field's blank with one of these), which reads as
         a stray cursor sitting on every line. Real reverse-video content
         (Beyond Zork's highlighted menu selection, etc.) always has actual
         text in the run, so this only suppresses the blank markers. */
      if (rv && run.trim() !== "") {
        const span = document.createElement("span");
        span.className = "grid-rv";
        span.textContent = run;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(run));
      }
      i = j;
    }
    return frag;
  }

  /* Render the game's own screen buffer verbatim and draw a cursor block at
     (row, col). Using the 'ch'/line-height CSS units keeps the cursor's
     position in exact sync with the monospace text grid without needing to
     measure character metrics in JS. */
  function render(fullScreen, cursorRow, cursorCol, styleMask) {
    lastRenderArgs = [fullScreen, cursorRow, cursorCol, styleMask];
    const lines = fullScreen.split("\n");
    const styleLines = (styleMask || "").split("\n");

    /* The game's own screen buffer is a fixed row count (e.g. 24) that all
       needs to be visible at once, the way a real terminal shows its full
       screen without scrolling. The CSS font-size clamp is tuned for the
       narrower description strip and can be too large for some viewport
       shapes once expanded to a whole extra row count, clipping rows off
       the top before scrollIntoView below catches up. Size the font to
       fit the exact row count in the available height instead, applying
       it to both the text and the cursor so their shared 'ch'/'lh' units
       stay in sync. */
    const LINE_HEIGHT_RATIO = 1.4;
    const available = el.gridView.clientHeight;
    let lineHeightPx = null;
    if (lines.length > 0 && available > 0) {
      const fontPx = Math.max(6, Math.floor(available / lines.length / LINE_HEIGHT_RATIO));
      lineHeightPx = fontPx * LINE_HEIGHT_RATIO;
      el.gridInner.style.fontSize = `${fontPx}px`;
      el.gridCursor.style.fontSize = `${fontPx}px`;
    }

    el.gridInner.textContent = "";
    lines.forEach((line, i) => {
      el.gridInner.appendChild(renderLine(line, styleLines[i] || ""));
      if (i < lines.length - 1) el.gridInner.appendChild(document.createTextNode("\n"));
    });
    /* 'ch' resolves correctly against the cursor's own font-size, but the
       'lh' unit measured wrong here (a browser quirk with position:absolute
       inline elements) — compute the vertical offset in px directly instead
       of trusting 'lh' to track the dynamically-set font-size above. */
    /* Observed empirically to land 2 columns left of the true position
       (Bureaucracy's form fields) — corrected with a constant offset here
       rather than chasing the interpreter-side root cause. */
    const CURSOR_COL_CORRECTION = 2;
    el.gridCursor.style.left = `${cursorCol + CURSOR_COL_CORRECTION}ch`;
    if (lineHeightPx != null) {
      /* The full line-height includes leading space above/below the glyphs,
         so a cursor block that height reads as oversized — a block cursor
         should hug the text, not the whole line box. */
      const CURSOR_HEIGHT_RATIO = 0.65;
      const cursorHeightPx = lineHeightPx * CURSOR_HEIGHT_RATIO;
      el.gridCursor.style.height = `${cursorHeightPx}px`;
      el.gridCursor.style.top = `${cursorRow * lineHeightPx + (lineHeightPx - cursorHeightPx)}px`;
    } else {
      el.gridCursor.style.top = `${cursorRow}lh`;
    }

    /* Forms taller than the viewport (Bureaucracy's field list, ~20 rows)
       would otherwise show the static top of the screen while the actual
       active field — wherever the cursor currently is — sits scrolled out
       of view. Keep the cursor in view, the same way a real terminal would.
       Reset scroll first: scrollIntoView only moves the position if the
       cursor isn't already visible at the *current* offset, so a scroll
       left over from a taller previous screen can persist even though this
       screen's content no longer needs it, hiding this screen's own top
       rows behind a stale offset. */
    el.gridView.scrollTop = 0;
    el.gridCursor.scrollIntoView({ block: "nearest" });
  }

  function show() {
    el.gridView.hidden = false;
    el.gridView.classList.add("grid-expanded");
  }

  function hide() {
    el.gridView.hidden = true;
    el.gridView.classList.remove("grid-expanded");
  }

  /* The rest of the player resizes live with the viewport via CSS (dvw/dvh
     units), but the grid's font-size is a fixed px value computed only when
     render() runs — which only happens on game interaction. Resize the
     window alone (no keypress) and everything else rescales instantly while
     the grid sits stuck at its old size until the next turn. Re-run the same
     sizing/positioning against the last-known screen data whenever the
     window resizes, so it tracks live like everything else. */
  window.addEventListener("resize", () => {
    if (!el.gridView.hidden && lastRenderArgs) render(...lastRenderArgs);
  });

  return { render, show, hide };
}

// import { dbg } from "./debug.js"; // temporary mobile touch-debug overlay, see js/ui/debug.js

export function createTextUI(el, state, showCursor, hideMobileCmd) {
  /* el: sceneText, sceneTextInner, continueHint, cmdPrompt, cmdDisplay, cmdInput */

  /* On touch, core.js's mobile-cmd bar is the only sanctioned way to raise
     the on-screen keyboard (a deliberate tap). Focusing the real cmdInput
     here used to be harmless on touch — it only ever ran from async engine
     callbacks, which mobile browsers don't treat as a user gesture, so the
     keyboard never actually appeared. Touch-drag scrolling below calls this
     synchronously from a real touchmove, which mobile browsers DO honor —
     so without this guard, scrolling to the bottom of the text pops the
     keyboard mid-drag. */
  const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  /* Shrink sceneText height to an exact multiple of lineH so every scroll
     page lands cleanly on a line boundary with no partial lines visible. */
  function calibrateTextHeight() {
    el.sceneText.style.height = "";
    const cs = getComputedStyle(el.sceneText);
    const pt = parseFloat(cs.paddingTop) || 0;
    const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    const n = Math.max(1, Math.floor((el.sceneText.clientHeight - pt) / lineH));
    el.sceneText.style.height = `${Math.round(pt + n * lineH)}px`;
  }

  /* Four display states:
     1. awaitingKeyPress           → real inline prompt, or "PRESS ANY KEY TO CONTINUE"
     2. More content below         → "PRESS SPACE TO CONTINUE"
     3. contentCompleted           → prompt (sticky after reaching bottom)
     awaitingKeyPress is checked unconditionally, independent of scroll
     position: these screens (menus, forms) redraw on every keystroke and the
     "current field" lives only in the small prompt bar, not in the scrollable
     body — gating this on scroll position ("are we at the bottom of the body
     text") makes input capture depend on where the body happens to be
     scrolled, which has nothing to do with whether the game wants a key. */
  function updateUI() {
    if (state.sliding || state.scrollAnimating) return;

    if (state.awaitingKeyPress) {
      /* cmdPrompt already holds the game's own inline prompt (e.g. "Your
         sex (M/F):") when one exists — hiding it and showing only a generic
         "press any key" banner meant the player had no idea a keystroke was
         about to be validated as real field data, not just a pause. Show
         the real prompt whenever there is one; fall back to the generic
         banner only when the game gave us nothing more specific than ">". */
      const hasRealPrompt = el.cmdPrompt.textContent && el.cmdPrompt.textContent !== ">";
      el.continueHint.textContent = "PRESS ANY KEY TO CONTINUE";
      el.continueHint.hidden = hasRealPrompt;
      el.cmdPrompt.hidden = !hasRealPrompt;
      el.cmdDisplay.hidden = true;
      showCursor(false);
      el.cmdInput.disabled = true;
      return;
    }

    const atBottom =
      el.sceneText.scrollHeight <= el.sceneText.scrollTop + el.sceneText.clientHeight + 2;

    if (atBottom) {
      state.contentCompleted = true;
      el.continueHint.hidden = true;
      el.cmdPrompt.hidden = false;
      el.cmdDisplay.hidden = false;
      showCursor(true);
      el.cmdInput.disabled = false;
      if (!isTouch) el.cmdInput.focus();
      return;
    }

    if (state.contentCompleted) {
      el.continueHint.hidden = true;
      el.cmdPrompt.hidden = false;
      el.cmdDisplay.hidden = false;
      showCursor(true);
      el.cmdInput.disabled = false;
      if (!isTouch) el.cmdInput.focus();
      return;
    }

    el.continueHint.textContent = "PRESS SPACE TO CONTINUE";
    el.continueHint.hidden = false;
    el.cmdPrompt.hidden = true;
    el.cmdDisplay.hidden = true;
    showCursor(false);
    el.cmdInput.disabled = true;
  }

  /* Scroll forward one page, snapped to line boundaries. */
  function scrollDownAnimated() {
    if (state.scrollAnimating || state.sliding) return;

    const cs = getComputedStyle(el.sceneText);
    const pt = parseFloat(cs.paddingTop) || 0;
    const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    const H = el.sceneText.clientHeight;
    const n = Math.max(1, Math.floor((H - pt) / lineH));
    const pageH = n * lineH;

    const currentPage = Math.round(el.sceneText.scrollTop / pageH);
    const targetTop = Math.min(
      Math.round((currentPage + 1) * pageH),
      el.sceneText.scrollHeight - H
    );

    if (targetTop <= el.sceneText.scrollTop + 1) {
      state.scrollAnimating = false;
      updateUI();
      return;
    }

    state.scrollAnimating = true;
    el.continueHint.hidden = true;

    const startTop = el.sceneText.scrollTop;
    const duration = n * 160;
    let startTime = null;

    function step(ts) {
      if (!startTime) startTime = ts;
      const t = Math.min((ts - startTime) / duration, 1);
      el.sceneText.scrollTop = Math.round(startTop + (targetTop - startTop) * t);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        el.sceneText.scrollTop = targetTop;
        state.scrollAnimating = false;
        updateUI();
      }
    }
    requestAnimationFrame(step);
  }

  /* Slide new content in from below. curPane captures the currently visible
     portion (respecting scrollTop), nxtPane shows the incoming text. */
  function slideToContent(newText) {
    /* Don't touch state.awaitingKeyPress here — onRoomEntered just set it from
       the engine's actual isKeyPress signal for this new content. Clobbering it
       to false meant "press any key" (@read_char) moments always got downgraded
       to a normal line-input prompt as soon as any prior screen had rendered. */
    state.contentCompleted = false;
    state.sliding = true;
    showCursor(false);
    el.continueHint.hidden = true;
    el.cmdPrompt.hidden = true;
    el.cmdDisplay.hidden = true;
    el.cmdInput.disabled = true;

    const cs = getComputedStyle(el.sceneText);
    const H = el.sceneText.clientHeight;
    const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    const duration = Math.max(1, Math.floor(H / lineH)) * 160;

    const rect = el.sceneText.getBoundingClientRect();
    const blw = parseFloat(cs.borderLeftWidth) || 0;
    const btw = parseFloat(cs.borderTopWidth) || 0;

    const clip = document.createElement("div");
    clip.style.cssText = [
      "position:fixed",
      `top:${rect.top + btw}px`,
      `left:${rect.left + blw}px`,
      `width:${el.sceneText.clientWidth}px`,
      `height:${H}px`,
      "overflow:hidden",
      "z-index:50",
      "pointer-events:none"
    ].join(";");

    const textStyle = [
      `padding:${cs.padding}`,
      `white-space:${cs.whiteSpace}`,
      `font-family:${cs.fontFamily}`,
      `font-size:${cs.fontSize}`,
      `letter-spacing:${cs.letterSpacing}`,
      `line-height:${cs.lineHeight}`,
      `text-transform:${cs.textTransform}`,
      `color:${cs.color}`,
      "box-sizing:border-box"
    ].join(";");

    const scrollOff = el.sceneText.scrollTop;
    const curPane = document.createElement("div");
    curPane.style.cssText = `background:#000;height:${H}px;overflow:hidden;`;
    const curInner = document.createElement("div");
    curInner.style.cssText = `${textStyle};height:auto;margin-top:-${scrollOff}px;`;
    curInner.textContent = el.sceneTextInner.textContent;
    curPane.appendChild(curInner);

    const nxtPane = document.createElement("div");
    nxtPane.style.cssText = `background:#000;height:${H}px;overflow:hidden;${textStyle}`;
    nxtPane.textContent = newText;

    const slide = document.createElement("div");
    slide.appendChild(curPane);
    slide.appendChild(nxtPane);
    clip.appendChild(slide);
    document.body.appendChild(clip);

    el.sceneTextInner.textContent = newText;
    el.sceneText.scrollTop = 0;

    function finish() {
      document.body.removeChild(clip);
      state.sliding = false;
      updateUI();
    }

    let startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      const t = Math.min((ts - startTime) / duration, 1);
      slide.style.transform = `translateY(-${Math.round(H * t)}px)`;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        requestAnimationFrame(finish);
      }
    }
    requestAnimationFrame(step);
  }

  /* Re-evaluate hint/prompt on manual scroll. */
  el.sceneText.addEventListener("scroll", updateUI);

  /* Drive wheel/trackpad scroll ourselves — overflow:hidden blocks native scroll. */
  el.sceneText.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (state.scrollAnimating || state.sliding) return;
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 20;
      if (e.deltaMode === 2) delta *= el.sceneText.clientHeight;
      el.sceneText.scrollTop = Math.max(
        0,
        Math.min(
          el.sceneText.scrollTop + delta,
          el.sceneText.scrollHeight - el.sceneText.clientHeight
        )
      );
      updateUI();
    },
    { passive: false }
  );

  /* Touch drag scroll — same reason as wheel above. A movement threshold
     lets a plain tap (no meaningful drag) fall through untouched to
     core.js's document-level tap-to-continue / tap-to-reveal-input handler;
     a recognized drag's touchend below calls preventDefault(), which
     suppresses the browser's synthesized click for that gesture so it never
     reaches that handler in the first place. */
  let touchStartY = 0;
  let touchStartTop = 0;
  let touchDragging = false;

  el.sceneText.addEventListener(
    "touchstart",
    (e) => {
      if (state.scrollAnimating || state.sliding) return;
      touchStartY = e.touches[0].clientY;
      touchStartTop = el.sceneText.scrollTop;
      touchDragging = false;
      // dbg(`touchstart scrollTop=${touchStartTop}`);
    },
    { passive: true }
  );

  el.sceneText.addEventListener(
    "touchmove",
    (e) => {
      if (state.scrollAnimating || state.sliding) return;
      const delta = touchStartY - e.touches[0].clientY;
      /* Generous slop: natural finger jitter during a plain tap easily
         exceeds a few px, and misreading a tap as a drag suppresses its
         click below (see touchend) instead of acting on it. */
      if (!touchDragging && Math.abs(delta) < 16) return;
      if (!touchDragging) {
        // dbg(`touchmove -> DRAGGING delta=${delta.toFixed(0)}`);
        /* A drag means "reading", not "typing" — dismiss the on-screen
           keyboard bar if it was left open, both so it isn't stuck open
           through the scroll and so the real keyboard closes (and the
           body-level touch-action it disables — see hideMobileCmd in
           core.js — is restored) before the drag actually starts moving
           content. */
        if (el.mobileCmd.classList.contains("shown")) hideMobileCmd();
      }
      touchDragging = true;
      e.preventDefault();
      el.sceneText.scrollTop = Math.max(
        0,
        Math.min(touchStartTop + delta, el.sceneText.scrollHeight - el.sceneText.clientHeight)
      );
      updateUI();
    },
    { passive: false }
  );

  el.sceneText.addEventListener(
    "touchend",
    (e) => {
      if (touchDragging) {
        /* Calling preventDefault() here — not just on touchmove — is what
           actually suppresses the browser's synthesized click for this touch
           sequence at the source. An earlier attempt tracked a "just
           scrolled" flag with a timeout instead, but the browser's own
           delayed click for a drag showed up anywhere from 0.5s-4s later —
           no fixed window could reliably cover that without also risking
           eating a genuinely separate next tap. */
        e.preventDefault();
      }
      // dbg(`touchend dragging=${touchDragging}`);
      touchDragging = false;
    },
    { passive: false }
  );

  return {
    calibrateTextHeight,
    updateUI,
    scrollDownAnimated,
    slideToContent
  };
}

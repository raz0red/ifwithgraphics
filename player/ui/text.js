export function createTextUI(el, state, showCursor) {
  /* el: sceneText, sceneTextInner, continueHint, cmdPrompt, cmdDisplay, cmdInput */

  /* Shrink sceneText height to an exact multiple of lineH so every scroll
     page lands cleanly on a line boundary with no partial lines visible. */
  function calibrateTextHeight() {
    el.sceneText.style.height = "";
    var cs    = getComputedStyle(el.sceneText);
    var pt    = parseFloat(cs.paddingTop) || 0;
    var lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    var n     = Math.max(1, Math.floor((el.sceneText.clientHeight - pt) / lineH));
    el.sceneText.style.height = Math.round(pt + n * lineH) + "px";
  }

  /* Three display states:
     1. More content below         → "PRESS SPACE TO CONTINUE"
     2. awaitingKeyPress at bottom → "PRESS ANY KEY TO CONTINUE"
     3. contentCompleted           → prompt (sticky after reaching bottom) */
  function updateUI() {
    if (state.sliding || state.scrollAnimating) return;
    var atBottom = el.sceneText.scrollHeight <= el.sceneText.scrollTop + el.sceneText.clientHeight + 2;

    if (atBottom) {
      if (state.awaitingKeyPress) {
        el.continueHint.textContent = "PRESS ANY KEY TO CONTINUE";
        el.continueHint.hidden = false;
        el.cmdPrompt.hidden  = true;
        el.cmdDisplay.hidden = true;
        showCursor(false);
        el.cmdInput.disabled = true;
        return;
      }
      state.contentCompleted    = true;
      el.continueHint.hidden    = true;
      el.cmdPrompt.hidden       = false;
      el.cmdDisplay.hidden      = false;
      showCursor(true);
      el.cmdInput.disabled      = false;
      el.cmdInput.focus();
      return;
    }

    if (state.contentCompleted) {
      el.continueHint.hidden = true;
      el.cmdPrompt.hidden    = false;
      el.cmdDisplay.hidden   = false;
      showCursor(true);
      el.cmdInput.disabled   = false;
      el.cmdInput.focus();
      return;
    }

    el.continueHint.textContent = "PRESS SPACE TO CONTINUE";
    el.continueHint.hidden      = false;
    el.cmdPrompt.hidden         = true;
    el.cmdDisplay.hidden        = true;
    showCursor(false);
    el.cmdInput.disabled        = true;
  }

  /* Scroll forward one page, snapped to line boundaries. */
  function scrollDownAnimated() {
    if (state.scrollAnimating || state.sliding) return;

    var cs    = getComputedStyle(el.sceneText);
    var pt    = parseFloat(cs.paddingTop) || 0;
    var lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    var H     = el.sceneText.clientHeight;
    var n     = Math.max(1, Math.floor((H - pt) / lineH));
    var pageH = n * lineH;

    var currentPage = Math.round(el.sceneText.scrollTop / pageH);
    var targetTop   = Math.min(
      Math.round((currentPage + 1) * pageH),
      el.sceneText.scrollHeight - H
    );

    if (targetTop <= el.sceneText.scrollTop + 1) {
      state.scrollAnimating = false;
      updateUI();
      return;
    }

    state.scrollAnimating     = true;
    el.continueHint.hidden    = true;

    var startTop  = el.sceneText.scrollTop;
    var startTime = null;
    var duration  = n * 160;

    function step(ts) {
      if (!startTime) startTime = ts;
      var t = Math.min((ts - startTime) / duration, 1);
      el.sceneText.scrollTop = Math.round(startTop + (targetTop - startTop) * t);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        el.sceneText.scrollTop = targetTop;
        state.scrollAnimating  = false;
        updateUI();
      }
    }
    requestAnimationFrame(step);
  }

  /* Slide new content in from below. curPane captures the currently visible
     portion (respecting scrollTop), nxtPane shows the incoming text. */
  function slideToContent(newText) {
    state.contentCompleted = false;
    state.awaitingKeyPress = false;
    state.sliding          = true;
    showCursor(false);
    el.continueHint.hidden = true;
    el.cmdPrompt.hidden    = true;
    el.cmdDisplay.hidden   = true;
    el.cmdInput.disabled   = true;

    var cs       = getComputedStyle(el.sceneText);
    var H        = el.sceneText.clientHeight;
    var lineH    = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    var duration = Math.max(1, Math.floor(H / lineH)) * 160;

    var rect = el.sceneText.getBoundingClientRect();
    var blw  = parseFloat(cs.borderLeftWidth) || 0;
    var btw  = parseFloat(cs.borderTopWidth)  || 0;

    var clip = document.createElement("div");
    clip.style.cssText = [
      "position:fixed",
      "top:"    + (rect.top  + btw) + "px",
      "left:"   + (rect.left + blw) + "px",
      "width:"  + el.sceneText.clientWidth  + "px",
      "height:" + H + "px",
      "overflow:hidden",
      "z-index:50",
      "pointer-events:none"
    ].join(";");

    var textStyle = [
      "padding:"        + cs.padding,
      "white-space:"    + cs.whiteSpace,
      "font-family:"    + cs.fontFamily,
      "font-size:"      + cs.fontSize,
      "letter-spacing:" + cs.letterSpacing,
      "line-height:"    + cs.lineHeight,
      "text-transform:" + cs.textTransform,
      "color:"          + cs.color,
      "box-sizing:border-box"
    ].join(";");

    var scrollOff = el.sceneText.scrollTop;
    var curPane   = document.createElement("div");
    curPane.style.cssText = "background:#000;height:" + H + "px;overflow:hidden;";
    var curInner  = document.createElement("div");
    curInner.style.cssText = textStyle + ";height:auto;margin-top:-" + scrollOff + "px;";
    curInner.textContent   = el.sceneTextInner.textContent;
    curPane.appendChild(curInner);

    var nxtPane = document.createElement("div");
    nxtPane.style.cssText = "background:#000;height:" + H + "px;overflow:hidden;" + textStyle;
    nxtPane.textContent   = newText;

    var slide = document.createElement("div");
    slide.appendChild(curPane);
    slide.appendChild(nxtPane);
    clip.appendChild(slide);
    document.body.appendChild(clip);

    el.sceneTextInner.textContent = newText;
    el.sceneText.scrollTop        = 0;

    function finish() {
      document.body.removeChild(clip);
      state.sliding = false;
      updateUI();
    }

    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var t = Math.min((ts - startTime) / duration, 1);
      slide.style.transform = "translateY(-" + Math.round(H * t) + "px)";
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
  el.sceneText.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (state.scrollAnimating || state.sliding) return;
    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 20;
    if (e.deltaMode === 2) delta *= el.sceneText.clientHeight;
    el.sceneText.scrollTop = Math.max(0, Math.min(
      el.sceneText.scrollTop + delta,
      el.sceneText.scrollHeight - el.sceneText.clientHeight
    ));
    updateUI();
  }, { passive: false });

  return {
    calibrateTextHeight: calibrateTextHeight,
    updateUI:            updateUI,
    scrollDownAnimated:  scrollDownAnimated,
    slideToContent:      slideToContent
  };
}

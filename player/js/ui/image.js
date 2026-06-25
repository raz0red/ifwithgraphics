export function createImageUI(el, state, onResize) {
  /* el: sceneWrap, sceneImg, scenePlaceholder, placeholderLabel, diskLed, dotLabel, player */

  var currentImageAR    = null;
  var playerWidthLocked = false;
  var ledTimer          = null;
  var dotTimer          = null;

  function startDiskAnimation() {
    var dotCount = 0;
    dotTimer = setInterval(function () {
      el.dotLabel.textContent = dotCount > 0 ? Array(dotCount + 1).join(".") : "";
      dotCount = (dotCount + 1) % 4;
    }, 1800);

    (function cycle() {
      el.diskLed.classList.add("active");
      var burstMs = 250 + Math.random() * 500;

      if (Math.random() < 0.6) {
        var flutterAt = burstMs * (0.35 + Math.random() * 0.4);
        ledTimer = setTimeout(function () {
          el.diskLed.classList.remove("active");
          ledTimer = setTimeout(function () {
            el.diskLed.classList.add("active");
            ledTimer = setTimeout(function () {
              el.diskLed.classList.remove("active");
              ledTimer = setTimeout(cycle, 180 + Math.random() * 550);
            }, burstMs - flutterAt);
          }, 18 + Math.random() * 35);
        }, flutterAt);
      } else {
        ledTimer = setTimeout(function () {
          el.diskLed.classList.remove("active");
          ledTimer = setTimeout(cycle, 180 + Math.random() * 550);
        }, burstMs);
      }
    })();
  }

  function stopDiskAnimation() {
    clearInterval(dotTimer);
    clearTimeout(ledTimer);
    dotTimer = null;
    ledTimer = null;
    el.diskLed.classList.remove("active");
    el.dotLabel.textContent = "";
  }

  function applyPlayerWidth(animated) {
    if (!currentImageAR) return;
    var newW = Math.min(el.sceneWrap.offsetHeight * currentImageAR, window.innerWidth);
    if (animated) {
      el.player.style.transition = "width 0.5s ease";
      setTimeout(function () { el.player.style.transition = ""; }, 550);
    }
    el.player.style.width = newW + "px";
  }

  function showPlaceholder(label) {
    stopDiskAnimation();
    el.sceneImg.removeAttribute("src");
    el.sceneImg.hidden                = true;
    el.scenePlaceholder.style.display = "flex";
    el.placeholderLabel.textContent   = label || "";
    if (label === "LOADING IMAGE") startDiskAnimation();
  }

  function revealWithBlinds() {
    var STRIPS  = 10;
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;pointer-events:none;";
    for (var i = 0; i < STRIPS; i++) {
      var s = document.createElement("div");
      s.style.cssText = "flex:1;background:#000;transform-origin:center;transition:transform 1.2s ease-in-out;";
      overlay.appendChild(s);
    }
    el.sceneWrap.appendChild(overlay);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (var i = 0; i < overlay.children.length; i++)
          overlay.children[i].style.transform = "scaleY(0)";
        setTimeout(function () { el.sceneWrap.removeChild(overlay); }, 1300);
      });
    });
  }

  function showImage(url, roomKey) {
    el.sceneImg.onload = function () {
      if (roomKey !== state.currentRoomKey) return;
      stopDiskAnimation();
      el.scenePlaceholder.style.display = "none";
      el.sceneImg.hidden = false;
      requestAnimationFrame(function () {
        if (!playerWidthLocked) {
          currentImageAR    = el.sceneImg.naturalWidth / el.sceneImg.naturalHeight;
          playerWidthLocked = true;
          applyPlayerWidth(true);
        }
        revealWithBlinds();
      });
    };
    el.sceneImg.onerror = function () { showPlaceholder(""); };
    el.sceneImg.src = url;
  }

  window.addEventListener("resize", function () {
    applyPlayerWidth(false);
    if (onResize) onResize();
  });

  return {
    showImage:          showImage,
    showPlaceholder:    showPlaceholder,
    startDiskAnimation: startDiskAnimation,
    stopDiskAnimation:  stopDiskAnimation,
    applyPlayerWidth:   applyPlayerWidth
  };
}

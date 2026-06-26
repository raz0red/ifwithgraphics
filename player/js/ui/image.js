export function createImageUI(el, state, onResize) {
  /* el: sceneWrap, sceneImg, scenePlaceholder, placeholderLabel, diskLed, dotLabel, player */

  let ledTimer = null;
  let dotTimer = null;

  function startDiskAnimation() {
    let dotCount = 0;
    dotTimer = setInterval(() => {
      el.dotLabel.textContent = ".".repeat(dotCount);
      dotCount = (dotCount + 1) % 4;
    }, 1800);

    function cycle() {
      el.diskLed.classList.add("active");
      const burstMs = 250 + Math.random() * 500;

      if (Math.random() < 0.6) {
        const flutterAt = burstMs * (0.35 + Math.random() * 0.4);
        ledTimer = setTimeout(() => {
          el.diskLed.classList.remove("active");
          ledTimer = setTimeout(() => {
            el.diskLed.classList.add("active");
            ledTimer = setTimeout(() => {
              el.diskLed.classList.remove("active");
              ledTimer = setTimeout(cycle, 180 + Math.random() * 550);
            }, burstMs - flutterAt);
          }, 18 + Math.random() * 35);
        }, flutterAt);
      } else {
        ledTimer = setTimeout(() => {
          el.diskLed.classList.remove("active");
          ledTimer = setTimeout(cycle, 180 + Math.random() * 550);
        }, burstMs);
      }
    }
    cycle();
  }

  function stopDiskAnimation() {
    clearInterval(dotTimer);
    clearTimeout(ledTimer);
    dotTimer = null;
    ledTimer = null;
    el.diskLed.classList.remove("active");
    el.dotLabel.textContent = "";
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
    const STRIPS  = 10;
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;pointer-events:none;";
    for (let i = 0; i < STRIPS; i++) {
      const s = document.createElement("div");
      s.style.cssText = "flex:1;background:#000;transform-origin:center;transition:transform 1.2s ease-in-out;";
      overlay.appendChild(s);
    }
    el.sceneWrap.appendChild(overlay);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const child of overlay.children) child.style.transform = "scaleY(0)";
        setTimeout(() => el.sceneWrap.removeChild(overlay), 1300);
      });
    });
  }

  function showImage(url, roomKey) {
    el.sceneImg.onload = () => {
      if (roomKey !== state.currentRoomKey) return;
      stopDiskAnimation();
      el.scenePlaceholder.style.display = "none";
      el.sceneImg.hidden = false;
      requestAnimationFrame(() => {
        revealWithBlinds();
      });
    };
    el.sceneImg.onerror = () => showPlaceholder("");
    el.sceneImg.src = url;
  }

  window.addEventListener("resize", () => {
    if (onResize) onResize();
  });

  return {
    showImage,
    showPlaceholder,
    startDiskAnimation,
    stopDiskAnimation,
  };
}

/* TEMPORARY diagnostic overlay for the mobile touch-scroll/tap investigation.
   Not meant to ship — remove once the touch handling is confirmed correct. */
let box = null;
const lines = [];

export function dbg(msg) {
  if (!box) {
    box = document.createElement("pre");
    box.style.cssText =
      "position:fixed;top:0;left:0;z-index:99999;background:rgba(0,0,0,0.85);" +
      "color:#0f0;font:10px monospace;padding:4px;margin:0;max-width:100vw;" +
      "max-height:45vh;overflow:hidden;pointer-events:none;white-space:pre-wrap;";
    document.body.appendChild(box);
  }
  const t = (performance.now() / 1000).toFixed(2);
  lines.push(`${t}s ${msg}`);
  if (lines.length > 18) lines.shift();
  box.textContent = lines.join("\n");
}

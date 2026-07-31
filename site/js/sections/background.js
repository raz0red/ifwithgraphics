// Fixed decorative backdrop: a slowly panning emerald grid plus ambient
// rising pixels. Purely visual (sits behind everything, pointer-events-none),
// so the pixels are baked at build time with random positions — no hydration
// needed. Replaces the original <GridBackground> / <FloatingPixels>.

function renderPixels(count = 35) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const left = (Math.random() * 100).toFixed(2);
    const big = Math.random() > 0.85;
    const size = big ? 'w-1.5 h-1.5' : 'w-0.5 h-0.5';
    const dur = (Math.random() * 15 + 12).toFixed(1);
    const delay = (Math.random() * -30).toFixed(1);
    const opacity = (Math.random() * 0.4 + 0.05).toFixed(2);
    out += `<span class="pixel absolute ${size} bg-emerald-500" style="left:${left}%;opacity:${opacity};--dur:${dur}s;--delay:${delay}s"></span>`;
  }
  return out;
}

export function renderBackgroundHTML() {
  return `
  <div class="fixed inset-0 z-0 pointer-events-none bg-zinc-950" aria-hidden="true">
    <div class="absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_top,transparent_0%,rgba(9,9,11,1)_85%)]"></div>
    <div class="animate-grid-pan absolute inset-0 z-0 opacity-[0.08] bg-[linear-gradient(to_right,rgba(34,197,94,1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(34,197,94,1)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem]"></div>
  </div>
  <div class="fixed inset-0 z-[1] pointer-events-none overflow-hidden" aria-hidden="true">
    ${renderPixels()}
  </div>`;
}

import { steps } from '../data.js';

export function renderHowItWorksHTML() {
  return `
  <div class="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-8 sm:p-12 space-y-12 text-center relative overflow-hidden reveal">
    <div class="space-y-3">
      <h2 class="text-3xl font-black text-white uppercase tracking-wider font-sans">How <span class="text-emerald-500">IFWG</span> Works</h2>
      <p class="text-zinc-400 text-sm max-w-2xl mx-auto font-sans leading-relaxed">
        Where classic text-adventure interpreters meet modern image generation.
      </p>
    </div>
    <div class="grid md:grid-cols-3 gap-8 text-left pt-4">
      ${steps
        .map(
          (s) => `
        <div class="space-y-4">
          <div class="flex items-center justify-center w-9 h-9 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-black text-sm select-none">${s.n}</div>
          <h3 class="text-lg font-bold text-white uppercase tracking-wide font-mono">${s.title}</h3>
          <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans">${s.html}</p>
        </div>`
        )
        .join('')}
    </div>
  </div>`;
}

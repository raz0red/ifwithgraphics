import { icon } from '../icons.js';
import { capabilities, PLAYER_URL } from '../data.js';

export function renderCapabilitiesHTML() {
  return `
  <div class="space-y-10">
    <div class="text-center reveal">
      <h2 class="text-3xl font-black text-white uppercase tracking-widest font-sans">Features</h2>
    </div>

    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
      ${capabilities
        .map(
          (c) => `
        <div class="p-6 border-2 border-emerald-500/40 bg-zinc-950/25 rounded-xl space-y-4 hover:border-emerald-400 hover:bg-zinc-950/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all shadow-[0_0_15px_rgba(16,185,129,0.05)] reveal">
          <div class="flex items-start justify-between">
            <div class="w-10 h-10 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              ${icon(c.icon, 'w-5 h-5')}
            </div>
            ${
              c.comingSoon
                ? '<span class="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">Coming Soon</span>'
                : ''
            }
          </div>
          <h4 class="font-bold text-white text-sm uppercase tracking-wider font-mono">${c.title}</h4>
          <p class="text-xs text-zinc-400 leading-relaxed font-sans">${c.description}</p>
        </div>`
        )
        .join('')}
    </div>

    <div class="border border-zinc-900 bg-zinc-950/40 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row justify-between items-center gap-6 text-left max-w-5xl mx-auto mt-12 hover:border-zinc-800 transition-all reveal">
      <div class="flex gap-4 items-center">
        <div class="w-12 h-12 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
          ${icon('book-open', 'w-6 h-6')}
        </div>
        <div class="space-y-1">
          <h3 class="text-lg font-bold text-white uppercase tracking-wider font-mono">Ready to Play?</h3>
          <p class="text-xs text-zinc-400 max-w-xl font-sans leading-relaxed">
            Browse supported classic titles, or launch the player to run your own story files.
          </p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3 shrink-0">
        <button data-nav="library" class="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold uppercase text-xs tracking-wider rounded flex items-center gap-1.5 shadow-md shadow-emerald-500/5 hover:shadow-emerald-500/15 transition-all transform active:scale-95 select-none cursor-pointer">
          ${icon('book-open', 'w-4 h-4')} Game Library
        </button>
        <a href="${PLAYER_URL}" class="px-5 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-white font-extrabold uppercase text-xs tracking-wider rounded flex items-center gap-1.5 shadow-lg transition-all transform active:scale-95 select-none">
          ${icon('play', 'w-3.5 h-3.5 fill-white')} Launch Player
        </a>
      </div>
    </div>
  </div>`;
}

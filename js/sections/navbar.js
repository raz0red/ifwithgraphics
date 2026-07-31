import { icon } from '../icons.js';
import { PLAYER_URL } from '../data.js';

// Nav tab buttons use data-nav="home|library"; the actual view swap is wired
// up centrally in main.js (setView) since several elements across the page
// trigger it.
export function renderNavbarHTML() {
  return `
  <nav id="navbar" class="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-6 sm:px-10 py-4 sm:py-6 sticky top-0 z-40">
    <div class="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
      <div class="flex items-center gap-3 cursor-pointer group fade-in-up" data-logo title="Interactive Fiction with Graphics">
        <div class="p-2 bg-emerald-500/15 border border-emerald-500/30 rounded group-hover:bg-emerald-500/25 transition-all">
          ${icon('terminal', 'w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform')}
        </div>
        <div class="text-left">
          <span class="font-black text-2xl tracking-tighter text-white">IF<span class="text-emerald-500">W</span>G</span>
          <span class="text-[10px] text-zinc-500 block uppercase font-sans tracking-widest font-semibold leading-none">Interactive Fiction with Graphics</span>
        </div>
      </div>

      <div class="flex items-center gap-1 sm:gap-2 fade-in-up">
        <button data-nav="home" class="px-4 py-2 text-sm font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1.5 border border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900">
          ${icon('layers', 'w-4 h-4')} Home
        </button>
        <button data-nav="library" class="px-4 py-2 text-sm font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1.5 border border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900">
          ${icon('book-open', 'w-4 h-4')} Game Library
        </button>
        <a href="${PLAYER_URL}" class="px-4 py-2 text-sm font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1.5 text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent">
          ${icon('gamepad-2', 'w-4 h-4')} Launch Player
        </a>
      </div>
    </div>
  </nav>`;
}

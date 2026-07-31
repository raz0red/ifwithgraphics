import { PLAYER_URL } from '../data.js';

export function renderFooterHTML() {
  const year = new Date().getFullYear();
  return `
  <footer id="site-footer" class="relative z-10 border-t border-zinc-900 bg-zinc-950/80 backdrop-blur-md px-6 sm:px-10 py-6 sm:py-8 mt-12 text-center text-xs select-none">
    <div class="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-zinc-500">
      <div>
        <span class="font-black text-white">IF<span class="text-emerald-500">W</span>G</span> &bull; Interactive Fiction With Graphics &copy; ${year}
      </div>
      <div class="flex gap-4">
        <button data-nav="home" class="hover:text-white cursor-pointer">Home</button>
        <span>&bull;</span>
        <button data-nav="library" class="hover:text-white cursor-pointer">Game Library</button>
        <span>&bull;</span>
        <a href="${PLAYER_URL}" class="hover:text-white flex items-center gap-0.5">
          Launch Player
        </a>
      </div>
    </div>
  </footer>`;
}

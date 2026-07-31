import { icon } from '../icons.js';
import { PLAYER_URL } from '../data.js';

export function renderFooterHTML() {
  const year = new Date().getFullYear();
  return `
  <footer id="site-footer" class="relative z-10 border-t border-zinc-900 bg-zinc-950/80 backdrop-blur-md px-6 sm:px-10 py-6 sm:py-8 mt-12 text-center text-xs select-none">
    <div class="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-zinc-500">
      <div>
        <span class="font-black text-white">IF<span class="text-emerald-500">W</span>G</span> &bull; Interactive Fiction With Graphics &copy; ${year}
      </div>
      <div class="flex items-center gap-5">
        <button data-nav="home" class="hover:text-white cursor-pointer flex items-center gap-1.5">${icon('layers', 'w-4 h-4')} Home</button>
        <button data-nav="library" class="hover:text-white cursor-pointer flex items-center gap-1.5">${icon('book-open', 'w-4 h-4')} Game Library</button>
        <a href="${PLAYER_URL}" class="hover:text-white flex items-center gap-1.5">${icon('gamepad-2', 'w-4 h-4')} Launch Player</a>
        <a href="https://github.com/raz0red/ifwithgraphics" target="_blank" rel="noopener noreferrer" class="hover:text-white flex items-center gap-1.5" aria-label="View source on GitHub">
          <svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
          GitHub
        </a>
      </div>
    </div>
  </footer>`;
}

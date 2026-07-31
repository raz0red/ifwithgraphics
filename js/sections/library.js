import { icon } from '../icons.js';

// The game directory renders from data/games.json (passed in by build.js).
// Field contract per game: id, title, author, year, description, pregenerated,
// includesFile, ifdbUrl, pagePath (in-IFWG launch page — the Play target),
// and optional image (card cover; falls back to a "live generation"
// placeholder when absent). Two axes drive the badges and filters:
// `pregenerated` (pregen art exists) and `includesFile` (story file ships).

function renderCover(game) {
  if (game.image) {
    // The pregen art has a dithered border/letterbox baked in; scale up a
    // touch (container clips overflow) to crop the frame out of the card.
    return `<img src="${game.image}" alt="${game.title}" loading="lazy" class="w-full h-full object-cover scale-[1.12] opacity-85 group-hover:opacity-100 transition-opacity" style="image-rendering:pixelated" />`;
  }
  return `
    <div class="absolute inset-0 bg-gradient-to-tr from-emerald-950/20 to-zinc-950 flex flex-col items-center justify-center p-4 text-center select-none">
      ${icon('terminal', 'w-8 h-8 text-emerald-500/25 mb-1 group-hover:scale-110 transition-transform')}
      <span class="font-mono text-[9px] uppercase tracking-widest text-emerald-500/40">LIVE GENERATION CAPABLE</span>
    </div>`;
}

function renderCard(game) {
  const isPregen = !!game.pregenerated;
  const includesFile = !!game.includesFile;
  return `
  <div id="game-card-${game.id}" data-game-card data-pregenerated="${isPregen}" data-includes-file="${includesFile}"
       class="border border-zinc-800 bg-zinc-950/20 rounded-lg p-6 flex flex-col justify-between transition-all relative overflow-hidden group hover:border-emerald-500/30 hover:shadow-[0_0_20px_-8px_rgba(16,185,129,0.15)]">
    <a href="${game.pagePath}" class="relative h-44 -mx-6 -mt-6 mb-4 overflow-hidden border-b border-zinc-900 flex items-center justify-center bg-zinc-950 cursor-pointer" aria-label="Play ${game.title}">
      ${renderCover(game)}
    </a>
    <div class="absolute top-0 bottom-0 left-0 w-1 ${isPregen ? 'bg-emerald-500' : 'bg-zinc-700'}"></div>

    <div class="space-y-4 text-left pl-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider border ${
          isPregen ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
        }">${isPregen ? 'Pre-generated Graphics' : 'Generative Graphics'}</span>
        <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider border ${
          includesFile ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-zinc-900 text-zinc-500 border-zinc-800'
        }">${includesFile ? 'Includes Story File' : 'Provide Story File'}</span>
      </div>

      <div class="space-y-1">
        <h3 class="text-xl font-bold text-white tracking-wide uppercase"><a href="${game.pagePath}" class="hover:text-emerald-400 transition-colors">${game.title}</a></h3>
        <div class="flex items-center justify-between gap-2 flex-wrap pt-0.5">
          <p class="text-xs text-zinc-500 font-bold">By ${game.author} (${game.year})</p>
          ${
            game.ifdbUrl
              ? `<a href="${game.ifdbUrl}" target="_blank" rel="noreferrer" class="text-[10px] text-emerald-400/80 hover:text-emerald-300 font-mono flex items-center gap-1 transition-colors hover:underline">IFDB Profile ${icon('external-link', 'w-2.5 h-2.5')}</a>`
              : ''
          }
        </div>
      </div>

      <p class="text-xs text-zinc-400 leading-relaxed font-sans line-clamp-3">${game.description}</p>
    </div>

    <div class="mt-6 pt-4 border-t border-zinc-900/60 flex items-center justify-between pl-2">
      <span class="text-[10px] text-zinc-500 uppercase tracking-widest font-bold flex items-center gap-1.5">
        ${
          isPregen
            ? `${icon('sparkles', 'w-3.5 h-3.5 text-emerald-400')}<span>Pre-generated</span>`
            : `${icon('cpu', 'w-3.5 h-3.5 text-zinc-600')}<span>AI Graphics</span>`
        }
      </span>
      <a href="${game.pagePath}" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold uppercase text-xs tracking-wider rounded flex items-center gap-1.5 shadow-md shadow-emerald-500/5 hover:shadow-emerald-500/15 transform active:scale-95 transition-all select-none">
        ${icon('play', 'w-3.5 h-3.5 fill-black')} Play Game
      </a>
    </div>
  </div>`;
}

export function renderLibraryHTML(games = []) {
  return `
  <div class="space-y-12">
    <div class="text-left space-y-4 border-b border-zinc-900 pb-6">
      <h2 class="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">Game Library</h2>
      <p class="text-sm text-zinc-400 max-w-2xl leading-relaxed font-sans">Classic text adventures, brought to life with retro graphics. Pick a title to play in your browser.</p>

      <div class="flex flex-wrap items-center gap-x-6 gap-y-3 pt-4 border-t border-zinc-900/60 text-xs text-zinc-300 font-mono">
        <label class="flex items-center gap-2 cursor-pointer select-none group">
          <input type="checkbox" data-filter="files" class="w-4 h-4 rounded border-zinc-800 bg-zinc-900 accent-emerald-500" />
          <span class="group-hover:text-emerald-400 transition-colors font-bold">Includes Story File</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer select-none group">
          <input type="checkbox" data-filter="pregenerated" class="w-4 h-4 rounded border-zinc-800 bg-zinc-900 accent-emerald-500" />
          <span class="group-hover:text-emerald-400 transition-colors font-bold">Pre-generated Graphics</span>
        </label>
      </div>
    </div>

    <div data-library-grid class="grid md:grid-cols-2 gap-6">
      ${games.map(renderCard).join('')}
    </div>

    <div data-library-empty class="hidden border border-dashed border-zinc-800 bg-zinc-950/20 rounded-xl p-12 text-center max-w-xl mx-auto space-y-3">
      <p class="text-zinc-400 text-sm font-sans">No games match the selected filter criteria.</p>
      <button data-reset-filters class="text-xs text-emerald-400 hover:text-emerald-300 font-mono underline">Reset Filters</button>
    </div>
  </div>`;
}

export function initLibrary(root) {
  const checks = [...root.querySelectorAll('[data-filter]')];
  const cards = [...root.querySelectorAll('[data-game-card]')];
  const grid = root.querySelector('[data-library-grid]');
  const empty = root.querySelector('[data-library-empty]');
  if (!checks.length || !grid) return;

  const state = () => ({
    files: root.querySelector('[data-filter="files"]').checked,
    pregenerated: root.querySelector('[data-filter="pregenerated"]').checked,
  });

  const apply = () => {
    const f = state();
    let visible = 0;
    for (const card of cards) {
      let show = true;
      if (f.files && card.dataset.includesFile !== 'true') show = false;
      if (f.pregenerated && card.dataset.pregenerated !== 'true') show = false;
      card.classList.toggle('hidden', !show);
      if (show) visible++;
    }
    grid.classList.toggle('hidden', visible === 0);
    empty.classList.toggle('hidden', visible !== 0);
  };

  checks.forEach((c) => c.addEventListener('change', apply));
  root.querySelector('[data-reset-filters]').addEventListener('click', () => {
    checks.forEach((c) => (c.checked = false));
    apply();
  });
}

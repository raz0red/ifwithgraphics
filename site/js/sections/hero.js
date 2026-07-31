import { icon } from '../icons.js';
import { PLAYER_URL } from '../data.js';

// The hero card stack auto-rotates through the pre-generated games as retro
// "postcards": each card shows a game's cover scene plus that scene's actual
// room text (from games.json's `scene`). Only ~3 cards are visible in the
// deck at once (see initHeroCardStack + the .if-card CSS).
function buildHeroCards(games) {
  return games
    .filter((g) => g.pregenerated && g.image && g.scene)
    .map((g) => ({
      room: g.scene.room,
      game: (g.title.split(':')[0] || g.title).trim(),
      image: g.image,
      text: g.scene.text,
      pagePath: g.pagePath,
    }));
}

function renderCard(card, i) {
  // First three cards get an initial deck position so the static HTML shows a
  // proper stack pre-hydration; initHeroCardStack takes over and rotates.
  const pos = i < 3 ? ` data-pos="${i}"` : '';
  return `
    <a href="${card.pagePath}" aria-label="Play ${card.game}" class="if-card border-[4px] border-emerald-500 bg-black rounded shadow-[0_0_35px_rgba(16,185,129,0.3)] flex flex-col overflow-hidden cursor-pointer"${pos}>
      <div class="bg-white text-black font-mono font-bold uppercase py-2 px-4 flex justify-between items-center gap-2 text-xs sm:text-sm border-b-[3px] border-emerald-500">
        <span class="shrink-0 text-black">${card.game}</span><span class="truncate pl-2 text-right text-emerald-600">${card.room}</span>
      </div>
      <div class="m-3.5 border-2 border-emerald-500 rounded overflow-hidden aspect-[4/3] bg-zinc-950 flex items-center justify-center">
        <img src="${card.image}" alt="${card.room}" loading="lazy" class="w-full h-full object-cover scale-[1.12]" style="image-rendering:pixelated" />
      </div>
      <div class="px-5 pb-5 flex-grow flex flex-col justify-between text-left font-mono">
        <p class="text-xs sm:text-sm text-emerald-400 font-bold leading-relaxed tracking-wide line-clamp-4">${card.text}</p>
        <div class="flex items-center gap-1.5 text-yellow-400 font-bold mt-2">
          <span>&gt;</span>
          <span class="w-2.5 h-4 bg-yellow-400 animate-cursor-blink inline-block"></span>
        </div>
      </div>
    </a>`;
}

export function renderHeroHTML(games = []) {
  const cards = buildHeroCards(games);
  return `
  <div class="grid lg:grid-cols-12 gap-12 items-center pt-4">
    <div class="lg:col-span-5 space-y-6 text-left flex flex-col justify-center">
      <h1 class="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tighter uppercase leading-none font-sans select-none">
        <span class="text-emerald-500">IF</span> <span class="text-white">WITH</span> <span class="text-emerald-500">GRAPHICS</span>
      </h1>
      <p class="text-zinc-400 text-sm leading-relaxed font-sans">
        <strong class="font-bold text-emerald-500">IFWG</strong> brings classic Interactive Fiction to life with retro pixel art, pre-rendered or generated on the fly as you play, right in your browser.
      </p>
      <div class="flex flex-wrap items-center gap-4 pt-2">
        <button data-nav="library" class="flex-1 min-w-[10rem] max-w-[15rem] px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold uppercase text-xs tracking-wider rounded flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all transform active:scale-95 select-none cursor-pointer">
          ${icon('book-open', 'w-4 h-4')} Game Library
        </button>
        <a href="${PLAYER_URL}" class="flex-1 min-w-[10rem] max-w-[15rem] px-6 py-3.5 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-white font-extrabold uppercase text-xs tracking-wider rounded flex items-center justify-center gap-2 transition-all transform active:scale-95 select-none">
          ${icon('play', 'w-4 h-4 fill-white')} Launch Player
        </a>
      </div>
    </div>

    <div class="lg:col-span-7 flex flex-col items-center justify-center">
      <div class="w-full max-w-[440px]">
        <div id="hero-cardstack" class="if-cardstack select-none">
          ${cards.map(renderCard).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

// Rotate the deck: keep only three cards visible (positions 0/1/2) and cycle
// which games occupy them, so every pre-generated game rotates through the
// front over time without stacking all of them at once.
export function initHeroCardStack(root) {
  const stack = root.querySelector('#hero-cardstack');
  if (!stack) return;
  const cards = [...stack.querySelectorAll('.if-card')];
  const n = cards.length;
  if (n < 2) return;

  let active = 0;
  const update = () =>
    cards.forEach((c, i) => {
      const pos = (i - active + n) % n;
      if (pos <= 2) c.setAttribute('data-pos', String(pos));
      else c.removeAttribute('data-pos');
    });

  update();
  setInterval(() => {
    active = (active + 1) % n;
    update();
  }, 4000);
}

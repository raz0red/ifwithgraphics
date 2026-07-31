// Hydration only: index.html already ships with the real, pre-rendered markup
// (see build.js). This wires up interactivity on top of it and never builds
// the section DOM from scratch.
import { initHeroCardStack } from './sections/hero.js';
import { initLibrary } from './sections/library.js';

const app = document.getElementById('app');
const homeView = app?.querySelector('[data-view="home"]');
const libraryView = app?.querySelector('[data-view="library"]');
const navButtons = [...(app?.querySelectorAll('#navbar [data-nav]') || [])];

// Active-tab styling for the two navbar buttons.
const ACTIVE = ['text-white', 'bg-emerald-500/10', 'border-emerald-500/20'];
const INACTIVE = ['text-zinc-400'];

function setView(view) {
  if (!homeView || !libraryView) return;
  const showing = view === 'library' ? libraryView : homeView;
  const hiding = view === 'library' ? homeView : libraryView;

  hiding.classList.add('hidden');
  showing.classList.remove('hidden');
  // Re-trigger the entrance animation.
  showing.classList.remove('view-enter');
  void showing.offsetWidth;
  showing.classList.add('view-enter');

  for (const btn of navButtons) {
    const isActive = btn.dataset.nav === view;
    btn.classList.toggle(ACTIVE[0], isActive);
    btn.classList.toggle(ACTIVE[1], isActive);
    btn.classList.toggle(ACTIVE[2], isActive);
    btn.classList.toggle(INACTIVE[0], !isActive);
  }

  // Keep the URL in sync so the directory is deep-linkable (the player's Back
   // link targets #library) and survives refresh / browser back-forward.
  const desiredHash = view === 'library' ? '#library' : '';
  if ((location.hash || '') !== desiredHash) {
    history.replaceState(null, '', desiredHash || location.pathname + location.search);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Any element with data-nav swaps views (nav, hero buttons, CTA, footer,
// the "Game Directory" link inside step 1).
app?.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-nav]');
  if (trigger && app.contains(trigger)) {
    e.preventDefault();
    setView(trigger.dataset.nav);
  }
});

// Logo returns home.
app?.querySelector('[data-logo]')?.addEventListener('click', () => setView('home'));

if (homeView && libraryView) {
  initHeroCardStack(homeView);
  initLibrary(libraryView);
  // Deep-link: arriving with #library (e.g. the player's Back link) opens the
  // game directory directly instead of the home view.
  setView(location.hash === '#library' ? 'library' : 'home');
} else {
  console.error('Static section markup not found. Did you run `node build.js` before serving this page?');
}

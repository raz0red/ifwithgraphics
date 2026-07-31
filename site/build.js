// Pre-renders the section templates into static HTML so the shipped page has
// real, crawlable markup instead of an empty <div id="app"> that only fills
// in after JS runs. Run `node build.js` (or `npm run build`) after editing
// content in js/data.js or js/sections/*.js, then serve the directory.
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { renderBackgroundHTML } from './js/sections/background.js';
import { renderNavbarHTML } from './js/sections/navbar.js';
import { renderHeroHTML } from './js/sections/hero.js';
import { renderHowItWorksHTML } from './js/sections/howitworks.js';
import { renderCapabilitiesHTML } from './js/sections/capabilities.js';
import { renderLibraryHTML } from './js/sections/library.js';
import { renderFooterHTML } from './js/sections/footer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The game directory is data, authored in data/games.json (curated subset of
// the engine's game universe, joined by `id`). Read it here and render the
// cards from it — see js/sections/library.js for the field contract.
function loadGames() {
  const games = JSON.parse(readFileSync(join(__dirname, 'data', 'games.json'), 'utf8'));
  for (const g of games) {
    if (!g.id || !g.title || !g.pagePath) {
      throw new Error(`games.json entry missing id/title/pagePath: ${JSON.stringify(g)}`);
    }
  }
  return games;
}

function main() {
  const games = loadGames();

  const appHTML = `
${renderBackgroundHTML()}
<div class="relative z-10 min-h-screen flex flex-col justify-between">
  <div class="flex-grow">
    ${renderNavbarHTML()}
    <div class="max-w-6xl mx-auto px-6 sm:px-10 py-8 sm:py-12">
      <div data-view="home" class="space-y-24">
        ${renderHeroHTML(games)}
        ${renderHowItWorksHTML()}
        ${renderCapabilitiesHTML()}
      </div>
      <div data-view="library" class="space-y-12 hidden">
        ${renderLibraryHTML(games)}
      </div>
    </div>
  </div>
  ${renderFooterHTML()}
</div>`;

  const template = readFileSync(join(__dirname, 'index.template.html'), 'utf8');
  if (!template.includes('<!--APP-->')) {
    throw new Error('index.template.html is missing the <!--APP--> marker');
  }

  const output = template.replace('<!--APP-->', appHTML);
  writeFileSync(join(__dirname, 'index.html'), output);
  console.log(`Built index.html (${(output.length / 1024).toFixed(1)} KB) — ${games.length} games`);
}

main();

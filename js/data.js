// Content data for the IFWG site (page copy). The game directory itself is
// authored separately in data/games.json (read at build time by build.js);
// editing copy here plus the section modules and running `node build.js`
// regenerates the static index.html.

// "How IFWG Operates" three-step explainer.
export const steps = [
  {
    n: 1,
    title: 'Select or Upload',
    // `directory` marks the phrase that links to the Game Directory view.
    html: 'Browse supported classics in our <button data-nav="library" class="text-emerald-400 font-bold hover:underline cursor-pointer">Game Library</button>, or use the Launch Player to load and play your own interactive fiction story files.',
  },
  {
    n: 2,
    title: 'On-The-Fly AI Art',
    html: 'Bring your own OpenAI or Google Gemini API key to generate scene art in real time as you play. Games with pre-generated art render immediately, no key required.',
  },
  {
    n: 3,
    title: 'Export Standalone',
    html: 'Export a complete game package with all its generated graphics, then host it yourself or play it locally. No server required.',
  },
];

// "Core Capabilities" cards.
export const capabilities = [
  {
    icon: 'sparkles',
    title: 'On-the-Fly Scene Art',
    description:
      "Reads each room's description as you play and generates matching retro pixel art in real time.",
  },
  {
    icon: 'download',
    title: 'Standalone Export',
    comingSoon: true,
    description:
      'Bundle a story and all its generated artwork into a single self-contained package you can play anywhere.',
  },
  {
    icon: 'gamepad-2',
    title: 'webRcade Support',
    comingSoon: true,
    description:
      'Export your games as webRcade feeds and play them in the webRcade player from anywhere.',
  },
  {
    icon: 'code',
    title: 'Fully Open Source',
    description:
      'Everything is open source: audit it, modify it, or host your own copy.',
  },
];

// The two retro "postcard" scenes on the hero card stack.
// The standalone IFWG player (drop-your-own-file app), served at /player/ in
// the combined deploy. "Launch Player" links here.
export const PLAYER_URL = 'player/';

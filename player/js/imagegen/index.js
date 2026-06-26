import { DB }             from "../db.js";
import { OpenAIImageGen } from "./openai.js";
import { GeminiImageGen } from "./gemini.js";
import PROVIDERS          from "./providers.json" with { type: "json" };

export { PROVIDERS };

export class ImageGenSettings {
  constructor(provider, apiKeys, model) {
    this._provider = provider || Object.keys(PROVIDERS)[0];
    this._apiKeys  = (apiKeys && typeof apiKeys === "object") ? apiKeys : {};
    this._model    = model    || "";
  }
  getProvider()  { return this._provider; }
  getApiKey()    { return this._apiKeys[this._provider] || ""; }
  getApiKeys()   { return this._apiKeys; }
  getModel() {
    if (this._model) return this._model;
    return PROVIDERS[this._provider]?.models[0]?.value || "";
  }
  setProvider(v) { this._provider = v; }
  setApiKey(v)   { this._apiKeys[this._provider] = v; }
  setModel(v)    { this._model    = v; }
}

const SETTINGS_KEY = "ifwg_settings";

function getSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    // Migrate old single-key format
    const apiKeys = raw.apiKeys || (raw.apiKey ? { [raw.provider || Object.keys(PROVIDERS)[0]]: raw.apiKey } : {});
    return new ImageGenSettings(raw.provider, apiKeys, raw.model);
  } catch (_) {
    return new ImageGenSettings();
  }
}

function setSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    provider: settings.getProvider(),
    apiKeys:  settings.getApiKeys(),
    model:    settings.getModel(),
  }));
}

function buildPrompt(title, description) {
  // Strip dynamic status-bar suffixes and normalize whitespace to get the bare room name
  const roomName = title.replace(/\s+(Time|Score|Moves|Turns):.*/gi, "").replace(/\s+/g, " ").trim();
  // Look for the room name as a line heading (at start of line) to skip preamble.
  // A simple indexOf would match the word anywhere, including inside the preamble narrative.
  const lineIdx = roomName
    ? description.search(new RegExp("(?:^|\\n)\\s*" + roomName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"))
    : -1;
  const start = lineIdx > 0 ? lineIdx : 0;
  const desc  = description.substring(start)
    .replace(/\n[^\n]*\?\s*$/m, "")   // strip trailing game-prompt line ("What do you want to do?")
    .replace(/\s+/g, " ").trim().substring(0, 400);
  return (
    "Apple II-style dithered pixel art scene matching the aesthetic of the reference images. " +
    `Scene: '${roomName || title}' — ${desc} ` +
    "Contained within a pixelated dithered border. " +
    "Strict limited palette and artifacting of the classic reference style, with clear textured dithering. " +
    "Letterboxed: solid pure black bars of at least 250px at the very top and very bottom of the 1024x1024 canvas, " +
    "scene content in the middle 500px landscape strip only. " +
    "NO text, NO letters, NO words, NO UI, NO status bar, NO HUD anywhere in the image."
  );
}

// Realistic mode — swap in place of buildPrompt above to experiment
// function buildPrompt(title, description) {
//   const desc = description.replace(/\s+/g, " ").trim().substring(0, 400);
//   return (
//     "Ultra-realistic cinematic photograph. Photorealistic, dramatic lighting, shallow depth of field, highly detailed. " +
//     `Scene: '${title}' — ${desc} ` +
//     "NO text, NO letters, NO words, NO UI anywhere in the image."
//   );
// }

function getProvider(name) {
  if (name === "openai") return OpenAIImageGen;
  if (name === "gemini") return GeminiImageGen;
  return null;
}

const _kb = url => {
  const comma = url.indexOf(",");
  return Math.round((comma >= 0 ? url.length - comma - 1 : url.length) * 0.75 / 1024);
};

/* Crop black letterbox bars and compress to WebP. Always stored before caching. */
function cropAndCompress(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const { width: w, height: h } = img;
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;

      const rowBrightness = y => {
        let sum = 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          sum += data[i] + data[i + 1] + data[i + 2];
        }
        return sum / w;
      };

      const THRESH = 30;
      let top = 0, bottom = h - 1;
      for (let y = 0; y < h; y++)       { if (rowBrightness(y) > THRESH) { top    = y; break; } }
      for (let y = h - 1; y >= 0; y--) { if (rowBrightness(y) > THRESH) { bottom = y; break; } }

      const ch  = bottom - top + 1;
      const out = document.createElement("canvas");
      out.width  = w;
      out.height = ch;
      out.getContext("2d").drawImage(canvas, 0, top, w, ch, 0, 0, w, ch);
      resolve(out.toDataURL("image/webp", 0.9));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

function generate(roomId, title, description, onCacheMiss) {
  const cacheKey = `images/${roomId}`;

  return DB.get(cacheKey).then(cached => {
    if (cached) {
      /* Already WebP — serve directly. Old PNG or expired CDN URL — migrate to WebP
         and update the cache entry in the background. */
      if (cached.startsWith("data:image/webp")) {
        console.info("[IFWG] image cache hit — roomId:%o webp:%okb", roomId, _kb(cached));
        return cached;
      }
      console.info("[IFWG] image cache hit (old format) — roomId:%o %okb → migrating to webp", roomId, _kb(cached));
      return cropAndCompress(cached).then(webp => {
        console.info("[IFWG] image migrated — roomId:%o webp:%okb", roomId, _kb(webp));
        DB.put(cacheKey, webp);
        return webp;
      });
    }

    if (!onCacheMiss) return Promise.resolve(null);

    const settings = getSettings();
    if (!settings.getApiKey()) return Promise.resolve(null);

    onCacheMiss();

    const provider = getProvider(settings.getProvider());
    if (!provider) return Promise.resolve(null);

    const prompt = buildPrompt(title, description);
    const attempt = (remaining) =>
      provider.generate(settings.getApiKey(), prompt, settings.getModel())
        .catch(err => {
          if (remaining > 0) {
            console.warn("[IFWG] image gen failed, retrying (%o left) — %o", remaining, err?.message ?? err);
            return attempt(remaining - 1);
          }
          throw err;
        });
    return attempt(2)
      .then(url => cropAndCompress(url))
      .then(webp => {
        console.info("[IFWG] image generated — roomId:%o webp:%okb", roomId, _kb(webp));
        return DB.put(cacheKey, webp).then(() => webp);
      });
  });
}

export const ImageGen = { generate, getSettings, setSettings };

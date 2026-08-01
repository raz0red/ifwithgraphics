import { DB } from "../db.js";
import { Game } from "../game.js";
import { OpenAIImageGen } from "./openai.js";
import { GeminiImageGen } from "./gemini.js";
import PROVIDERS from "./providers.json" with { type: "json" };
// Shared with tools/imagegen (the batch pregen tool) — keep both readers in
// sync by editing player/src/context/games.json / aliases.json, not by
// hardcoding here.
import GAMES from "../../context/games.json" with { type: "json" };
import ALIASES from "../../context/aliases.json" with { type: "json" };
import VARIANTS from "../../context/variants.json" with { type: "json" };

export { PROVIDERS, GAMES, ALIASES };

/* Resolve a raw gameId (release.serial, read from the story file header)
   to its game entry via the aliases table. Many gameIds — one release per
   historical edition (PC/Mac/Amiga/bug-fix revisions) — can map to the
   same game. */
function resolveGame(gameId) {
  return GAMES[ALIASES[gameId]];
}

/* Some rooms show meaningfully different scenery depending on dynamic
   game state (e.g. a character's described appearance changes later in
   the story) even though the room title never changes. variants.json is
   an additive, manually-curated table of {match, title} rules — most
   rooms have no entry and this is a no-op. When the live description
   contains a rule's match substring, the resolved alternate title is used
   in place of the real one for every downstream step (slugify, cache key,
   prompt scene name) — the rest of the pipeline is unaware anything
   changed. */
function resolveTitle(name, title, description) {
  const rules = VARIANTS[name]?.[title];
  if (rules) {
    const lower = description.toLowerCase();
    for (const rule of rules) {
      if (lower.includes(rule.match.toLowerCase())) return rule.title;
    }
  }
  return title;
}

/* Some games build the room title out of static game state plus text the
   player themselves typed earlier (Bureaucracy's outdoor locations echo
   the street name from the player's licence-application form — "234 Sf"
   for a player who typed "Sf"). That makes the title different per player
   for what's structurally the same game-assigned location, so it can never
   hit a shared/pregenerated image cache. games.json's optional
   titleKeyPattern is a per-game regex with one capture group around the
   stable part; when a title matches it, the captured group is used in
   place of the full title for every downstream step (slugify, cache key,
   prompt scene name) — same substitution shape as resolveTitle above. */
function normalizeDynamicTitle(name, title) {
  const pattern = GAMES[name]?.titleKeyPattern;
  if (!pattern) return title;
  const m = new RegExp(pattern).exec(title);
  return m ? m[1] : title;
}

/* Turn a room title into a filesystem/URL-safe slug. Must produce
   identical output to slugify() in tools/imagegen/main.go — both sides
   write/read the same filenames. */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* V1-V3 games are spec-guaranteed to keep the current room in Global
   Variable 0 (the interpreter's own built-in status line depends on it),
   so the "roomId" the engine reports is a real, stable identifier. V4+ has
   no such guarantee — the WASM bridge falls back to scanning the object
   table for a short name matching the status-bar title (see
   ifwg_find_object_by_name), which is only ever a best-effort stand-in and
   degenerates to "first object with this name" for any game that reuses a
   room title. Not reliable enough to key anything by, so roomId-based
   keying (both the canonical-release pregen path and the local live-gen
   cache) is restricted to V1-V3; V4+ always uses the room title instead. */
function isRoomIdReliable() {
  const version = Game.getVersion();
  return version != null && version <= 3;
}

/* Most games are keyed purely by title — shared across every historical
   release, but ambiguous whenever a game reuses one title for several
   distinct rooms (e.g. Cutthroats' "Wharf Road", one title covering 5
   different street segments). A game can opt into a more precise scheme by
   setting games.json's canonicalGameId to the exact release a room-ID-keyed
   image set (player/images/<name>/id/<roomId>.webp) was generated from — but
   only the *exact* matching release gets that precision (and only for
   V1-V3, per isRoomIdReliable above); any other release of the same game,
   or any V4+ game regardless of canonicalGameId, just falls back to the
   plain title path. */
function isCanonicalRelease(name) {
  return isRoomIdReliable() && GAMES[name]?.canonicalGameId === Game.getId();
}

export class ImageGenSettings {
  constructor(provider, apiKeys, model, pregenEnabled) {
    this._provider = provider || "none";
    this._apiKeys = apiKeys && typeof apiKeys === "object" ? apiKeys : {};
    this._model = model || "";
    this._pregenEnabled = pregenEnabled !== undefined ? !!pregenEnabled : true;
  }
  getProvider() {
    return this._provider;
  }
  getApiKey() {
    return this._apiKeys[this._provider] || "";
  }
  getApiKeys() {
    return this._apiKeys;
  }
  getPregenEnabled() {
    return this._pregenEnabled;
  }
  getModel() {
    return this._model;
  }
  setProvider(v) {
    this._provider = v;
  }
  setApiKey(v) {
    this._apiKeys[this._provider] = v;
  }
  setModel(v) {
    this._model = v;
  }
  setPregenEnabled(v) {
    this._pregenEnabled = !!v;
  }
}

const SETTINGS_KEY = "ifwg_settings";

function defaultImagesBase() {
  // Pregen images ship alongside the player at <root>/player/images/, so a
  // module-relative base is correct wherever the player is hosted — localhost,
  // project pages (raz0red.github.io/ifwithgraphics/), or the custom domain
  // (ifwithgraphics.com) — and always stays same-origin, avoiding the
  // cross-origin redirect/CORS failure a hardcoded host would hit once a
  // custom domain is in play. An exported package hosted elsewhere can point
  // back at a canonical host via ImageGen.setImagesBase().
  return new URL("../../images/", import.meta.url).href;
}

let _imagesBase = defaultImagesBase();

/* In-memory-only override for provider/pregen — never written to
   localStorage. Lets a page force provider/pregen for the current session
   (e.g. pinning a pregen game to pregen-only) without touching the user's
   real cross-page settings. */
let _sessionOverride = null;

function setSessionOverride(overrides) {
  _sessionOverride = overrides;
}

/* Drop the in-memory override so the user's real, persisted settings take
   over again — called the moment a pregen page's player explicitly changes
   an image-gen setting (see launchPanel), so the pregen-default "Disabled"
   never traps them on live gen. */
function clearSessionOverride() {
  _sessionOverride = null;
}

function getSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    const apiKeys =
      raw.apiKeys ||
      (raw.apiKey ? { [raw.provider || Object.keys(PROVIDERS)[0]]: raw.apiKey } : {});
    const provider =
      _sessionOverride?.provider !== undefined ? _sessionOverride.provider : raw.provider;
    const pregenEnabled =
      _sessionOverride?.pregenEnabled !== undefined
        ? _sessionOverride.pregenEnabled
        : raw.pregenEnabled;
    return new ImageGenSettings(provider, apiKeys, raw.model, pregenEnabled);
  } catch (_) {
    return new ImageGenSettings(
      _sessionOverride?.provider,
      undefined,
      undefined,
      _sessionOverride?.pregenEnabled
    );
  }
}

function setSettings(settings) {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      provider: settings.getProvider(),
      apiKeys: settings.getApiKeys(),
      model: settings.getModel(),
      pregenEnabled: settings.getPregenEnabled()
    })
  );
}

function buildPrompt(title, description) {
  // Strip dynamic status-bar suffixes and normalize whitespace to get the bare room name
  const roomName = title
    .replace(/\s+(Time|Score|Moves|Turns):.*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  // Different games place the room-name line in different spots relative to
  // the actual descriptive prose — before it, after it, or with more text on
  // both sides straddling it. Rather than assume one position (and risk
  // discarding whichever side ends up holding the real description), strip
  // out just the bare room-name line itself, wherever it falls, and keep
  // everything else. A simple indexOf would match the word anywhere,
  // including inside a sentence, so the match is anchored to its own line.
  const titleLineRe = roomName
    ? new RegExp(
        "(?:^|\\n)\\s*" + roomName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(?:\\n|$)",
        "i"
      )
    : null;
  const desc = (titleLineRe ? description.replace(titleLineRe, "\n") : description)
    .replace(/\n[^\n]*\?\s*$/m, "") // strip trailing game-prompt line ("What do you want to do?")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 400);
  const context = resolveGame(Game.getId())?.description;
  return (
    "Apple II-style dithered pixel art scene matching the aesthetic of the reference images. " +
    (context
      ? `Background story context, for overall genre/mood/setting only — do not depict this directly unless the scene described below explicitly calls for it: ${context} `
      : "") +
    `Scene to depict: '${roomName || title}' — ${desc} ` +
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

const _kb = (url) => {
  const comma = url.indexOf(",");
  return Math.round(((comma >= 0 ? url.length - comma - 1 : url.length) * 0.75) / 1024);
};

/* Crop black letterbox bars and compress to WebP. Always stored before caching. */
function cropAndCompress(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width: w, height: h } = img;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;

      const rowBrightness = (y) => {
        let sum = 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          sum += data[i] + data[i + 1] + data[i + 2];
        }
        return sum / w;
      };

      const THRESH = 30;
      let top = 0,
        bottom = h - 1;
      for (let y = 0; y < h; y++) {
        if (rowBrightness(y) > THRESH) {
          top = y;
          break;
        }
      }
      for (let y = h - 1; y >= 0; y--) {
        if (rowBrightness(y) > THRESH) {
          bottom = y;
          break;
        }
      }

      const ch = bottom - top + 1;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = ch;
      out.getContext("2d").drawImage(canvas, 0, top, w, ch, 0, 0, w, ch);
      resolve(out.toDataURL("image/webp", 0.9));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

/* Fetch a pre-generated image from the static bundle and return it as a data URL.
   pathSegment is the already-resolved slug/id path, e.g. "wharf-road" or "id/165". */
function fetchPregenerated(name, pathSegment) {
  const url = `${_imagesBase}${name}/${pathSegment}.webp`;
  return fetch(url)
    .then((r) => {
      if (!r.ok) return null;
      return r.blob().then(
        (blob) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          })
      );
    })
    .catch(() => null);
}

/* Pregen (the shared, static image bundle) and the local IndexedDB cache
   are two separate concerns with two separate key schemes, not one shared
   key: pregen is a cheap, shared, static-asset lookup — precise-by-ID for
   the canonical release, title-based otherwise — and is never written to
   the local cache; the browser's own HTTP layer handles repeat-fetch
   efficiency for it. IndexedDB is reserved for the one genuinely expensive
   operation, a live paid-API generation, and is always keyed by the raw
   gameId+roomId — always precise for whatever exact file is loaded, no
   name/title resolution needed at all. */
function generate(roomId, title, description, onCacheMiss) {
  const name = ALIASES[Game.getId()];
  const resolvedTitle = name ? resolveTitle(name, title, description) : title;
  const effectiveTitle = name ? normalizeDynamicTitle(name, resolvedTitle) : resolvedTitle;
  const settings = getSettings();

  if (settings.getPregenEnabled() && name) {
    const pathSegment = isCanonicalRelease(name) ? `id/${roomId}` : slugify(effectiveTitle);
    if (onCacheMiss) onCacheMiss();
    return fetchPregenerated(name, pathSegment).then((dataUrl) => {
      if (dataUrl) {
        console.info("[IFWG] pre-generated image — roomId:%o", roomId);
        return dataUrl;
      }
      /* Not in the static bundle — fall through to the local-cache-backed
         live generation path below. */
      return generateFromCacheOrLive(roomId, effectiveTitle, description, onCacheMiss);
    });
  }

  return generateFromCacheOrLive(roomId, effectiveTitle, description, onCacheMiss);
}

function generateFromCacheOrLive(roomId, title, description, onCacheMiss) {
  /* roomId is only trustworthy for V1-V3 (see isRoomIdReliable) — V4+
     falls back to keying the local cache by title instead. */
  const roomKey = isRoomIdReliable() ? roomId : slugify(title);
  const cacheKey = `images/${Game.getId() || "unknown"}/${roomKey}`;
  console.info("[IFWG] image cache key — title:%o cacheKey:%o", title, cacheKey);

  return DB.get(cacheKey).then((cached) => {
    if (cached) {
      if (cached.startsWith("data:image/webp")) {
        console.info("[IFWG] image cache hit — roomId:%o webp:%okb", roomId, _kb(cached));
        return cached;
      }
      console.info(
        "[IFWG] image cache hit (old format) — roomId:%o %okb → migrating to webp",
        roomId,
        _kb(cached)
      );
      return cropAndCompress(cached).then((webp) => {
        console.info("[IFWG] image migrated — roomId:%o webp:%okb", roomId, _kb(webp));
        DB.put(cacheKey, webp);
        return webp;
      });
    }

    return generateLive(getSettings(), title, description, cacheKey, onCacheMiss);
  });
}

function generateLive(settings, title, description, cacheKey, onCacheMiss) {
  if (!onCacheMiss) return Promise.resolve(null);
  const key = settings.getApiKey();
  if (!key) return Promise.resolve(null);

  onCacheMiss();

  const provider = getProvider(settings.getProvider());
  if (!provider) return Promise.resolve(null);

  const prompt = buildPrompt(title, description);
  const attempt = (remaining) =>
    provider.generate(settings.getApiKey(), prompt, settings.getModel()).catch((err) => {
      if (remaining > 0) {
        console.warn(
          "[IFWG] image gen failed, retrying (%o left) — %o",
          remaining,
          err?.message ?? err
        );
        return attempt(remaining - 1);
      }
      throw err;
    });
  return attempt(2)
    .then((url) => cropAndCompress(url))
    .then((webp) => {
      console.info("[IFWG] image generated — cacheKey:%o webp:%okb", cacheKey, _kb(webp));
      return DB.put(cacheKey, webp).then(() => webp);
    });
}

/* Providers without a validate() (i.e. "none"/Disabled) need no key at all.
   Real providers now require an explicit validated key before proceeding —
   there's no more silent "no key, carry on anyway" path — and return the
   live, sorted image-model list alongside the ok/error result so callers
   can populate the model dropdown from it. */
async function validate() {
  const settings = getSettings();
  const provider = getProvider(settings.getProvider());
  if (!provider?.validate) return { ok: true, models: [] };
  const key = settings.getApiKey();
  if (!key) return { ok: false, error: "API key required", models: [] };
  try {
    const models = await provider.validate(key);
    return { ok: true, models: models || [] };
  } catch (err) {
    return { ok: false, error: err?.message ?? "API ERROR", models: [] };
  }
}

export const ImageGen = {
  generate,
  validate,
  getSettings,
  setSettings,
  setSessionOverride,
  clearSessionOverride,
  setImagesBase(url) {
    _imagesBase = url;
  }
};

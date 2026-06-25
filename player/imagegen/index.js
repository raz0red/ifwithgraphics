import { ImageDB }        from "./imagedb.js";
import { OpenAIImageGen } from "./openai.js";

export var ImageGen = (function () {
  var SETTINGS_KEY = "ifwg_settings";
  var _gameHash    = null;

  function setGame(hash) { _gameHash = hash; }

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
    catch (_) { return {}; }
  }

  function saveSettings(provider, apiKey) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ provider: provider, apiKey: apiKey }));
  }

  function buildPrompt(title, description) {
    var desc = description.replace(/\s+/g, " ").trim().substring(0, 400);
    return (
      "Apple II-style dithered pixel art scene matching the aesthetic of the reference images. " +
      "Scene: '" + title + "' — " + desc + " " +
      "Contained within a pixelated dithered border. " +
      "Strict limited palette and artifacting of the classic reference style, with clear textured dithering. " +
      "Letterboxed: solid pure black bars of at least 250px at the very top and very bottom of the 1024x1024 canvas, " +
      "scene content in the middle 500px landscape strip only. " +
      "NO text, NO letters, NO words, NO UI, NO status bar, NO HUD anywhere in the image."
    );
  }

  function getProvider(name) {
    if (name === "openai") return OpenAIImageGen;
    return null;
  }

  function cropBlackBars(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        var canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        var data = ctx.getImageData(0, 0, w, h).data;

        function rowBrightness(y) {
          var sum = 0;
          for (var x = 0; x < w; x++) {
            var i = (y * w + x) * 4;
            sum += data[i] + data[i + 1] + data[i + 2];
          }
          return sum / w;
        }

        var THRESH = 30;
        var top = 0, bottom = h - 1;
        for (var y = 0; y < h; y++)       { if (rowBrightness(y) > THRESH) { top    = y; break; } }
        for (var y = h - 1; y >= 0; y--) { if (rowBrightness(y) > THRESH) { bottom = y; break; } }

        var ch  = bottom - top + 1;
        var out = document.createElement("canvas");
        out.width  = w;
        out.height = ch;
        out.getContext("2d").drawImage(canvas, 0, top, w, ch, 0, 0, w, ch);
        resolve(out.toDataURL("image/png"));
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  function cropIfNeeded(url) {
    if (url && url.indexOf("data:") === 0) return cropBlackBars(url);
    return Promise.resolve(url);
  }

  function generate(roomId, title, description, onCacheMiss) {
    var settings = loadSettings();
    if (!settings.apiKey) return Promise.resolve(null);

    var cacheKey = (_gameHash || "unknown") + "/" + roomId;

    return ImageDB.get(cacheKey).then(function (cached) {
      if (cached) return cropIfNeeded(cached);

      if (onCacheMiss) onCacheMiss();

      var provider = getProvider(settings.provider || "openai");
      if (!provider) return Promise.resolve(null);

      var prompt = buildPrompt(title, description);
      return provider.generate(settings.apiKey, prompt)
        .then(function (url) {
          return ImageDB.put(cacheKey, url).then(function () { return url; });
        })
        .then(cropIfNeeded);
    });
  }

  function clearCache() { return ImageDB.clear(); }

  return { generate: generate, setGame: setGame, saveSettings: saveSettings, loadSettings: loadSettings, clearCache: clearCache };
})();

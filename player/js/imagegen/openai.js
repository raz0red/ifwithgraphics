var _promptBase = new URL("../../prompt/", import.meta.url).href;

export var OpenAIImageGen = (function () {
  var ENDPOINT = "https://api.openai.com/v1/images/edits";

  function generate(apiKey, prompt) {
    return Promise.all([
      fetch(_promptBase + "prompt1.png").then(function (r) { return r.blob(); }),
      fetch(_promptBase + "prompt2.png").then(function (r) { return r.blob(); })
    ]).then(function (blobs) {
      var form = new FormData();
      form.append("model",   "gpt-image-2-2026-04-21");
      form.append("prompt",  prompt);
      form.append("n",       "1");
      form.append("size",    "1024x1024");
      form.append("quality", "medium");
      blobs.forEach(function (blob, i) {
        form.append("image[]", blob, "ref" + (i + 1) + ".png");
      });

      return fetch(ENDPOINT, {
        method:  "POST",
        headers: { "Authorization": "Bearer " + apiKey },
        body:    form
      });
    })
    .then(function (r) {
      if (!r.ok) return r.json().then(function (e) {
        throw new Error(e.error && e.error.message || r.status);
      });
      return r.json();
    })
    .then(function (data) {
      var item = data.data[0];
      if (item.url)      return item.url;
      if (item.b64_json) return "data:image/png;base64," + item.b64_json;
      throw new Error("No image data in response");
    });
  }

  return { generate: generate };
})();

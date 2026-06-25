const _promptBase = new URL("../../prompt/", import.meta.url).href;
const ENDPOINT    = "https://api.openai.com/v1/images/edits";

function generate(apiKey, prompt) {
  return Promise.all([
    fetch(_promptBase + "prompt1.png").then(r => r.blob()),
    fetch(_promptBase + "prompt2.png").then(r => r.blob())
  ]).then(blobs => {
    const form = new FormData();
    form.append("model",   "gpt-image-2-2026-04-21");
    form.append("prompt",  prompt);
    form.append("n",       "1");
    form.append("size",    "1024x1024");
    form.append("quality", "medium");
    blobs.forEach((blob, i) => form.append("image[]", blob, `ref${i + 1}.png`));

    return fetch(ENDPOINT, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body:    form
    });
  })
  .then(r => {
    if (!r.ok) return r.json().then(e => {
      throw new Error(e.error?.message ?? r.status);
    });
    return r.json();
  })
  .then(data => {
    const item = data.data[0];
    if (item.url)      return item.url;
    if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
    throw new Error("No image data in response");
  });
}

export const OpenAIImageGen = { generate };

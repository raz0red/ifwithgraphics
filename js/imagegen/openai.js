const _promptBase   = new URL("../../prompt/", import.meta.url).href;
const ENDPOINT_EDIT = "https://api.openai.com/v1/images/edits";

async function generateWithRefs(apiKey, model, prompt) {
  const blobs = await Promise.all([
    fetch(_promptBase + "prompt1.png").then(r => r.blob()),
    fetch(_promptBase + "prompt2.png").then(r => r.blob())
  ]);
  const form = new FormData();
  form.append("model",   model);
  form.append("prompt",  prompt);
  form.append("n",       "1");
  form.append("size",    "1024x1024");
  form.append("quality", "medium");
  blobs.forEach((blob, i) => form.append("image[]", blob, `ref${i + 1}.png`));

  const r = await fetch(ENDPOINT_EDIT, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body:    form
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message ?? r.status); }
  const data = await r.json();
  const item = data.data[0];
  if (item.url)      return item.url;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new Error("No image data in response");
}

function generate(apiKey, prompt, model) {
  return generateWithRefs(apiKey, model || "gpt-image-2-2026-04-21", prompt);
}

export const OpenAIImageGen = { generate };

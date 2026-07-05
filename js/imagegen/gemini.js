const ENDPOINT    = "https://generativelanguage.googleapis.com/v1beta/interactions";
const _promptBase = new URL("../../prompt/", import.meta.url).href;

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Strip OpenAI-specific letterbox instruction — Gemini generates 16:9 natively
const LETTERBOX_RE = /Letterboxed:[^.]+\.\s*/;

async function generate(apiKey, prompt, model) {
  const m = model || "gemini-3.1-flash-image";
  const cleanPrompt = prompt.replace(LETTERBOX_RE, "");

  const [b64ref1, b64ref2] = await Promise.all([
    fetch(_promptBase + "prompt1.png").then(r => r.blob()).then(blobToBase64),
    fetch(_promptBase + "prompt2.png").then(r => r.blob()).then(blobToBase64),
  ]);

  const r = await fetch(ENDPOINT, {
    method:  "POST",
    headers: {
      "Content-Type":   "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      model: m,
      input: [
        { type: "image", data: b64ref1, mime_type: "image/png" },
        { type: "image", data: b64ref2, mime_type: "image/png" },
        { type: "text",  text: "Preserve the wide landscape aspect ratio of the reference images. " + cleanPrompt }
      ],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "16:9" }
    })
  });

  if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message ?? r.status); }
  const data = await r.json();

  if (data.output_image?.data)
    return `data:image/jpeg;base64,${data.output_image.data}`;

  const steps = data.steps ?? [];
  for (const step of steps) {
    if (step.type !== "model_output") continue;
    const img = (step.content ?? []).find(c => c.type === "image" && c.data);
    if (img) return `data:${img.mime_type || "image/jpeg"};base64,${img.data}`;
  }

  throw new Error("No image data in response");
}

/* Validate the key and return image-capable models, newest first. Gemini's
   models.list has no creation-date field (unlike OpenAI); the closest thing
   to real recency metadata is its own "version" field (e.g. "2.5", "3.1"),
   so sort on that instead of guessing from the name string. */
async function validate(apiKey) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message ?? r.status);
  const models = (data.models || [])
    .filter(m => m.name.includes("image"))
    .sort((a, b) => (parseFloat(b.version) || 0) - (parseFloat(a.version) || 0))
    .map(m => {
      const value = m.name.replace(/^models\//, "");
      /* Google sometimes exposes multiple model ids (e.g. a rolling "latest"
         alias alongside a specific pinned version) under the identical
         marketing displayName — show the real id alongside it so entries
         that look like duplicates are still distinguishable in the list. */
      const label = m.displayName ? `${m.displayName} (${value})` : value;
      return { value, label };
    });
  console.info("[IFWG] Gemini image models available:", models.map(m => m.value));
  return models;
}

export const GeminiImageGen = { generate, validate };

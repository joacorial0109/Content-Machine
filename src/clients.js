import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }
  return response;
}

export async function createPlan(trigger, cfg, options = {}) {
  const schema = {
    type: "object", additionalProperties: false,
    required: ["title", "hook", "narration", "caption", "sources", "scenes"],
    properties: {
      title: { type: "string" }, hook: { type: "string" },
      narration: { type: "string" }, caption: { type: "string" },
      sources: { type: "array", maxItems: 5, items: {
        type: "object", additionalProperties: false, required: ["title", "url"],
        properties: { title: { type: "string" }, url: { type: "string" } }
      }},
      scenes: { type: "array", minItems: 3, maxItems: 8, items: {
        type: "object", additionalProperties: false,
        required: ["line", "brollQuery"],
        properties: { line: { type: "string" }, brollQuery: { type: "string" } }
      }}
    }
  };
  const request = {
    model: cfg.openaiModel,
    instructions: `Sos investigador y guionista de reels. Investigá primero el tema cuando incluya afirmaciones actuales. Escribí español rioplatense natural, frases cortas, tono ${options.tone || "directo"}, duración ${options.duration || 45} segundos, para ${options.platform || "TikTok e Instagram Reels"}. No inventes datos. El hook debe atrapar en 2 segundos. La narración debe coincidir, en el mismo orden, con la unión de las líneas de todas las escenas. Cada escena necesita una búsqueda visual en inglés de 2-5 palabras. Incluí únicamente URLs de fuentes realmente consultadas.`,
    input: trigger,
    tools: [{ type: "web_search_preview", search_context_size: "medium" }],
    text: { format: { type: "json_schema", name: "reel_plan", strict: true, schema } }
  };
  let response;
  try {
    response = await api("https://api.openai.com/v1/responses", {
      method: "POST", headers: { "Authorization": `Bearer ${cfg.openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(request)
    }).then(r => r.json());
  } catch (error) {
    if (!String(error.message).includes("web_search")) throw error;
    delete request.tools;
    response = await api("https://api.openai.com/v1/responses", {
      method: "POST", headers: { "Authorization": `Bearer ${cfg.openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(request)
    }).then(r => r.json());
  }
  const text = response.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI no devolvió un plan utilizable");
  return JSON.parse(text);
}

export async function createAvatarVideo(plan, cfg) {
  const result = await api("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: { "X-Api-Key": cfg.heygenKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      video_inputs: [{
        character: { type: "avatar", avatar_id: cfg.avatarId, avatar_style: "normal" },
        voice: { type: "text", input_text: plan.narration, voice_id: cfg.voiceId }
      }],
      dimension: { width: 1080, height: 1920 }
    })
  }).then(r => r.json());
  const id = result.data?.video_id;
  if (!id) throw new Error("HeyGen no devolvió video_id");
  for (let attempt = 0; attempt < 90; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const status = await api(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(id)}`, {
      headers: { "X-Api-Key": cfg.heygenKey }
    }).then(r => r.json());
    if (status.data?.status === "completed") return status.data.video_url;
    if (status.data?.status === "failed") throw new Error(status.data.error || "HeyGen falló");
  }
  throw new Error("HeyGen demoró más de lo esperado");
}

export async function findBroll(query, cfg) {
  const data = await api(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=3`, {
    headers: { Authorization: cfg.pexelsKey }
  }).then(r => r.json());
  for (const video of data.videos || []) {
    const files = (video.video_files || []).filter(x => x.link && x.width && x.height);
    files.sort((a, b) => Math.abs((a.width / a.height) - 9 / 16) - Math.abs((b.width / b.height) - 9 / 16));
    if (files[0]) return files[0].link;
  }
  return null;
}

export async function download(url, destination) {
  const response = await api(url);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
  return destination;
}

import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { normalizeSceneDurations, planNeedsExpansion, planQualityIssues } from "./quality.js";

async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }
  return response;
}

export async function createPlan(trigger, cfg, options = {}) {
  const targetDuration = Math.max(Number(options.duration) || cfg.targetDuration, cfg.minDuration);
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
      scenes: { type: "array", minItems: 5, maxItems: 8, items: {
        type: "object", additionalProperties: false,
        required: ["line", "subtitleChunks", "brollQuery", "brollAlternatives", "overlayText", "estimatedDuration"],
        properties: {
          line: { type: "string" },
          subtitleChunks: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
          brollQuery: { type: "string" },
          brollAlternatives: { type: "array", minItems: 2, maxItems: 3, items: { type: "string" } },
          overlayText: { type: "string" },
          estimatedDuration: { type: "number", minimum: 3, maximum: 10 }
        }
      }}
    }
  };
  const request = {
    model: cfg.openaiModel,
    instructions: `Sos investigador, guionista y editor de reels. Investigá primero el tema cuando incluya afirmaciones actuales. Escribí español rioplatense natural, tono ${options.tone || "directo"}, para ${options.platform || "TikTok e Instagram Reels"}. El video debe durar aproximadamente ${targetDuration} segundos y nunca menos de ${cfg.minDuration} segundos. Creá entre 5 y 8 escenas. La narración debe coincidir exactamente, en el mismo orden, con la unión de line de todas las escenas y debe tener suficientes palabras para la duración pedida. Cada escena necesita: texto narrado, duración estimada, 1 a 4 subtitleChunks de hasta 6 palabras que sean frases naturales, una búsqueda visual específica en inglés, 2 alternativas más genéricas y un overlayText de 2 a 4 palabras que resuma una idea clave. Nunca cortes subtítulos en fragmentos sin sentido. No inventes datos. El hook debe atrapar en 2 segundos. Incluí únicamente URLs realmente consultadas.`,
    input: trigger,
    tools: [{ type: "web_search_preview", search_context_size: "medium" }],
    text: { format: { type: "json_schema", name: "reel_plan", strict: true, schema } }
  };
  const execute = async () => {
    try {
      return await api("https://api.openai.com/v1/responses", {
        method: "POST", headers: { "Authorization": `Bearer ${cfg.openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(request)
      }).then(r => r.json());
    } catch (error) {
      if (!request.tools || !String(error.message).includes("web_search")) throw error;
      delete request.tools;
      return api("https://api.openai.com/v1/responses", {
        method: "POST", headers: { "Authorization": `Bearer ${cfg.openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(request)
      }).then(r => r.json());
    }
  };
  const parse = response => {
    const text = response.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text;
    if (!text) throw new Error("OpenAI no devolvió un plan utilizable");
    const plan = JSON.parse(text);
    plan.narration = plan.scenes.map(scene => scene.line).join(" ");
    return plan;
  };

  let plan = parse(await execute());
  for (let attempt = 1; attempt <= 3 && planNeedsExpansion(plan, cfg.minDuration); attempt++) {
    const issues = planQualityIssues(plan, cfg.minDuration).join("; ");
    request.input = `La versión anterior no cumple: ${issues}. Reescribí el reel completo sobre este disparador con 5 a 8 escenas, subtítulos semánticos y narración suficiente para ${targetDuration} segundos: ${trigger}`;
    delete request.tools;
    plan = parse(await execute());
  }
  if (planNeedsExpansion(plan, cfg.minDuration)) {
    throw new Error(`OpenAI no produjo un plan válido: ${planQualityIssues(plan, cfg.minDuration).join("; ")}`);
  }
  plan.scenes = normalizeSceneDurations(plan.scenes, targetDuration);
  plan.narration = plan.scenes.map(scene => scene.line).join(" ");
  return plan;
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
  return (await findBrollCandidates(query, cfg, 1))[0] || null;
}

export async function findBrollCandidates(query, cfg, limit = 6) {
  const data = await api(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=8`, {
    headers: { Authorization: cfg.pexelsKey }
  }).then(r => r.json());
  const candidates = [];
  for (const video of data.videos || []) {
    const files = (video.video_files || []).filter(x => x.link && x.width && x.height);
    files.sort((a, b) => Math.abs((a.width / a.height) - 9 / 16) - Math.abs((b.width / b.height) - 9 / 16));
    if (files[0] && !candidates.includes(files[0].link)) candidates.push(files[0].link);
    if (candidates.length >= limit) break;
  }
  return candidates;
}

export async function download(url, destination) {
  const response = await api(url);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
  return destination;
}

export async function createOpenAiSpeech(text, cfg, destination) {
  const response = await api("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Authorization": `Bearer ${cfg.openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "alloy", input: text, response_format: "mp3" })
  });
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
  return destination;
}

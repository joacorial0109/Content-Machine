import { estimateNarrationDuration, normalizeSceneDurations } from "./quality.js";

function words(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean);
}

function shortOverlay(value, fallback) {
  const selected = words(value).length ? words(value) : words(fallback);
  return selected.slice(0, 4).join(" ");
}

function semanticChunks(text, maxWords = 6) {
  const clauses = String(text || "").split(/(?<=[.!?;:,])\s+/).map(value => value.trim()).filter(Boolean);
  return clauses.flatMap(clause => {
    const parts = words(clause);
    if (parts.length <= maxWords) return [clause];
    const count = Math.ceil(parts.length / maxWords);
    const size = Math.ceil(parts.length / count);
    return Array.from({ length: count }, (_, index) => parts.slice(index * size, (index + 1) * size).join(" ")).filter(Boolean);
  });
}

function hydrateScene(scene, index, targetDuration, sceneCount) {
  const line = String(scene.line || scene.text || "").trim();
  const brollQuery = String(scene.brollQuery || "").trim();
  if (!line) throw new Error(`La escena ${index + 1} no tiene texto narrado`);
  if (!brollQuery) throw new Error(`La escena ${index + 1} no tiene brollQuery`);
  return {
    line,
    subtitleChunks: Array.isArray(scene.subtitleChunks) && scene.subtitleChunks.length
      ? scene.subtitleChunks.map(String)
      : semanticChunks(line),
    brollQuery,
    brollAlternatives: Array.isArray(scene.brollAlternatives) && scene.brollAlternatives.length >= 2
      ? scene.brollAlternatives.slice(0, 3).map(String)
      : [`${brollQuery} vertical`, "people daily life cinematic"],
    overlayText: shortOverlay(scene.overlayText || scene.overlay || scene.overlays?.[0], line),
    estimatedDuration: Number(scene.estimatedDuration) || targetDuration / sceneCount
  };
}

export function parseManualPlan(raw, targetDuration = 35, minDuration = 25) {
  if (!raw || !String(raw).trim()) throw new Error("Pegá un plan manual en formato JSON");
  let input;
  try {
    input = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("El plan manual no es JSON válido");
  }
  if (!Array.isArray(input.scenes) || input.scenes.length < 5 || input.scenes.length > 8) {
    throw new Error("El plan manual debe tener entre 5 y 8 escenas");
  }
  const scenes = normalizeSceneDurations(
    input.scenes.map((scene, index) => hydrateScene(scene, index, targetDuration, input.scenes.length)),
    targetDuration
  );
  const narration = String(input.narration || scenes.map(scene => scene.line).join(" ")).trim();
  const sceneNarration = scenes.map(scene => scene.line).join(" ");
  const caption = [input.caption, input.hashtags].flat().filter(Boolean).join(" ").trim();
  if (estimateNarrationDuration(narration) < minDuration || estimateNarrationDuration(sceneNarration) < minDuration) {
    throw new Error(`El guion manual debe tener narración suficiente para al menos ${minDuration} segundos`);
  }
  return {
    title: String(input.title || "Reel manual").trim(),
    hook: String(input.hook || scenes[0].overlayText).trim(),
    narration,
    caption,
    sources: Array.isArray(input.sources) ? input.sources : [],
    scenes
  };
}

function topicKeywords(trigger) {
  const stop = new Set(["para", "como", "sobre", "desde", "esto", "esta", "este", "unos", "unas", "porque", "pero", "quiero", "video"]);
  return words(trigger.toLowerCase().replace(/[^a-záéíóúüñ0-9\s]/gi, ""))
    .filter(word => word.length > 3 && !stop.has(word)).slice(0, 3).join(" ") || "daily life";
}

export function createTemplatePlan(trigger, targetDuration = 35, minDuration = 25) {
  const idea = String(trigger || "").trim();
  if (idea.length < 10) throw new Error("La idea debe tener al menos 10 caracteres");
  const topic = topicKeywords(idea);
  const ideaShort = words(idea).slice(0, 8).join(" ");
  const rawScenes = [
    { line: `Esta idea puede cambiar tu enfoque: ${ideaShort}. Veamos por qué importa.`, overlayText: "Mirá esta idea", brollQuery: `${topic} concept` },
    { line: "Primero, identificá el problema concreto que querés resolver y evitá explicaciones demasiado generales.", overlayText: "El problema real", brollQuery: `${topic} problem people` },
    { line: "Después, buscá un ejemplo cotidiano que muestre la idea funcionando de forma clara.", overlayText: "Un ejemplo concreto", brollQuery: `${topic} daily example` },
    { line: "Compará el antes con el después para que el cambio resulte fácil de entender.", overlayText: "Antes y después", brollQuery: `${topic} before after` },
    { line: "Elegí un paso pequeño, probalo una semana y medí qué resultado produce realmente.", overlayText: "Probalo una semana", brollQuery: `${topic} action routine` },
    { line: "Ahora decidí: ¿lo aplicarías en tu rutina? Guardá el video y contame por qué.", overlayText: "¿Vos lo probarías?", brollQuery: `${topic} social question` }
  ];
  const scenes = normalizeSceneDurations(
    rawScenes.map((scene, index) => hydrateScene(scene, index, targetDuration, rawScenes.length)),
    Math.max(targetDuration, minDuration)
  );
  return {
    title: idea.slice(0, 80),
    hook: scenes[0].line,
    narration: scenes.map(scene => scene.line).join(" "),
    caption: `${idea}\n\n#Contenido #Ideas #Reels`,
    sources: [],
    scenes
  };
}

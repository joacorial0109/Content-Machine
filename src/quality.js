export function estimateNarrationDuration(text, wordsPerSecond = 2.35) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return words ? words / wordsPerSecond : 0;
}

export function planNeedsExpansion(plan, minDuration, minScenes = 5) {
  return planQualityIssues(plan, minDuration, minScenes).length > 0;
}

export function planQualityIssues(plan, minDuration, minScenes = 5) {
  const scenes = Array.isArray(plan?.scenes) ? plan.scenes : [];
  const issues = [];
  if (scenes.length < minScenes || scenes.length > 8) issues.push(`se requieren entre ${minScenes} y 8 escenas`);
  if (estimateNarrationDuration(plan?.narration) < minDuration) issues.push(`la narración dura menos de ${minDuration} segundos`);
  scenes.forEach((scene, index) => {
    const overlayWords = String(scene.overlayText || "").trim().split(/\s+/).filter(Boolean).length;
    if (overlayWords < 2 || overlayWords > 4) issues.push(`overlay inválido en escena ${index + 1}`);
    if (!Array.isArray(scene.subtitleChunks) || !scene.subtitleChunks.length) issues.push(`faltan subtítulos semánticos en escena ${index + 1}`);
  });
  return issues;
}

export function normalizeSceneDurations(scenes, targetDuration) {
  const weights = scenes.map(scene => {
    const declared = Number(scene.estimatedDuration);
    if (declared > 0) return declared;
    return Math.max(1, String(scene.line || "").trim().split(/\s+/).filter(Boolean).length);
  });
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  let assigned = 0;
  return scenes.map((scene, index) => {
    const duration = index === scenes.length - 1
      ? targetDuration - assigned
      : Number((targetDuration * weights[index] / total).toFixed(3));
    assigned += duration;
    return { ...scene, estimatedDuration: Math.max(0.5, duration) };
  });
}

export function buildBrollQueries(scene) {
  const alternatives = Array.isArray(scene.brollAlternatives) ? scene.brollAlternatives : [];
  return [...new Set([
    scene.brollQuery,
    ...alternatives,
    "content creator smartphone filming vertical",
    "video editing workflow vertical",
    "social media analytics audience retention",
    "phone scrolling social media vertical"
  ].map(value => String(value || "").trim()).filter(Boolean))];
}

export function applyBrollFallbacks(scenes, resolvedAssets) {
  const available = resolvedAssets.map((asset, index) => asset ? { asset, index } : null).filter(Boolean);
  if (!available.length) return scenes.map(scene => ({ ...scene, broll: null }));
  let fallbackIndex = 0;
  return scenes.map((scene, index) => {
    if (resolvedAssets[index]) return { ...scene, broll: { ...resolvedAssets[index], fallback: false } };
    const selected = available[fallbackIndex++ % available.length];
    return {
      ...scene,
      broll: { ...selected.asset, fallback: true, reusedFromScene: selected.index }
    };
  });
}

export function resolveVideoDuration(audioDuration, targetDuration, minDuration, preferTarget = false) {
  const requested = Math.max(Number(targetDuration) || 0, Number(minDuration) || 0);
  return preferTarget ? requested : Math.max(Number(audioDuration) || 0, requested);
}

export function buildCutTimeline(scenes, duration, cutSeconds = 3.25) {
  const clips = [];
  const seen = new Set();
  scenes.forEach((scene, sceneIndex) => {
    const asset = scene.broll;
    const identity = asset?.url || asset?.file;
    if (!asset?.file || seen.has(identity)) return;
    seen.add(identity);
    clips.push({ ...asset, sceneIndex });
  });
  if (!clips.length) return [];
  const boundedCut = Math.min(4, Math.max(2.5, Number(cutSeconds) || 3.25));
  const segmentCount = Math.max(1, Math.ceil(duration / boundedCut));
  const segmentDuration = duration / segmentCount;
  const timeline = [];
  let cursor = 0;
  for (let index = 0; index < segmentCount; index++) {
    const clipIndex = index % clips.length;
    const repetition = Math.floor(index / clips.length);
    timeline.push({
      file: clips[clipIndex].file,
      sceneIndex: clips[clipIndex].sceneIndex,
      start: cursor,
      duration: segmentDuration,
      repeated: repetition > 0,
      cropVariant: repetition % 4
    });
    cursor += segmentDuration;
  }
  return timeline;
}

export function minimumRequiredBroll(sceneCount) {
  return Math.min(3, Math.max(1, Number(sceneCount) || 1));
}

export function selectVisualMode({ demo, avatarMode, brollDownloadedCount, requiredBrollCount = 1 }) {
  if (demo) return "demo-plate";
  if (brollDownloadedCount < requiredBrollCount) throw new Error("No se encontraron clips de Pexels suficientes");
  return avatarMode === "heygen" ? "pexels-broll+heygen" : "pexels-broll";
}

export function buildRunReport({
  finalDurationSeconds = 0,
  requestedDurationSeconds: requestedDurationInput,
  targetDurationSeconds,
  minDurationSeconds,
  sceneCount,
  brollDownloadedCount,
  brollUsedCount,
  clipsUsed = [],
  repeatedClipCount,
  brollClipCount,
  voiceMode,
  voiceFileUsed = null,
  audioDurationSeconds = 0,
  subtitlePosition = "bottom-safe",
  overlayPosition = "top-safe",
  overlapCheckPassed = subtitlePosition !== overlayPosition,
  audioSourceType,
  audioWarning = null,
  avatarMode = "none",
  avatarFileUsed = null,
  avatarProvider = "none",
  avatarPosition = null,
  avatarDurationSeconds = 0,
  avatarWarning = null,
  avatarSafeAreaCheckPassed = true,
  generationMode,
  visualMode,
  usedFallback = false,
  warnings = [],
  errors = []
}) {
  const requestedDurationSeconds = Number(requestedDurationInput ?? targetDurationSeconds) || 0;
  const durationDeltaSeconds = Number((finalDurationSeconds - requestedDurationSeconds).toFixed(3));
  const reportWarnings = [...warnings];
  if (finalDurationSeconds > requestedDurationSeconds + 5) {
    const warning = `El video final supera la duración objetivo por ${durationDeltaSeconds.toFixed(1)} segundos`;
    if (!reportWarnings.includes(warning)) reportWarnings.push(warning);
  }
  return {
    requestedDurationSeconds,
    finalDurationSeconds,
    durationDeltaSeconds,
    targetDurationSeconds,
    minDurationSeconds,
    sceneCount,
    brollDownloadedCount,
    brollUsedCount,
    clipsUsed,
    repeatedClipCount: repeatedClipCount ?? clipsUsed.filter(clip => clip.repeated).length,
    brollClipCount: brollClipCount ?? brollUsedCount,
    voiceMode,
    voiceFileUsed,
    audioDurationSeconds,
    subtitlePosition,
    overlayPosition,
    overlapCheckPassed,
    audioSourceType,
    audioWarning,
    avatarMode,
    avatarFileUsed,
    avatarProvider,
    avatarPosition,
    avatarDurationSeconds,
    avatarWarning,
    avatarSafeAreaCheckPassed,
    generationMode,
    visualMode,
    usedFallback,
    warnings: reportWarnings,
    errors,
    durationMinimumPass: finalDurationSeconds >= minDurationSeconds
  };
}

export function assertMinimumDuration(report) {
  if (!report.durationMinimumPass) {
    throw new Error(`El video final dura ${report.finalDurationSeconds.toFixed(1)}s; el mínimo es ${report.minDurationSeconds}s`);
  }
}

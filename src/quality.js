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
    if (overlayWords < 2 || overlayWords > 6) issues.push(`overlay inválido en escena ${index + 1}`);
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
    "vertical lifestyle cinematic",
    "people daily life vertical"
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

export function resolveVideoDuration(audioDuration, targetDuration, minDuration) {
  return Math.max(Number(audioDuration) || 0, Number(targetDuration) || 0, Number(minDuration) || 0);
}

export function buildCutTimeline(scenes, duration, cutSeconds = 4) {
  const clips = scenes.map(scene => scene.broll).filter(asset => asset?.file);
  if (!clips.length) return [];
  const segmentCount = Math.max(1, Math.ceil(duration / cutSeconds));
  const segmentDuration = duration / segmentCount;
  const timeline = [];
  let cursor = 0;
  for (let index = 0; index < segmentCount; index++) {
    timeline.push({
      file: clips[index % clips.length].file,
      sceneIndex: index % scenes.length,
      start: cursor,
      duration: segmentDuration
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
  if (avatarMode === "local") {
    if (brollDownloadedCount < requiredBrollCount) throw new Error("No se encontraron clips de Pexels suficientes");
    return "pexels-broll";
  }
  return "heygen-avatar";
}

export function buildRunReport({
  finalDurationSeconds = 0,
  targetDurationSeconds,
  minDurationSeconds,
  sceneCount,
  brollDownloadedCount,
  brollUsedCount,
  clipsUsed = [],
  visualMode,
  usedFallback = false,
  warnings = [],
  errors = []
}) {
  return {
    finalDurationSeconds,
    targetDurationSeconds,
    minDurationSeconds,
    sceneCount,
    brollDownloadedCount,
    brollUsedCount,
    clipsUsed,
    visualMode,
    usedFallback,
    warnings,
    errors,
    durationMinimumPass: finalDurationSeconds >= minDurationSeconds
  };
}

export function assertMinimumDuration(report) {
  if (!report.durationMinimumPass) {
    throw new Error(`El video final dura ${report.finalDurationSeconds.toFixed(1)}s; el mínimo es ${report.minDurationSeconds}s`);
  }
}

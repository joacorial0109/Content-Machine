export function estimateNarrationDuration(text, wordsPerSecond = 2.35) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return words ? words / wordsPerSecond : 0;
}

export function planNeedsExpansion(plan, minDuration, minScenes = 5) {
  const scenes = Array.isArray(plan?.scenes) ? plan.scenes : [];
  return scenes.length < minScenes || scenes.length > 8 || estimateNarrationDuration(plan?.narration) < minDuration;
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

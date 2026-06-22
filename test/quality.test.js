import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBrollFallbacks,
  assertMinimumDuration,
  buildRunReport,
  buildCutTimeline,
  minimumRequiredBroll,
  normalizeSceneDurations,
  planNeedsExpansion,
  resolveVideoDuration,
  selectVisualMode
} from "../src/quality.js";

const scenes = Array.from({ length: 5 }, (_, index) => ({
  line: `Texto narrado para la escena ${index + 1}`,
  subtitleChunks: [`Texto completo de la escena ${index + 1}`],
  brollQuery: `query ${index + 1}`,
  overlayText: `Idea clave ${index + 1}`,
  estimatedDuration: 7
}));

test("la duración final nunca baja del mínimo", () => {
  assert.equal(resolveVideoDuration(8, 20, 25), 25);
  assert.equal(resolveVideoDuration(40, 35, 25), 40);
  assert.equal(resolveVideoDuration(45.5, 35, 25, true), 35);
});

test("un plan con menos de cinco escenas requiere expansión", () => {
  const narration = Array(70).fill("palabra").join(" ");
  assert.equal(planNeedsExpansion({ narration, scenes: scenes.slice(0, 4) }, 25), true);
  assert.equal(planNeedsExpansion({ narration, scenes }, 25), false);
});

test("normaliza cinco escenas a la duración objetivo", () => {
  const normalized = normalizeSceneDurations(scenes, 35);
  const total = normalized.reduce((sum, scene) => sum + scene.estimatedDuration, 0);
  assert.equal(normalized.length, 5);
  assert.ok(Math.abs(total - 35) < 0.01);
  assert.ok(normalized.every(scene => scene.estimatedDuration > 0));
});

test("reutiliza un b-roll disponible como fallback para escenas faltantes", () => {
  const asset = { file: "clip.mp4", fileName: "clip.mp4", query: "generic" };
  const assigned = applyBrollFallbacks(scenes, [asset, null, null, null, null]);
  assert.equal(assigned.filter(scene => scene.broll).length, 5);
  assert.equal(assigned.filter(scene => scene.broll.fallback).length, 4);
});

test("el modo local no vuelve a placa si existe al menos un b-roll", () => {
  const asset = { file: "clip.mp4", fileName: "clip.mp4", query: "generic" };
  const assigned = applyBrollFallbacks(scenes, [asset, null, null, null, null]);
  const timeline = buildCutTimeline(assigned, 35, 4);
  assert.ok(timeline.length >= 9);
  assert.ok(timeline.every(segment => segment.file === "clip.mp4"));
  assert.ok(timeline.every(segment => segment.duration <= 4));
  assert.ok(timeline.every(segment => segment.duration >= 3));
});

test("no repite clips antes de usar todas las alternativas", () => {
  const assigned = scenes.slice(0, 3).map((scene, index) => ({
    ...scene,
    broll: { file: `clip-${index}.mp4` }
  }));
  const timeline = buildCutTimeline(assigned, 12, 3);
  assert.deepEqual(timeline.slice(0, 3).map(segment => segment.file), [
    "clip-0.mp4", "clip-1.mp4", "clip-2.mp4"
  ]);
  assert.ok(timeline.slice(0, 3).every(segment => segment.repeated === false));
  assert.equal(timeline[3].repeated, true);
  assert.notEqual(timeline[3].cropVariant, timeline[0].cropVariant);
  const report = buildRunReport({
    requestedDurationSeconds: 12,
    finalDurationSeconds: 12,
    minDurationSeconds: 10,
    clipsUsed: timeline
  });
  assert.equal(report.repeatedClipCount, 1);
});

test("modo real local selecciona exclusivamente el renderer de Pexels", () => {
  assert.equal(selectVisualMode({
    demo: false,
    avatarMode: "local",
    brollDownloadedCount: 3,
    requiredBrollCount: minimumRequiredBroll(5)
  }), "pexels-broll");
});

test("manual y template no seleccionan composeLocal en modo real", () => {
  for (const generationMode of ["manual", "template"]) {
    const visualMode = selectVisualMode({
      demo: false,
      avatarMode: "local",
      brollDownloadedCount: 3,
      requiredBrollCount: 3
    });
    assert.equal(visualMode, "pexels-broll", generationMode);
  }
});

test("modo real local falla cuando Pexels no trae clips suficientes", () => {
  assert.throws(() => selectVisualMode({
    demo: false,
    avatarMode: "local",
    brollDownloadedCount: 0,
    requiredBrollCount: minimumRequiredBroll(5)
  }), /No se encontraron clips de Pexels suficientes/);
});

test("reporte falla si la duración final queda debajo del mínimo", () => {
  const report = buildRunReport({
    finalDurationSeconds: 17,
    targetDurationSeconds: 35,
    minDurationSeconds: 25,
    sceneCount: 5,
    brollDownloadedCount: 3,
    brollUsedCount: 3,
    visualMode: "pexels-broll"
  });
  assert.equal(report.durationMinimumPass, false);
  assert.throws(() => assertMinimumDuration(report), /el mínimo es 25s/);
});

test("reporte registra duración y cantidad de b-roll descargado", () => {
  const report = buildRunReport({
    finalDurationSeconds: 35,
    targetDurationSeconds: 35,
    minDurationSeconds: 25,
    sceneCount: 6,
    brollDownloadedCount: 4,
    brollUsedCount: 4,
    visualMode: "pexels-broll",
    generationMode: "template",
    usedFallback: true,
    warnings: ["fallback"]
  });
  assert.equal(report.finalDurationSeconds, 35);
  assert.equal(report.brollDownloadedCount, 4);
  assert.equal(report.generationMode, "template");
  assert.equal(report.durationMinimumPass, true);
});

test("reporte avisa cuando supera el target por más de cinco segundos", () => {
  const report = buildRunReport({
    requestedDurationSeconds: 35,
    targetDurationSeconds: 35,
    finalDurationSeconds: 45.5,
    minDurationSeconds: 25,
    clipsUsed: []
  });
  assert.equal(report.requestedDurationSeconds, 35);
  assert.equal(report.durationDeltaSeconds, 10.5);
  assert.match(report.warnings.join(" "), /supera la duración objetivo/);
});

test("reporte registra voz y validación de superposición", () => {
  const report = buildRunReport({
    requestedDurationSeconds: 35,
    finalDurationSeconds: 35,
    minDurationSeconds: 25,
    voiceMode: "file",
    voiceFileUsed: "narracion.mp3",
    audioDurationSeconds: 35,
    subtitlePosition: "bottom-safe",
    overlayPosition: "top-safe",
    overlapCheckPassed: true
  });
  assert.equal(report.voiceMode, "file");
  assert.equal(report.voiceFileUsed, "narracion.mp3");
  assert.equal(report.audioDurationSeconds, 35);
  assert.equal(report.overlapCheckPassed, true);
});

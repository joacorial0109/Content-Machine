import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBrollFallbacks,
  buildCutTimeline,
  normalizeSceneDurations,
  planNeedsExpansion,
  resolveVideoDuration
} from "../src/quality.js";

const scenes = Array.from({ length: 5 }, (_, index) => ({
  line: `Texto narrado para la escena ${index + 1}`,
  brollQuery: `query ${index + 1}`,
  estimatedDuration: 7
}));

test("la duración final nunca baja del mínimo", () => {
  assert.equal(resolveVideoDuration(8, 20, 25), 25);
  assert.equal(resolveVideoDuration(40, 35, 25), 40);
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

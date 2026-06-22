import test from "node:test";
import assert from "node:assert/strict";
import { createTemplatePlan, parseManualPlan } from "../src/generation.js";
import { estimateNarrationDuration } from "../src/quality.js";

const manualScenes = Array.from({ length: 5 }, (_, index) => ({
  line: `Esta es una frase narrada suficientemente clara para desarrollar la idea principal de la escena número ${index + 1} sin cortar el mensaje.`,
  brollQuery: `daily routine scene ${index + 1}`,
  overlayText: `Idea clave ${index + 1}`
}));

test("plan manual conserva estructura y duración mínima", () => {
  const plan = parseManualPlan(JSON.stringify({
    title: "Título manual",
    hook: "Este es el hook",
    narration: manualScenes.map(scene => scene.line).join(" "),
    caption: "Caption",
    hashtags: ["#manual", "#gratis"],
    scenes: manualScenes
  }), 35, 25);
  assert.equal(plan.scenes.length, 5);
  assert.ok(estimateNarrationDuration(plan.narration) >= 25);
  assert.equal(plan.caption, "Caption #manual #gratis");
  assert.ok(Math.abs(plan.scenes.reduce((sum, scene) => sum + scene.estimatedDuration, 0) - 35) < 0.01);
});

test("plan manual corto falla en lugar de producir video menor al mínimo", () => {
  const shortScenes = manualScenes.map(scene => ({ ...scene, line: "Una frase corta." }));
  assert.throws(() => parseManualPlan(JSON.stringify({ scenes: shortScenes }), 35, 25), /al menos 25 segundos/);
});

test("template crea entre cinco y ocho escenas sin OpenAI", () => {
  const plan = createTemplatePlan("Cómo mejorar una rutina de estudio sin perder motivación", 35, 25);
  assert.ok(plan.scenes.length >= 5 && plan.scenes.length <= 8);
  assert.ok(estimateNarrationDuration(plan.narration) >= 25);
  assert.ok(plan.scenes.every(scene => scene.brollQuery && scene.overlayText));
});

import test from "node:test";
import assert from "node:assert/strict";
import { assertRealConfig, missingForRealConfig } from "../src/config.js";

const base = {
  generationMode: "ai",
  voiceMode: "windows",
  openaiKey: "openai-test",
  pexelsKey: "pexels-test",
  heygenKey: "",
  avatarId: "",
  voiceId: ""
};

test("modo real local no requiere configuración de HeyGen", () => {
  const input = { ...base, avatarMode: "local" };
  assert.deepEqual(missingForRealConfig(input), []);
  assert.doesNotThrow(() => assertRealConfig(input));
});

test("modo real HeyGen exige sus tres variables", () => {
  const input = { ...base, avatarMode: "heygen" };
  assert.deepEqual(missingForRealConfig(input), [
    "HEYGEN_API_KEY",
    "HEYGEN_AVATAR_ID",
    "HEYGEN_VOICE_ID"
  ]);
  assert.throws(() => assertRealConfig(input), /HEYGEN_API_KEY/);
});

test("modo real local exige OpenAI y Pexels", () => {
  const input = { ...base, avatarMode: "local", openaiKey: "", pexelsKey: "" };
  assert.deepEqual(missingForRealConfig(input), ["OPENAI_API_KEY", "PEXELS_API_KEY"]);
});

test("rechaza valores desconocidos de AVATAR_MODE", () => {
  assert.deepEqual(missingForRealConfig({ ...base, avatarMode: "otro" }), [
    "AVATAR_MODE debe ser local o heygen"
  ]);
});

test("generation manual no exige OpenAI", () => {
  const input = { ...base, generationMode: "manual", avatarMode: "local", openaiKey: "" };
  assert.deepEqual(missingForRealConfig(input), []);
});

test("generation template no exige OpenAI", () => {
  const input = { ...base, generationMode: "template", avatarMode: "local", openaiKey: "" };
  assert.deepEqual(missingForRealConfig(input), []);
});

test("generation AI exige OpenAI", () => {
  const input = { ...base, generationMode: "ai", avatarMode: "local", openaiKey: "" };
  assert.deepEqual(missingForRealConfig(input), ["OPENAI_API_KEY"]);
});

test("manual y template exigen AVATAR_MODE local", () => {
  for (const generationMode of ["manual", "template"]) {
    assert.deepEqual(missingForRealConfig({ ...base, generationMode, avatarMode: "heygen" }), [
      "AVATAR_MODE debe ser local cuando GENERATION_MODE es manual o template"
    ]);
  }
});

test("VOICE_MODE file funciona sin OpenAI ni HeyGen", () => {
  const input = { ...base, generationMode: "manual", avatarMode: "local", voiceMode: "file", openaiKey: "" };
  assert.deepEqual(missingForRealConfig(input), []);
});

test("VOICE_MODE windows mantiene el flujo local", () => {
  const input = { ...base, generationMode: "manual", avatarMode: "local", voiceMode: "windows", openaiKey: "" };
  assert.deepEqual(missingForRealConfig(input), []);
});

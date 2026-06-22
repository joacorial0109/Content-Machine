import test from "node:test";
import assert from "node:assert/strict";
import { secondsToSrt, makeSceneOverlaySrt, makeSrt, TEXT_LAYOUT, validateTextLayout } from "../src/media.js";

test("formatea tiempos SRT", () => assert.equal(secondsToSrt(65.432), "00:01:05,432"));
test("divide subtítulos largos y termina en la duración", () => {
  const srt = makeSrt([{line:"Hola mundo"},{line:"Segunda escena más larga"}], 10);
  assert.match(srt, /1\n00:00:00,000 -->/);
  assert.match(srt, /2\n.* --> 00:00:10,000/);
});

test("respeta los fragmentos semánticos provistos por OpenAI", () => {
  const srt = makeSrt([{
    line: "Una oración extensa que no debe cortarse de manera arbitraria.",
    subtitleChunks: ["Una oración completa.", "Una segunda idea clara."],
    estimatedDuration: 6
  }], 6);
  assert.match(srt, /Una oración completa\./);
  assert.match(srt, /Una segunda idea clara\./);
  assert.doesNotMatch(srt, /que no debe cortarse/);
});

test("cada línea de subtítulo tiene como máximo seis palabras", () => {
  const srt = makeSrt([{
    line: "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece",
    subtitleChunks: ["uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece"]
  }], 8);
  const textLines = srt.split("\n").filter(line => line && !/^\d+$/.test(line) && !line.includes(" --> "));
  assert.ok(textLines.length >= 3);
  assert.ok(textLines.every(line => line.trim().split(/\s+/).length <= 6));
});

test("overlay se limita a cuatro palabras y dura solo al inicio", () => {
  const srt = makeSceneOverlaySrt([{ overlayText: "uno dos tres cuatro cinco seis", estimatedDuration: 8 }], 8);
  assert.match(srt, /00:00:00,000 --> 00:00:02,500/);
  assert.match(srt, /uno dos tres cuatro/);
  assert.doesNotMatch(srt, /cinco seis/);
});

test("overlay y subtítulo usan zonas seguras distintas", () => {
  assert.equal(TEXT_LAYOUT.overlay.zone, "top-safe");
  assert.equal(TEXT_LAYOUT.subtitle.zone, "bottom-safe");
  assert.notEqual(TEXT_LAYOUT.overlay.alignment, TEXT_LAYOUT.subtitle.alignment);
  assert.equal(validateTextLayout(), true);
});

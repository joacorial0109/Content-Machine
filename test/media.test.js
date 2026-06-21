import test from "node:test";
import assert from "node:assert/strict";
import { secondsToSrt, makeSrt } from "../src/media.js";

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

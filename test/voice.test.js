import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeVoiceMode, resolveVoiceFile } from "../src/voice.js";

test("normaliza los modos de voz gratuitos", () => {
  assert.equal(normalizeVoiceMode("windows"), "windows");
  assert.equal(normalizeVoiceMode("file"), "file");
  assert.equal(normalizeVoiceMode("heygen"), "heygen");
  assert.throws(() => normalizeVoiceMode("openai"), /windows, file o heygen/);
});

test("acepta un archivo de voz MP3 local", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "content-machine-voice-"));
  const file = path.join(directory, "voz.mp3");
  await fs.writeFile(file, "audio-test");
  assert.equal(await resolveVoiceFile(file), file);
  await fs.rm(directory, { recursive: true, force: true });
});

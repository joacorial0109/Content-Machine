import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { saveAudioUpload, saveAvatarUpload } from "../src/uploads.js";

test("guarda localmente un WAV cargado desde la interfaz", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "content-machine-upload-"));
  const request = Readable.from([Buffer.from("audio")]);
  request.headers = { "x-file-name": encodeURIComponent("mi voz.wav") };
  const result = await saveAudioUpload(request, directory);
  assert.equal(result.name, "mi voz.wav");
  assert.equal(result.size, 5);
  assert.equal(await fs.readFile(result.path, "utf8"), "audio");
  await fs.rm(directory, { recursive: true, force: true });
});

test("guarda imagen de avatar cargada desde la interfaz", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "content-machine-avatar-upload-"));
  const request = Readable.from([Buffer.from("image")]);
  request.headers = { "x-file-name": "avatar.png" };
  const result = await saveAvatarUpload(request, directory);
  assert.equal(result.name, "avatar.png");
  assert.equal(result.size, 5);
  await fs.rm(directory, { recursive: true, force: true });
});

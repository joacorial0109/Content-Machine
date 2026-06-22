import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { avatarRenderSpec, avatarSafeAreaCheck, normalizeAvatarOptions, resolveLocalAvatarFile } from "../src/avatar.js";

test("AVATAR_MODE none conserva el montaje sin avatar", () => {
  assert.equal(normalizeAvatarOptions({ avatarMode: "none" }).mode, "none");
});

test("avatar local acepta imagen y video", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "content-machine-avatar-"));
  const image = path.join(directory, "avatar.png");
  const video = path.join(directory, "avatar.mp4");
  await fs.writeFile(image, "image");
  await fs.writeFile(video, "video");
  assert.equal((await resolveLocalAvatarFile(image)).type, "image");
  assert.equal((await resolveLocalAvatarFile(video)).type, "video");
  await fs.rm(directory, { recursive: true, force: true });
});

test("avatar local falla claramente si no existe", async () => {
  await assert.rejects(resolveLocalAvatarFile("avatar-inexistente.png"), /No se encontró/);
});

test("avatar queda fuera de la zona inferior de subtítulos", () => {
  const options = { avatarMode: "local", avatarUsage: "strategic", localAvatarPosition: "bottom-right", localAvatarSize: "medium" };
  assert.equal(avatarSafeAreaCheck(options), true);
  assert.match(avatarRenderSpec(options, 35).y, /430/);
});

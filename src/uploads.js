import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

async function saveUpload(req, uploadsDir, { extensions, fallbackName, label, maxBytes = 100 * 1024 * 1024 }) {
  const originalName = decodeURIComponent(String(req.headers?.["x-file-name"] || fallbackName));
  const extension = path.extname(originalName).toLowerCase();
  if (!extensions.includes(extension)) throw new Error(`${label}: formato no compatible`);
  await fs.mkdir(uploadsDir, { recursive: true });
  const destination = path.join(uploadsDir, `${crypto.randomUUID()}${extension}`);
  const handle = await fs.open(destination, "wx");
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) throw new Error(`${label} supera 100 MB`);
      await handle.write(chunk);
    }
  } catch (error) {
    await handle.close();
    await fs.rm(destination, { force: true });
    throw error;
  }
  await handle.close();
  if (!size) {
    await fs.rm(destination, { force: true });
    throw new Error(`${label} está vacío`);
  }
  return { path: destination, name: path.basename(originalName), size };
}

export function saveAudioUpload(req, uploadsDir, maxBytes) {
  return saveUpload(req, uploadsDir, {
    extensions: [".mp3", ".wav", ".m4a"], fallbackName: "voice.wav",
    label: "El archivo de voz", maxBytes
  });
}

export function saveAvatarUpload(req, uploadsDir, maxBytes) {
  return saveUpload(req, uploadsDir, {
    extensions: [".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov", ".webm"],
    fallbackName: "avatar.png", label: "El archivo de avatar", maxBytes
  });
}

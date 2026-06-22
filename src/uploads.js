import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export async function saveAudioUpload(req, uploadsDir, maxBytes = 100 * 1024 * 1024) {
  const originalName = decodeURIComponent(String(req.headers?.["x-file-name"] || "voice.wav"));
  const extension = path.extname(originalName).toLowerCase();
  if (![".mp3", ".wav"].includes(extension)) throw new Error("El archivo de voz debe ser .mp3 o .wav");
  await fs.mkdir(uploadsDir, { recursive: true });
  const destination = path.join(uploadsDir, `${crypto.randomUUID()}${extension}`);
  const handle = await fs.open(destination, "wx");
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) throw new Error("El archivo de voz supera 100 MB");
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
    throw new Error("El archivo de voz está vacío");
  }
  return { path: destination, name: path.basename(originalName), size };
}

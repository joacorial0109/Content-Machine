import fs from "node:fs/promises";
import path from "node:path";

export function normalizeVoiceMode(value) {
  const mode = String(value || "windows").trim().toLowerCase();
  if (!["windows", "file"].includes(mode)) throw new Error("VOICE_MODE debe ser windows o file");
  return mode;
}

export async function resolveVoiceFile(value) {
  const file = path.resolve(String(value || "").trim());
  if (!value) throw new Error("Elegí o indicá un archivo de voz MP3 o WAV");
  if (![".mp3", ".wav"].includes(path.extname(file).toLowerCase())) {
    throw new Error("El archivo de voz debe ser .mp3 o .wav");
  }
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) throw new Error("No se encontró el archivo de voz indicado");
  return file;
}

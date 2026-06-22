import fs from "node:fs/promises";
import path from "node:path";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const videoExtensions = new Set([".mp4", ".mov", ".webm"]);

export function normalizeAvatarOptions(input = {}) {
  const mode = String(input.avatarMode || "none").toLowerCase();
  const usage = String(input.avatarUsage || "strategic").toLowerCase();
  const position = String(input.localAvatarPosition || "bottom-right").toLowerCase();
  const size = String(input.localAvatarSize || "medium").toLowerCase();
  if (!["none", "local", "heygen"].includes(mode)) throw new Error("AVATAR_MODE debe ser none, local o heygen");
  if (!["none", "intro", "outro", "full", "strategic"].includes(usage)) throw new Error("AVATAR_USAGE inválido");
  if (!["bottom-right", "bottom-left", "center"].includes(position)) throw new Error("LOCAL_AVATAR_POSITION inválido");
  if (!["small", "medium", "large"].includes(size)) throw new Error("LOCAL_AVATAR_SIZE inválido");
  return { mode, usage, position, size };
}

export async function resolveLocalAvatarFile(value) {
  if (!String(value || "").trim()) throw new Error("Elegí o indicá una imagen o video para el avatar local");
  const file = path.resolve(String(value).trim());
  const extension = path.extname(file).toLowerCase();
  const type = imageExtensions.has(extension) ? "image" : videoExtensions.has(extension) ? "video" : null;
  if (!type) throw new Error("El avatar local debe ser PNG, JPG, WEBP, MP4, MOV o WEBM");
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) throw new Error("No se encontró el archivo de avatar local");
  return { file, type, fileName: path.basename(file) };
}

export function avatarRenderSpec(options, duration) {
  const { usage, position, size } = normalizeAvatarOptions(options);
  const width = { small: 180, medium: 260, large: 340 }[size];
  const x = position === "bottom-left" ? "70" : position === "center" ? "(W-w)/2" : "W-w-70";
  const y = position === "center" ? "(H-h)/2" : "H-h-430";
  const end = Number(duration) || 0;
  const enable = usage === "intro" ? `between(t,0,${Math.min(5, end).toFixed(2)})`
    : usage === "outro" ? `gte(t,${Math.max(0, end - 5).toFixed(2)})`
    : usage === "strategic" ? `between(t,0,4)+between(t,${Math.max(4, end * 0.45).toFixed(2)},${Math.min(end, end * 0.45 + 4).toFixed(2)})+gte(t,${Math.max(0, end - 4).toFixed(2)})`
    : usage === "none" ? "0" : "1";
  return { width, x, y, enable };
}

export function avatarSafeAreaCheck(options) {
  const { position, size } = normalizeAvatarOptions(options);
  return ["bottom-right", "bottom-left", "center"].includes(position) && ["small", "medium", "large"].includes(size);
}

import fs from "node:fs";
import path from "node:path";

export function loadEnv(file = path.resolve(".env")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

export const config = {
  port: Number(process.env.PORT || 3000),
  demo: process.env.DEMO_MODE !== "false",
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  heygenKey: process.env.HEYGEN_API_KEY || "",
  avatarId: process.env.HEYGEN_AVATAR_ID || "",
  voiceId: process.env.HEYGEN_VOICE_ID || "",
  pexelsKey: process.env.PEXELS_API_KEY || "",
  musicFile: process.env.MUSIC_FILE || "",
  ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobe: process.env.FFPROBE_PATH || "ffprobe"
};

export function assertRealConfig() {
  const missing = [];
  for (const [name, value] of [
    ["OPENAI_API_KEY", config.openaiKey], ["HEYGEN_API_KEY", config.heygenKey],
    ["HEYGEN_AVATAR_ID", config.avatarId], ["HEYGEN_VOICE_ID", config.voiceId],
    ["PEXELS_API_KEY", config.pexelsKey]
  ]) if (!value) missing.push(name);
  if (missing.length) throw new Error(`Faltan variables: ${missing.join(", ")}`);
}

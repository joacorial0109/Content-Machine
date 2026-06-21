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

const settingsFile = path.resolve("settings.json");
let saved = {};
try { saved = JSON.parse(fs.readFileSync(settingsFile, "utf8")); } catch {}

export const config = {
  port: Number(process.env.PORT || 3000),
  demo: saved.demo ?? process.env.DEMO_MODE !== "false",
  openaiKey: saved.openaiKey || process.env.OPENAI_API_KEY || "",
  openaiModel: saved.openaiModel || process.env.OPENAI_MODEL || "gpt-4.1-mini",
  heygenKey: saved.heygenKey || process.env.HEYGEN_API_KEY || "",
  avatarId: saved.avatarId || process.env.HEYGEN_AVATAR_ID || "",
  voiceId: saved.voiceId || process.env.HEYGEN_VOICE_ID || "",
  pexelsKey: saved.pexelsKey || process.env.PEXELS_API_KEY || "",
  musicFile: saved.musicFile || process.env.MUSIC_FILE || "",
  ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobe: process.env.FFPROBE_PATH || "ffprobe"
};

export function publicSettings() {
  return {
    demo: config.demo, openaiModel: config.openaiModel,
    hasOpenaiKey: Boolean(config.openaiKey), hasHeygenKey: Boolean(config.heygenKey),
    hasPexelsKey: Boolean(config.pexelsKey), avatarId: config.avatarId,
    voiceId: config.voiceId, musicFile: config.musicFile,
    readyForPro: ![config.openaiKey, config.heygenKey, config.pexelsKey, config.avatarId, config.voiceId].some(x => !x)
  };
}

export function saveSettings(input) {
  const fields = ["openaiKey", "openaiModel", "heygenKey", "avatarId", "voiceId", "pexelsKey", "musicFile"];
  for (const field of fields) {
    if (typeof input[field] === "string" && input[field].trim()) config[field] = input[field].trim();
  }
  const complete = [config.openaiKey, config.heygenKey, config.pexelsKey, config.avatarId, config.voiceId].every(Boolean);
  config.demo = input.demo === true || !complete;
  const data = Object.fromEntries(fields.map(field => [field, config[field]]));
  data.demo = config.demo;
  fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2));
  return publicSettings();
}

export function assertRealConfig() {
  const missing = [];
  for (const [name, value] of [
    ["OPENAI_API_KEY", config.openaiKey], ["HEYGEN_API_KEY", config.heygenKey],
    ["HEYGEN_AVATAR_ID", config.avatarId], ["HEYGEN_VOICE_ID", config.voiceId],
    ["PEXELS_API_KEY", config.pexelsKey]
  ]) if (!value) missing.push(name);
  if (missing.length) throw new Error(`Faltan variables: ${missing.join(", ")}`);
}

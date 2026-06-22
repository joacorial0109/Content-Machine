import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config, publicSettings, saveSettings } from "./config.js";
import { runPipeline } from "./pipeline.js";

const publicDir = path.resolve("public");
const runsDir = path.resolve("runs");
const jobs = new Map();
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mp4": "video/mp4", ".json": "application/json" };

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function body(req) {
  let value = "";
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 100_000) throw new Error("Solicitud demasiado grande");
  }
  return JSON.parse(value || "{}");
}

function safeFile(base, relative) {
  const result = path.resolve(base, relative.replace(/^[/\\]+/, ""));
  return result.startsWith(base + path.sep) || result === base ? result : null;
}

async function serve(res, file) {
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error();
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Content-Length": stat.size });
    fs.createReadStream(file).pipe(res);
  } catch { json(res, 404, { error: "No encontrado" }); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/status") return json(res, 200, { demo: config.demo, ready: true, settings: publicSettings() });
    if (req.method === "GET" && url.pathname === "/api/settings") return json(res, 200, publicSettings());
    if (req.method === "POST" && url.pathname === "/api/settings") {
      const data = await body(req);
      return json(res, 200, saveSettings(data));
    }
    if (req.method === "POST" && url.pathname === "/api/jobs") {
      const data = await body(req);
      const trigger = String(data.trigger || "").trim();
      if (config.generationMode !== "manual" && trigger.length < 10) return json(res, 400, { error: "Escribí una idea, noticia o texto de al menos 10 caracteres." });
      const job = { id: crypto.randomUUID(), status: "running", stage: "queued", message: "Preparando", createdAt: new Date().toISOString() };
      jobs.set(job.id, job);
      const options = {
        platform: String(data.platform || "TikTok e Instagram Reels").slice(0, 60),
        tone: String(data.tone || "directo").slice(0, 40),
        duration: Math.min(90, Math.max(config.minDuration, Number(data.duration) || config.targetDuration)),
        manualPlan: String(data.manualPlan || "").slice(0, 90_000)
      };
      runPipeline(job, trigger, options, (stage, message) => Object.assign(job, { stage, message }))
        .then(result => Object.assign(job, { status: "completed", stage: "done", message: "Listo", result }))
        .catch(error => Object.assign(job, { status: "failed", message: error.message }));
      return json(res, 202, job);
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/jobs/")) {
      const job = jobs.get(url.pathname.split("/").pop());
      return job ? json(res, 200, job) : json(res, 404, { error: "Trabajo no encontrado" });
    }
    if (req.method === "GET" && url.pathname.startsWith("/runs/")) {
      const file = safeFile(runsDir, url.pathname.slice(6));
      return file ? serve(res, file) : json(res, 403, { error: "Ruta inválida" });
    }
    const file = url.pathname === "/" ? path.join(publicDir, "index.html") : safeFile(publicDir, url.pathname);
    return file ? serve(res, file) : json(res, 404, { error: "No encontrado" });
  } catch (error) { json(res, 500, { error: error.message }); }
});

server.listen(config.port, "127.0.0.1", () => console.log(`Content Machine: http://localhost:${config.port} (${config.demo ? "demo" : "real"})`));

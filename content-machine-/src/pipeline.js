import fs from "node:fs/promises";
import path from "node:path";
import { config, assertRealConfig } from "./config.js";
import { createPlan, createAvatarVideo, findBroll, download } from "./clients.js";
import { compose, durationOf, makeSrt } from "./media.js";

const demoPlan = trigger => ({
  title: "Tu idea convertida en reel",
  hook: "Esto empezó con una sola idea.",
  narration: `Esto empezó con una sola idea: ${trigger}. La máquina la convierte en un guion corto, crea la voz y el avatar, busca imágenes para acompañar cada punto, agrega música y subtítulos, y entrega un video vertical listo para revisar. Todo queda organizado en un solo flujo.`,
  caption: "De una idea a un reel completo, automáticamente. #IA #Contenido",
  scenes: [
    { line: "Esto empezó con una sola idea.", brollQuery: "creative idea lightbulb" },
    { line: "La máquina escribe el guion y crea el avatar.", brollQuery: "artificial intelligence creator" },
    { line: "Después suma imágenes, música y subtítulos.", brollQuery: "video editing timeline" },
    { line: "Y entrega un reel listo para revisar.", brollQuery: "social media phone" }
  ]
});

export async function runPipeline(job, trigger, onProgress) {
  const dir = path.resolve("runs", job.id);
  await fs.mkdir(dir, { recursive: true });
  onProgress("script", "Creando el guion y el plan visual");
  const plan = config.demo ? demoPlan(trigger) : (assertRealConfig(), await createPlan(trigger, config));
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));
  if (config.demo) {
    await new Promise(r => setTimeout(r, 900));
    onProgress("avatar", "Simulando voz y avatar");
    await new Promise(r => setTimeout(r, 900));
    onProgress("broll", "Simulando búsqueda de material visual");
    await new Promise(r => setTimeout(r, 900));
    return { demo: true, plan };
  }

  onProgress("avatar", "Generando avatar y voz");
  const avatarUrl = await createAvatarVideo(plan, config);
  const avatar = await download(avatarUrl, path.join(dir, "avatar.mp4"));

  onProgress("broll", "Buscando material visual");
  const broll = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    const url = await findBroll(plan.scenes[i].brollQuery, config);
    if (url) broll.push(await download(url, path.join(dir, `broll-${i}.mp4`)));
  }

  onProgress("render", "Agregando cortes, música y subtítulos");
  const duration = await durationOf(avatar, config);
  const srtFile = path.join(dir, "subtitles.srt");
  await fs.writeFile(srtFile, makeSrt(plan.scenes, duration));
  const output = path.join(dir, "reel.mp4");
  await compose({ avatar, broll, subtitles: srtFile, output, duration, music: config.musicFile || null }, config);
  return { demo: false, plan, videoUrl: `/runs/${job.id}/reel.mp4` };
}

import fs from "node:fs/promises";
import path from "node:path";
import { config, assertRealConfig } from "./config.js";
import { createPlan, createAvatarVideo, findBroll, download } from "./clients.js";
import { compose, composeLocal, createLocalVoice, durationOf, makeSrt } from "./media.js";

function demoPlan(trigger) {
  if (/5\s*(?:am|a\.?m\.?)|cinco de la mañana/i.test(trigger)) {
    const scenes = [
      { line: "Durante siete días me levanté a las cinco de la mañana. Pensé que iba a volverme mucho más productivo.", brollQuery: "early morning alarm clock" },
      { line: "Los primeros días disfruté el silencio, avancé sin interrupciones y sentí que tenía ventaja.", brollQuery: "sunrise focused work desk" },
      { line: "Pero dormir menos empezó a pasarme factura: menos energía, peor concentración y más café.", brollQuery: "tired person drinking coffee" },
      { line: "Mi conclusión fue simple: levantarte temprano no te hace productivo si sacrificás descanso.", brollQuery: "sleep wellness morning routine" },
      { line: "Lo que funciona es dormir bien, tener un plan y elegir un horario que puedas sostener.", brollQuery: "healthy productive daily planner" },
      { line: "¿Vos lo probarías durante una semana?", brollQuery: "sunrise question social media" }
    ];
    return {
      title: "Me levanté a las 5 AM durante 7 días",
      hook: "Me levanté a las cinco de la mañana durante siete días y no pasó lo que esperaba.",
      narration: scenes.map(scene => scene.line).join(" "),
      caption: "Probé levantarme a las cinco de la mañana durante una semana. La hora no fue el secreto: el descanso y la constancia sí. ¿Vos lo harías? #Rutina #Productividad #Hábitos",
      sources: [], scenes
    };
  }
  const scenes = [
    { line: `Esta es la idea: ${trigger}.`, brollQuery: "creative idea notebook" },
    { line: "La clave es convertirla en una historia concreta, con una conclusión útil y sin relleno.", brollQuery: "story planning creator desk" },
    { line: "Empezá con una frase que genere curiosidad, desarrollá un solo punto y cerrá con una pregunta.", brollQuery: "social media content planning" }
  ];
  return { title: "Idea convertida en reel", hook: scenes[0].line, narration: scenes.map(s => s.line).join(" "), caption: `${trigger} #Contenido`, sources: [], scenes };
}

export async function runPipeline(job, trigger, options, onProgress) {
  const dir = path.resolve("runs", job.id);
  await fs.mkdir(dir, { recursive: true });
  onProgress("script", "Creando el guion y el plan visual");
  const plan = config.demo ? demoPlan(trigger) : (assertRealConfig(), await createPlan(trigger, config, options));
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));
  if (config.demo) {
    onProgress("avatar", "Creando voz local");
    const textFile = path.join(dir, "narration.txt");
    const voice = path.join(dir, "voice.wav");
    await fs.writeFile(textFile, plan.narration, "utf8");
    await createLocalVoice(textFile, voice);
    const duration = await durationOf(voice, config);
    const srtFile = path.join(dir, "subtitles.srt");
    await fs.writeFile(srtFile, makeSrt(plan.scenes, duration));
    onProgress("render", "Generando MP4 vertical con subtítulos");
    const output = path.join(dir, "reel.mp4");
    await composeLocal({ voice, subtitles: srtFile, output, duration }, config);
    return { demo: true, plan, videoUrl: `/runs/${job.id}/reel.mp4` };
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

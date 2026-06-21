import fs from "node:fs/promises";
import path from "node:path";
import { config, assertRealConfig } from "./config.js";
import { createPlan, createAvatarVideo, createOpenAiSpeech, findBroll, download } from "./clients.js";
import { compose, composeLocal, composeReelWithBroll, createLocalVoice, createSilentAudio, durationOf, fitAudioDuration, makeSceneOverlaySrt, makeSrt } from "./media.js";
import { applyBrollFallbacks, assertMinimumDuration, buildBrollQueries, buildCutTimeline, buildRunReport, minimumRequiredBroll, resolveVideoDuration, selectVisualMode } from "./quality.js";

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

async function resolveSceneBroll(plan, dir, onProgress) {
  const resolved = new Array(plan.scenes.length).fill(null);
  const warnings = [];
  onProgress("broll", "Buscando material visual para cada escena");
  for (let index = 0; index < plan.scenes.length; index++) {
    const queries = buildBrollQueries(plan.scenes[index]);
    let lastError = null;
    for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
      try {
        const url = await findBroll(queries[queryIndex], config);
        if (!url) continue;
        const file = path.join(dir, `broll-${index}.mp4`);
        await download(url, file);
        resolved[index] = {
          file,
          fileName: path.basename(file),
          url,
          query: queries[queryIndex],
          queryFallback: queryIndex > 0
        };
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!resolved[index] && lastError) warnings.push(`Escena ${index + 1}: ${lastError.message}`);
  }
  const scenes = applyBrollFallbacks(plan.scenes, resolved);
  const downloadedCount = resolved.filter(Boolean).length;
  if (downloadedCount < plan.scenes.length) warnings.unshift("No se encontraron clips suficientes de Pexels");
  return {
    scenes,
    downloadedCount,
    fallbackUsed: scenes.some(scene => scene.broll?.fallback) || downloadedCount === 0,
    warnings
  };
}

export async function runPipeline(job, trigger, options, onProgress) {
  const dir = path.resolve("runs", job.id);
  await fs.mkdir(dir, { recursive: true });
  onProgress("script", "Creando el guion y el plan visual");
  let plan;
  if (config.demo) {
    plan = demoPlan(trigger);
  } else {
    assertRealConfig();
    plan = await createPlan(trigger, config, options);
  }
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

  const brollResult = await resolveSceneBroll(plan, dir, onProgress);
  plan.scenes = brollResult.scenes;
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));

  if (config.avatarMode === "local") {
    const reportFile = path.join(dir, "report.json");
    const targetDuration = Math.max(Number(options.duration) || config.targetDuration, config.minDuration);
    const requiredBrollCount = minimumRequiredBroll(plan.scenes.length);
    let visualMode;
    try {
      visualMode = selectVisualMode({
        demo: config.demo,
        avatarMode: config.avatarMode,
        brollDownloadedCount: brollResult.downloadedCount,
        requiredBrollCount
      });
    } catch (error) {
      const failedReport = buildRunReport({
        finalDurationSeconds: 0,
        targetDurationSeconds: targetDuration,
        minDurationSeconds: config.minDuration,
        sceneCount: plan.scenes.length,
        brollDownloadedCount: brollResult.downloadedCount,
        brollUsedCount: 0,
        visualMode: "none",
        usedFallback: true,
        warnings: brollResult.warnings,
        errors: [error.message]
      });
      await fs.writeFile(reportFile, JSON.stringify(failedReport, null, 2));
      throw error;
    }
    onProgress("avatar", "Generando voz para el modo local");
    const textFile = path.join(dir, "narration.txt");
    await fs.writeFile(textFile, plan.narration, "utf8");
    let voice = path.join(dir, "voice-local.wav");
    let voiceDuration = 0;
    try {
      await createLocalVoice(textFile, voice);
      voiceDuration = await durationOf(voice, config);
    } catch {
      voice = null;
    }
    const warnings = [...brollResult.warnings];
    if (!voice || voiceDuration < Math.max(config.minDuration, targetDuration * 0.85)) {
      const openAiVoice = path.join(dir, "voice-openai.mp3");
      try {
        await createOpenAiSpeech(plan.narration, config, openAiVoice);
        voice = openAiVoice;
        voiceDuration = await durationOf(voice, config);
        warnings.push("Se usó OpenAI TTS porque la voz local no alcanzó la duración objetivo");
      } catch (error) {
        warnings.push(`OpenAI TTS no disponible: ${error.message}`);
      }
    }
    if (!voice) {
      voice = path.join(dir, "voice-silent.wav");
      await createSilentAudio(voice, targetDuration, config);
      voiceDuration = targetDuration;
      warnings.push("Se usó audio silencioso de respaldo");
    }
    const duration = resolveVideoDuration(voiceDuration, targetDuration, config.minDuration);
    const fittedVoice = path.join(dir, "voice-fitted.wav");
    await fitAudioDuration(voice, fittedVoice, voiceDuration, duration, config);
    const srtFile = path.join(dir, "subtitles.srt");
    await fs.writeFile(srtFile, makeSrt(plan.scenes, duration));
    const overlaysFile = path.join(dir, "overlays.srt");
    await fs.writeFile(overlaysFile, makeSceneOverlaySrt(plan.scenes, duration));
    const timeline = buildCutTimeline(plan.scenes, duration, 4);
    const output = path.join(dir, "reel.mp4");
    const clipsUsed = timeline.map(segment => ({ file: path.basename(segment.file), sceneIndex: segment.sceneIndex, duration: segment.duration }));
    let report = buildRunReport({
      finalDurationSeconds: 0,
      targetDurationSeconds: targetDuration,
      minDurationSeconds: config.minDuration,
      sceneCount: plan.scenes.length,
      brollDownloadedCount: brollResult.downloadedCount,
      brollUsedCount: new Set(timeline.map(segment => segment.file)).size,
      clipsUsed,
      visualMode,
      usedFallback: brollResult.fallbackUsed,
      warnings,
      errors: []
    });
    onProgress("render", "Montando b-roll, audio y subtítulos");
    try {
      await composeReelWithBroll({ voice: fittedVoice, timeline, subtitles: srtFile, overlays: overlaysFile, output, duration, music: config.musicFile || null }, config);
      report = buildRunReport({ ...report, finalDurationSeconds: await durationOf(output, config) });
      assertMinimumDuration(report);
    } catch (error) {
      report = { ...report, errors: [...report.errors, error.message] };
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      throw error;
    }
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    return { demo: false, avatarMode: "local", plan, warnings, report, videoUrl: `/runs/${job.id}/reel.mp4` };
  }

  onProgress("avatar", "Generando avatar y voz con HeyGen");
  const avatarUrl = await createAvatarVideo(plan, config);
  const avatar = await download(avatarUrl, path.join(dir, "avatar.mp4"));
  onProgress("render", "Agregando cortes, música y subtítulos");
  const duration = await durationOf(avatar, config);
  const srtFile = path.join(dir, "subtitles.srt");
  await fs.writeFile(srtFile, makeSrt(plan.scenes, duration));
  const output = path.join(dir, "reel.mp4");
  const broll = plan.scenes.map(scene => scene.broll?.file).filter(Boolean);
  await compose({ avatar, broll, subtitles: srtFile, output, duration, music: config.musicFile || null }, config);
  return { demo: false, avatarMode: "heygen", plan, videoUrl: `/runs/${job.id}/reel.mp4` };
}

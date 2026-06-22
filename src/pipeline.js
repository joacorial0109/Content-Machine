import fs from "node:fs/promises";
import path from "node:path";
import { config, assertRealConfig } from "./config.js";
import { createPlan, createAvatarVideo, findBrollCandidates, download } from "./clients.js";
import { createTemplatePlan, parseManualPlan } from "./generation.js";
import { composeLocal, composeReelWithBroll, createLocalVoice, createSilentAudio, durationOf, fitAudioDuration, makeSceneOverlaySrt, makeSrt, TEXT_LAYOUT, validateTextLayout } from "./media.js";
import { applyBrollFallbacks, assertMinimumDuration, buildBrollQueries, buildCutTimeline, buildRunReport, minimumRequiredBroll, resolveVideoDuration, selectVisualMode } from "./quality.js";
import { normalizeVoiceMode, resolveVoiceFile } from "./voice.js";
import { avatarSafeAreaCheck, normalizeAvatarOptions, resolveLocalAvatarFile } from "./avatar.js";

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
  const usedUrls = new Set();
  const warnings = [];
  onProgress("broll", "Buscando material visual para cada escena");
  for (let index = 0; index < plan.scenes.length; index++) {
    const queries = buildBrollQueries(plan.scenes[index]);
    let lastError = null;
    let reusableCandidate = null;
    for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
      try {
        const candidates = await findBrollCandidates(queries[queryIndex], config);
        reusableCandidate ||= candidates[0] ? { url: candidates[0], queryIndex } : null;
        const url = candidates.find(candidate => !usedUrls.has(candidate));
        if (!url) continue;
        const file = path.join(dir, `broll-${index}.mp4`);
        await download(url, file);
        usedUrls.add(url);
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
    if (!resolved[index] && reusableCandidate) {
      try {
        const file = path.join(dir, `broll-${index}.mp4`);
        await download(reusableCandidate.url, file);
        resolved[index] = {
          file,
          fileName: path.basename(file),
          url: reusableCandidate.url,
          query: queries[reusableCandidate.queryIndex],
          queryFallback: true,
          repeatedSource: true
        };
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
  const generationMode = options.generationMode || config.generationMode;
  const voiceMode = normalizeVoiceMode(options.voiceMode || config.voiceMode);
  const avatarOptions = normalizeAvatarOptions({
    avatarMode: options.avatarMode || config.avatarMode,
    avatarUsage: options.avatarUsage || config.avatarUsage,
    localAvatarPosition: options.localAvatarPosition || config.localAvatarPosition,
    localAvatarSize: options.localAvatarSize || config.localAvatarSize
  });
  const runtimeConfig = {
    ...config, generationMode, voiceMode, avatarMode: avatarOptions.mode,
    avatarUsage: avatarOptions.usage, localAvatarFile: options.avatarFile || config.localAvatarFile,
    localAvatarPosition: avatarOptions.position, localAvatarSize: avatarOptions.size
  };

  onProgress("script", "Creando el guion y el plan visual");
  let plan;
  if (config.demo) plan = demoPlan(trigger);
  else {
    assertRealConfig(runtimeConfig);
    if (generationMode === "ai") plan = await createPlan(trigger, runtimeConfig, options);
    else if (generationMode === "manual") plan = parseManualPlan(options.manualPlan, options.duration || config.targetDuration, config.minDuration);
    else plan = createTemplatePlan(trigger, options.duration || config.targetDuration, config.minDuration);
  }
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));

  if (config.demo) {
    const textFile = path.join(dir, "narration.txt");
    const voice = path.join(dir, "voice.wav");
    await fs.writeFile(textFile, plan.narration, "utf8");
    await createLocalVoice(textFile, voice);
    const duration = await durationOf(voice, config);
    const srtFile = path.join(dir, "subtitles.srt");
    await fs.writeFile(srtFile, makeSrt(plan.scenes, duration));
    const output = path.join(dir, "reel.mp4");
    await composeLocal({ voice, subtitles: srtFile, output, duration }, config);
    return { demo: true, plan, videoUrl: `/runs/${job.id}/reel.mp4` };
  }

  const brollResult = await resolveSceneBroll(plan, dir, onProgress);
  plan.scenes = brollResult.scenes;
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));
  const reportFile = path.join(dir, "report.json");
  const targetDuration = Math.max(Number(options.duration) || config.targetDuration, config.minDuration);
  const warnings = [...brollResult.warnings];
  let visualMode;
  try {
    visualMode = selectVisualMode({
      demo: false, avatarMode: avatarOptions.mode,
      brollDownloadedCount: brollResult.downloadedCount,
      requiredBrollCount: minimumRequiredBroll(plan.scenes.length)
    });
  } catch (error) {
    const failedReport = buildRunReport({
      finalDurationSeconds: 0, requestedDurationSeconds: targetDuration,
      targetDurationSeconds: targetDuration, minDurationSeconds: config.minDuration,
      sceneCount: plan.scenes.length, brollDownloadedCount: brollResult.downloadedCount,
      brollUsedCount: 0, voiceMode, avatarMode: avatarOptions.mode, generationMode,
      visualMode: "none", usedFallback: true, warnings, errors: [error.message]
    });
    await fs.writeFile(reportFile, JSON.stringify(failedReport, null, 2));
    throw error;
  }

  const textFile = path.join(dir, "narration.txt");
  await fs.writeFile(textFile, plan.narration, "utf8");
  let voice = null;
  let voiceDuration = 0;
  let voiceFileUsed = null;
  let audioSourceType = voiceMode;
  let avatar = null;
  let avatarDurationSeconds = 0;
  let avatarWarning = null;

  if (avatarOptions.mode === "heygen") {
    onProgress("avatar", "Generando avatar y voz con HeyGen");
    const avatarUrl = await createAvatarVideo(plan, runtimeConfig);
    const avatarFile = await download(avatarUrl, path.join(dir, "avatar-heygen.mp4"));
    voice = avatarFile;
    voiceDuration = await durationOf(avatarFile, config);
    avatarDurationSeconds = voiceDuration;
    avatar = { file: avatarFile, type: "video", ...avatarOptions };
    audioSourceType = "heygen";
  } else {
    onProgress("avatar", voiceMode === "file" ? "Preparando archivo de voz" : "Generando voz de Windows");
    if (voiceMode === "file") {
      voice = await resolveVoiceFile(options.voiceFile || config.voiceFile);
      voiceDuration = await durationOf(voice, config);
      voiceFileUsed = options.voiceFileName || path.basename(voice);
    } else {
      voice = path.join(dir, "voice-local.wav");
      try {
        await createLocalVoice(textFile, voice);
        voiceDuration = await durationOf(voice, config);
      } catch {
        voice = null;
      }
    }
    if (avatarOptions.mode === "local" && avatarOptions.usage !== "none") {
      const localAvatar = await resolveLocalAvatarFile(options.avatarFile || config.localAvatarFile);
      avatar = { ...localAvatar, ...avatarOptions };
      avatarDurationSeconds = localAvatar.type === "video" ? await durationOf(localAvatar.file, config) : 0;
    }
  }

  if (!voice) {
    voice = path.join(dir, "voice-silent.wav");
    await createSilentAudio(voice, targetDuration, config);
    voiceDuration = targetDuration;
    audioSourceType = "silent-fallback";
    warnings.push("Se usó audio silencioso de respaldo");
  }
  let audioWarning = null;
  if (voiceMode === "file" && voiceDuration > targetDuration) {
    audioWarning = `El audio dura ${voiceDuration.toFixed(1)}s; se priorizó su duración real sobre el objetivo de ${targetDuration.toFixed(1)}s`;
    warnings.push(audioWarning);
  }
  const preferTarget = voiceMode === "windows" && ["manual", "template"].includes(generationMode);
  const duration = ["file", "heygen"].includes(voiceMode)
    ? voiceDuration
    : resolveVideoDuration(voiceDuration, targetDuration, config.minDuration, preferTarget);
  if (avatar?.type === "image") avatarDurationSeconds = duration;

  const fittedVoice = path.join(dir, "voice-fitted.wav");
  await fitAudioDuration(voice, fittedVoice, voiceDuration, duration, config);
  const srtFile = path.join(dir, "subtitles.srt");
  const overlaysFile = path.join(dir, "overlays.srt");
  await fs.writeFile(srtFile, makeSrt(plan.scenes, duration));
  await fs.writeFile(overlaysFile, makeSceneOverlaySrt(plan.scenes, duration));
  const visualStyle = options.visualStyle || "dynamic";
  const cutSeconds = { clean: 4, dynamic: 2.75, business: 3.5 }[visualStyle] || 3.25;
  const timeline = buildCutTimeline(plan.scenes, duration, cutSeconds);
  const output = path.join(dir, "reel.mp4");
  const clipsUsed = timeline.map(segment => ({
    file: path.basename(segment.file), sceneIndex: segment.sceneIndex,
    duration: segment.duration, repeated: segment.repeated, cropVariant: segment.cropVariant
  }));
  const avatarSafeAreaCheckPassed = !avatar || avatarSafeAreaCheck(avatar);
  const overlapCheckPassed = validateTextLayout() && avatarSafeAreaCheckPassed;
  if (!avatarSafeAreaCheckPassed) {
    avatarWarning = "El avatar no pudo ubicarse fuera de la zona de subtítulos";
    warnings.push(avatarWarning);
  }

  let report = buildRunReport({
    finalDurationSeconds: 0, requestedDurationSeconds: targetDuration,
    targetDurationSeconds: targetDuration, minDurationSeconds: config.minDuration,
    sceneCount: plan.scenes.length, brollDownloadedCount: brollResult.downloadedCount,
    brollUsedCount: new Set(timeline.map(segment => segment.file)).size,
    brollClipCount: new Set(timeline.map(segment => segment.file)).size,
    clipsUsed, voiceMode, voiceFileUsed, audioDurationSeconds: voiceDuration,
    audioSourceType, audioWarning, avatarMode: avatarOptions.mode,
    avatarFileUsed: avatar ? (options.avatarFileName || path.basename(avatar.file)) : null,
    avatarProvider: avatarOptions.mode === "heygen" ? "heygen" : avatarOptions.mode === "local" ? "local" : "none",
    avatarPosition: avatar ? avatarOptions.position : null,
    avatarDurationSeconds, avatarWarning, avatarSafeAreaCheckPassed,
    subtitlePosition: TEXT_LAYOUT.subtitle.zone, overlayPosition: TEXT_LAYOUT.overlay.zone,
    overlapCheckPassed, generationMode,
    visualMode: avatar ? `${visualMode}+${avatarOptions.mode}-avatar` : visualMode,
    usedFallback: brollResult.fallbackUsed, warnings, errors: []
  });

  onProgress("render", "Montando b-roll, audio, avatar y subtítulos");
  try {
    await composeReelWithBroll({
      voice: fittedVoice, timeline, subtitles: srtFile, overlays: overlaysFile,
      output, duration, music: config.musicFile || null, avatar, visualStyle
    }, config);
    report = buildRunReport({ ...report, finalDurationSeconds: await durationOf(output, config) });
    assertMinimumDuration(report);
  } catch (error) {
    report = { ...report, errors: [...report.errors, error.message] };
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    throw error;
  }
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  return {
    demo: false, avatarMode: avatarOptions.mode, generationMode, voiceMode,
    plan, warnings: report.warnings, report, videoUrl: `/runs/${job.id}/reel.mp4`
  };
}

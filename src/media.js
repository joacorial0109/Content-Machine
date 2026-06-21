import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export function secondsToSrt(value) {
  const ms = Math.max(0, Math.round(value * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
}

export function makeSrt(scenes, duration) {
  const chunks = scenes.flatMap(scene => {
    const words = scene.line.trim().split(/\s+/);
    const parts = [];
    for (let i = 0; i < words.length; i += 6) parts.push({ line: words.slice(i, i + 6).join(" ") });
    return parts;
  });
  const weights = chunks.map(s => Math.max(1, s.line.split(/\s+/).length));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return chunks.map((scene, i) => {
    const end = i === chunks.length - 1 ? duration : cursor + duration * weights[i] / total;
    const block = `${i + 1}\n${secondsToSrt(cursor)} --> ${secondsToSrt(end)}\n${scene.line}\n`;
    cursor = end;
    return block;
  }).join("\n");
}

export function run(binary, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout || stderr) : reject(new Error(stderr.slice(-2000))));
  });
}

export async function durationOf(file, cfg) {
  const output = await run(cfg.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], path.dirname(file));
  const match = output.match(/[0-9]+(?:\.[0-9]+)?/);
  if (!match) throw new Error("No se pudo medir el video");
  return Number(match[0]);
}

function ffmpegPath(file) {
  return file.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export async function createLocalVoice(textFile, outputFile) {
  const safeText = textFile.replace(/'/g, "''");
  const safeOutput = outputFile.replace(/'/g, "''");
  const command = `Add-Type -AssemblyName System.Speech; $v=New-Object System.Speech.Synthesis.SpeechSynthesizer; $es=$v.GetInstalledVoices() | Where-Object {$_.VoiceInfo.Culture.Name -like 'es-*'} | Select-Object -First 1; if($es){$v.SelectVoice($es.VoiceInfo.Name)}; $v.Rate=0; $v.Volume=100; $v.SetOutputToWaveFile('${safeOutput}'); $v.Speak([IO.File]::ReadAllText('${safeText}')); $v.Dispose()`;
  await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], path.dirname(outputFile));
}

export async function composeLocal({ voice, subtitles, output, duration }, cfg) {
  const srt = ffmpegPath(subtitles);
  const font = ffmpegPath("C:\\Windows\\Fonts\\arialbd.ttf");
  const filter = [
    "[0:v]drawbox=x=70:y=70:w=940:h=1780:color=0xf4f0e7:t=fill,drawbox=x=70:y=70:w=14:h=1780:color=0xff5a36:t=fill[card]",
    `[card]drawtext=fontfile='${font}':text='CONTENT MACHINE':x=125:y=145:fontsize=34:fontcolor=0x171714[branded]`,
    "[1:a]highpass=f=80,lowpass=f=10000,acompressor=threshold=-18dB:ratio=3:attack=20:release=250,loudnorm=I=-16:LRA=7:TP=-1.5,aresample=48000,asplit=2[audio][waveaudio]",
    "[waveaudio]showwaves=s=820x130:mode=line:colors=0xff5a36:scale=sqrt[wave]",
    "[branded][wave]overlay=130:1480[visual]",
    `[visual]subtitles='${srt}':force_style='FontName=Arial,FontSize=12,Bold=1,PrimaryColour=&H00171714,OutlineColour=&H00F4F0E7,BorderStyle=1,Outline=3,Alignment=2,MarginL=25,MarginR=25,MarginV=105'[video]`
  ].join(";");
  await run(cfg.ffmpeg, [
    "-y", "-f", "lavfi", "-i", `color=c=0x171714:s=1080x1920:r=30:d=${duration}`,
    "-i", voice, "-filter_complex", filter, "-map", "[video]", "-map", "[audio]",
    "-t", String(duration), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output
  ], path.dirname(output));
}

export async function compose({ avatar, broll, subtitles, output, duration, music }, cfg) {
  const inputs = ["-i", avatar];
  for (const file of broll) inputs.push("-stream_loop", "-1", "-i", file);
  if (music) inputs.push("-stream_loop", "-1", "-i", music);

  const slice = duration / Math.max(1, broll.length);
  const filters = ["[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[base]"];
  let current = "base";
  broll.forEach((_, index) => {
    const start = index * slice;
    const end = Math.min(duration, start + Math.min(3.5, slice));
    filters.push(`[${index + 1}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setpts=PTS-STARTPTS[b${index}]`);
    const next = `v${index}`;
    filters.push(`[${current}][b${index}]overlay=0:0:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'[${next}]`);
    current = next;
  });
  const escapedSrt = ffmpegPath(subtitles);
  filters.push(`[${current}]subtitles='${escapedSrt}':force_style='FontName=Arial,FontSize=18,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Alignment=2,MarginV=180'[video]`);

  const args = ["-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "[video]", "-map", "0:a"];
  if (music) {
    const musicIndex = broll.length + 1;
    filters.push(`[0:a]volume=1[voice];[${musicIndex}:a]volume=0.10[music];[voice][music]amix=inputs=2:duration=first[audio]`);
    args.splice(args.indexOf("-filter_complex") + 1, 1, filters.join(";"));
    args.splice(args.indexOf("-map", args.indexOf("-map") + 1), 2, "-map", "[audio]");
  }
  args.push("-t", String(duration), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output);
  await run(cfg.ffmpeg, args, path.dirname(output));
}

const form = document.querySelector("#form");
const trigger = document.querySelector("#trigger");
const result = document.querySelector("#result");
const button = form.querySelector("button");
const settingsButton = document.querySelector("#settingsButton");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsForm = document.querySelector("#settingsForm");
const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

let currentVoiceMode = "windows";
let currentAvatarMode = "none";

function updateManualVisibility(mode) {
  const manual = mode === "manual";
  document.querySelector("#manualPlanSection").hidden = !manual;
  document.querySelector("#manualPlan").required = manual;
  trigger.required = !manual;
}

function updateVoiceVisibility(mode) {
  currentVoiceMode = mode;
  document.querySelector("#voiceFileSection").hidden = mode !== "file";
  document.querySelector("#voiceHelp").textContent = mode === "windows"
    ? "Voz Windows: rápida y gratis, pero puede sonar robótica. Depende de las voces instaladas en tu PC."
    : mode === "file"
      ? "Archivo de audio: recomendado para una voz natural. Subí MP3/WAV/M4A o pegá la ruta."
      : "HeyGen: opción pro para avatar y voz más realista.";
}

function updateAvatarVisibility(mode) {
  currentAvatarMode = mode;
  document.querySelector("#avatarFileSection").hidden = mode !== "local";
  document.querySelector("#avatarHelp").textContent = mode === "none"
    ? "Sin avatar: solo b-roll."
    : mode === "local"
      ? "Avatar local: imagen o video propio sobre el reel."
      : "HeyGen: avatar generado por un servicio externo que puede tener costo.";
}

function selectedDuration() {
  const selected = document.querySelector("#duration").value;
  return selected === "custom" ? Number(document.querySelector("#customDuration").value) : Number(selected);
}

function renderSettings(settings) {
  settingsButton.textContent = settings.readyForPro && !settings.demo ? "PRO ACTIVO" : "CONFIGURACIÓN";
  document.querySelector("#openaiModel").value = settings.openaiModel || "gpt-4.1-mini";
  document.querySelector("#generationMode").value = settings.generationMode || "manual";
  document.querySelector("#avatarMode").value = settings.avatarMode || "none";
  document.querySelector("#voiceMode").value = settings.voiceMode || "windows";
  document.querySelector("#voiceFile").value = settings.voiceFile || "";
  document.querySelector("#localAvatarFile").value = settings.localAvatarFile || "";
  document.querySelector("#settingsAvatarUsage").value = settings.avatarUsage || "strategic";
  document.querySelector("#voiceFilePath").value = settings.voiceFile || "";
  document.querySelector("#avatarFilePath").value = settings.localAvatarFile || "";
  document.querySelector("#avatarId").value = settings.avatarId || "";
  document.querySelector("#voiceId").value = settings.voiceId || "";
  document.querySelector("#musicFile").value = settings.musicFile || "";
  document.querySelector("#demoMode").checked = settings.demo;

  const generation = settings.generationMode || "manual";
  const avatar = settings.avatarMode || "none";
  const voice = settings.voiceMode || "windows";
  document.querySelector("#videoGenerationMode").value = generation;
  document.querySelector("#videoAvatarMode").value = avatar;
  document.querySelector("#videoVoiceMode").value = voice;
  document.querySelector("#avatarUsage").value = settings.avatarUsage || "strategic";
  document.querySelector("#localAvatarPosition").value = settings.localAvatarPosition || "bottom-right";
  document.querySelector("#localAvatarSize").value = settings.localAvatarSize || "medium";
  document.querySelector('#videoGenerationMode option[value="ai"]').disabled = !settings.hasOpenaiKey;
  updateManualVisibility(generation);
  updateAvatarVisibility(avatar);
  updateVoiceVisibility(voice);

  const state = document.querySelector("#settingsState");
  state.className = `settings-state ${settings.readyForPro ? "ready" : ""}`;
  state.textContent = settings.readyForPro
    ? `Configuración completa: generación ${generation}, avatar ${avatar}, voz ${voice}.`
    : generation === "ai"
      ? "El modo AI requiere OpenAI y Pexels."
      : "Manual y template requieren Pexels. Avatar y HeyGen son opcionales.";
}

fetch("/api/settings").then(r => r.json()).then(renderSettings);
settingsButton.addEventListener("click", () => settingsDialog.showModal());
document.querySelector("#closeSettings").addEventListener("click", () => settingsDialog.close());
document.querySelector("#videoGenerationMode").addEventListener("change", event => updateManualVisibility(event.target.value));
document.querySelector("#videoVoiceMode").addEventListener("change", event => {
  if (event.target.value === "heygen") {
    document.querySelector("#videoAvatarMode").value = "heygen";
    updateAvatarVisibility("heygen");
  }
  updateVoiceVisibility(event.target.value);
});
document.querySelector("#videoAvatarMode").addEventListener("change", event => {
  if (event.target.value === "heygen") {
    document.querySelector("#videoVoiceMode").value = "heygen";
    updateVoiceVisibility("heygen");
  } else if (currentVoiceMode === "heygen") {
    document.querySelector("#videoVoiceMode").value = "windows";
    updateVoiceVisibility("windows");
  }
  updateAvatarVisibility(event.target.value);
});
document.querySelector("#duration").addEventListener("change", event => {
  document.querySelector("#customDuration").hidden = event.target.value !== "custom";
});

settingsForm.addEventListener("submit", async event => {
  event.preventDefault();
  const payload = {
    avatarMode: document.querySelector("#avatarMode").value,
    avatarUsage: document.querySelector("#settingsAvatarUsage").value,
    localAvatarFile: document.querySelector("#localAvatarFile").value,
    generationMode: document.querySelector("#generationMode").value,
    voiceMode: document.querySelector("#voiceMode").value,
    voiceFile: document.querySelector("#voiceFile").value,
    openaiKey: document.querySelector("#openaiKey").value,
    openaiModel: document.querySelector("#openaiModel").value,
    heygenKey: document.querySelector("#heygenKey").value,
    avatarId: document.querySelector("#avatarId").value,
    voiceId: document.querySelector("#voiceId").value,
    pexelsKey: document.querySelector("#pexelsKey").value,
    musicFile: document.querySelector("#musicFile").value,
    demo: document.querySelector("#demoMode").checked
  };
  const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const settings = await response.json();
  renderSettings(settings);
  if (!payload.demo && settings.demo) {
    document.querySelector("#settingsState").textContent = "No se pudo activar el modo real: revisá Pexels y las credenciales del modo elegido.";
    return;
  }
  settingsDialog.close();
});

function showProgress(message) {
  result.innerHTML = `<div class="progress"><h2>Creando tu reel</h2><div class="bar"><i></i></div><p class="status">${escapeHtml(message)}</p></div>`;
}

function showComplete(data) {
  const plan = data.plan;
  const sources = (plan.sources || []).filter(s => /^https?:\/\//.test(s.url)).map(s => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a></li>`).join("");
  const warnings = (data.warnings || []).map(message => `<li>${escapeHtml(message)}</li>`).join("");
  const modeNote = data.demo ? "Demo local sin APIs externas."
    : `Generación ${data.generationMode}; voz ${data.voiceMode}; avatar ${data.avatarMode}.`;
  result.innerHTML = `<div class="complete"><h2>Reel listo.</h2>${warnings ? `<div class="warning"><strong>Revisá el resultado:</strong><ul>${warnings}</ul></div>` : ""}${data.videoUrl ? `<video controls src="${data.videoUrl}"></video><p><a href="${data.videoUrl}" download="reel.mp4">DESCARGAR MP4</a></p>` : ""}<h4>HOOK</h4><p>${escapeHtml(plan.hook)}</p><h4>GUION</h4><p>${escapeHtml(plan.narration)}</p><h4>CAPTION</h4><p>${escapeHtml(plan.caption)}</p>${sources ? `<h4>FUENTES</h4><ul class="sources">${sources}</ul>` : ""}<p><small>${modeNote}</small></p></div>`;
}

async function uploadSelected(inputId, endpoint, progressMessage) {
  const file = document.querySelector(inputId).files[0];
  if (!file) return null;
  showProgress(progressMessage);
  const response = await fetch(endpoint, {
    method: "POST", headers: { "X-File-Name": encodeURIComponent(file.name) }, body: file
  });
  const uploaded = await response.json();
  if (!response.ok) throw new Error(uploaded.error);
  return uploaded;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  button.disabled = true;
  showProgress("Preparando el plan y el material visual…");
  try {
    let voiceFile = document.querySelector("#voiceFilePath").value.trim();
    let voiceFileName = voiceFile ? voiceFile.split(/[\\/]/).pop() : "";
    if (currentVoiceMode === "file") {
      const uploaded = await uploadSelected("#voiceUpload", "/api/uploads/audio", "Cargando el archivo de voz…");
      if (uploaded) { voiceFile = uploaded.path; voiceFileName = uploaded.name; }
    }

    let avatarFile = document.querySelector("#avatarFilePath").value.trim();
    let avatarFileName = avatarFile ? avatarFile.split(/[\\/]/).pop() : "";
    if (currentAvatarMode === "local") {
      const uploaded = await uploadSelected("#avatarUpload", "/api/uploads/avatar", "Cargando el avatar local…");
      if (uploaded) { avatarFile = uploaded.path; avatarFileName = uploaded.name; }
    }

    const payload = {
      trigger: trigger.value,
      platform: document.querySelector("#platform").value,
      tone: document.querySelector("#tone").value,
      duration: selectedDuration(),
      manualPlan: document.querySelector("#manualPlan").value,
      generationMode: document.querySelector("#videoGenerationMode").value,
      voiceMode: document.querySelector("#videoVoiceMode").value,
      avatarMode: document.querySelector("#videoAvatarMode").value,
      avatarUsage: document.querySelector("#avatarUsage").value,
      visualStyle: document.querySelector("#visualStyle").value,
      localAvatarPosition: document.querySelector("#localAvatarPosition").value,
      localAvatarSize: document.querySelector("#localAvatarSize").value,
      voiceFile, voiceFileName, avatarFile, avatarFileName
    };
    const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error);
    const timer = setInterval(async () => {
      try {
        const current = await fetch(`/api/jobs/${job.id}`).then(r => r.json());
        if (current.status === "running") showProgress(current.message);
        if (current.status === "completed") { clearInterval(timer); button.disabled = false; showComplete(current.result); }
        if (current.status === "failed") { clearInterval(timer); button.disabled = false; result.innerHTML = `<div class="error"><h2>No se pudo generar</h2><p>${escapeHtml(current.message)}</p></div>`; }
      } catch (error) {
        clearInterval(timer); button.disabled = false;
        result.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
      }
    }, 1200);
  } catch (error) {
    button.disabled = false;
    result.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
});

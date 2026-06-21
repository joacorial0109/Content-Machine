const form = document.querySelector("#form");
const trigger = document.querySelector("#trigger");
const result = document.querySelector("#result");
const button = form.querySelector("button");
const settingsButton = document.querySelector("#settingsButton");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsForm = document.querySelector("#settingsForm");
const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function renderSettings(settings) {
  settingsButton.textContent = settings.readyForPro && !settings.demo ? "PRO ACTIVO" : "CONFIGURACIÓN";
  document.querySelector("#openaiModel").value = settings.openaiModel || "gpt-4.1-mini";
  document.querySelector("#avatarMode").value = settings.avatarMode || "local";
  document.querySelector("#avatarId").value = settings.avatarId || "";
  document.querySelector("#voiceId").value = settings.voiceId || "";
  document.querySelector("#musicFile").value = settings.musicFile || "";
  document.querySelector("#demoMode").checked = settings.demo;
  const state = document.querySelector("#settingsState");
  state.className = `settings-state ${settings.readyForPro ? "ready" : ""}`;
  state.textContent = settings.readyForPro
    ? `Configuración completa para modo ${settings.avatarMode}.`
    : settings.avatarMode === "local"
      ? "El modo local real requiere OpenAI y Pexels."
      : "El modo HeyGen requiere OpenAI, Pexels, API Key, Avatar ID y Voice ID.";
}

fetch("/api/settings").then(r => r.json()).then(renderSettings);
settingsButton.addEventListener("click", () => settingsDialog.showModal());
document.querySelector("#closeSettings").addEventListener("click", () => settingsDialog.close());

settingsForm.addEventListener("submit", async event => {
  event.preventDefault();
  const payload = {
    avatarMode: document.querySelector("#avatarMode").value,
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
    document.querySelector("#settingsState").textContent = payload.avatarMode === "local"
      ? "No se puede activar el modo real local: completá OpenAI y Pexels."
      : "No se puede activar HeyGen: completá OpenAI, Pexels y las tres variables de HeyGen.";
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
  const modeNote = data.demo
    ? "Demo local sin APIs externas."
    : data.avatarMode === "local"
      ? "Modo real local: guion de OpenAI, b-roll de Pexels y voz local o OpenAI TTS."
      : "Modo HeyGen con avatar completo.";
  result.innerHTML = `<div class="complete"><h2>Reel listo.</h2>${warnings ? `<div class="warning"><strong>Revisá el resultado:</strong><ul>${warnings}</ul></div>` : ""}${data.videoUrl ? `<video controls src="${data.videoUrl}"></video><p><a href="${data.videoUrl}" download="reel.mp4">DESCARGAR MP4</a></p>` : ""}<h4>HOOK</h4><p>${escapeHtml(plan.hook)}</p><h4>GUION</h4><p>${escapeHtml(plan.narration)}</p><h4>CAPTION</h4><p>${escapeHtml(plan.caption)}</p>${sources ? `<h4>FUENTES</h4><ul class="sources">${sources}</ul>` : ""}<p><small>${modeNote}</small></p></div>`;
}

form.addEventListener("submit", async event => {
  event.preventDefault(); button.disabled = true; showProgress("Investigando y preparando…");
  try {
    const payload = {
      trigger: trigger.value,
      platform: document.querySelector("#platform").value,
      tone: document.querySelector("#tone").value,
      duration: Number(document.querySelector("#duration").value)
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
      } catch (error) { clearInterval(timer); button.disabled = false; result.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
    }, 1200);
  } catch (error) { button.disabled = false; result.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
});

const form = document.querySelector("#form");
const trigger = document.querySelector("#trigger");
const result = document.querySelector("#result");
const button = form.querySelector("button");

fetch("/api/status").then(r => r.json()).then(s => {
  document.querySelector("#mode").textContent = s.demo ? "MODO DEMO" : "MODO REAL";
});

const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function showProgress(message) {
  result.innerHTML = `<div class="progress"><h2>Creando tu reel</h2><div class="bar"><i></i></div><p class="status">${escapeHtml(message)}</p></div>`;
}

function showComplete(data) {
  const plan = data.plan;
  result.innerHTML = `<div class="complete"><h2>Reel listo.</h2>${data.videoUrl ? `<video controls src="${data.videoUrl}"></video>` : ""}<h4>HOOK</h4><p>${escapeHtml(plan.hook)}</p><h4>GUION</h4><p>${escapeHtml(plan.narration)}</p><h4>CAPTION</h4><p>${escapeHtml(plan.caption)}</p>${data.demo ? "<p><small>Activá el modo real para producir el MP4.</small></p>" : ""}</div>`;
}

form.addEventListener("submit", async event => {
  event.preventDefault(); button.disabled = true; showProgress("Preparando…");
  try {
    const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trigger: trigger.value }) });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error);
    const timer = setInterval(async () => {
      try {
        const current = await fetch(`/api/jobs/${job.id}`).then(r => r.json());
        if (current.status === "running") showProgress(current.message);
        if (current.status === "completed") { clearInterval(timer); button.disabled = false; showComplete(current.result); }
        if (current.status === "failed") { clearInterval(timer); button.disabled = false; result.innerHTML = `<div class="error"><h2>No se pudo generar</h2><p>${escapeHtml(current.message)}</p></div>`; }
      } catch (error) { clearInterval(timer); button.disabled = false; result.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
    }, 900);
  } catch (error) { button.disabled = false; result.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
});

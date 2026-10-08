const page = document.body.dataset.page

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Request failed")
  return data
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" })
  location.href = "/login"
}

document.getElementById("logout")?.addEventListener("click", logout)

function nextPath() {
  const next = new URLSearchParams(location.search).get("next")
  if (next && next.startsWith("/") && !next.startsWith("//")) return next
  return ""
}

if (page === "login") {
  const error = document.getElementById("form-error")
  const google = document.getElementById("google")
  const note = document.getElementById("google-note")
  const dev = document.getElementById("dev")
  api("/api/system").then((system) => {
    if (!system.googleAuth) {
      google.setAttribute("aria-disabled", "true")
      google.addEventListener("click", (event) => event.preventDefault())
      note.hidden = false
      note.textContent = "Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. The button matches the client hub’s /api/auth/google path."
    }
    dev.hidden = !system.devLogin
  })
  if (new URLSearchParams(location.search).get("error") === "google") {
    error.textContent = "Google sign-in did not finish. Try again, or use email."
  }
  document.getElementById("email-form").addEventListener("submit", async (event) => {
    event.preventDefault()
    error.textContent = ""
    const body = Object.fromEntries(new FormData(event.target))
    try {
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(body) })
      location.href = nextPath() || (data.user.role === "admin" ? "/admin" : "/portal")
    } catch (err) {
      error.textContent = err.message
    }
  })
  document.getElementById("register").addEventListener("click", async () => {
    error.textContent = ""
    const body = Object.fromEntries(new FormData(document.getElementById("email-form")))
    try {
      const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify(body) })
      location.href = nextPath() || (data.user.role === "admin" ? "/admin" : "/portal")
    } catch (err) {
      error.textContent = err.message
    }
  })
  document.getElementById("dev-client").addEventListener("click", () => devSign("client"))
  document.getElementById("dev-admin").addEventListener("click", () => devSign("admin"))
  async function devSign(role) {
    const data = await api("/api/auth/dev", { method: "POST", body: JSON.stringify({ role }) })
    location.href = role === "admin" ? "/admin" : nextPath() || "/portal"
    void data
  }
}

function filmCard(request) {
  const job = request.job
  const status = job?.status || request.status
  const mock = job?.mock ? " mock" : ""
  const video = job?.videoUrl ? `<video controls src="${job.videoUrl}" style="width:100%;border-radius:12px;margin-top:0.4rem"></video>` : ""
  const note = job?.note ? `<p class="muted">${job.note}</p>` : ""
  return `<article class="film" style="grid-template-columns: 1fr">
    <div>
      <span class="status${mock}">${status}${job?.mock ? " · mock" : ""}</span>
      <p>${escapeHtml(request.brief)}</p>
      ${note}
      ${video}
    </div>
  </article>`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char])
}

if (page === "portal") {
  const credits = document.getElementById("credits")
  const assetsEl = document.getElementById("assets")
  const films = document.getElementById("films")
  async function refresh() {
    const me = await api("/api/me")
    if (!me.user) return location.replace("/login?next=/portal")
    if (me.user.role === "admin") document.getElementById("admin-link").hidden = false
    document.getElementById("hello").textContent = me.user.name
    credits.textContent = String(me.user.credits)
    document.getElementById("allowance-note").textContent = me.user.allowanceNote
    const assets = await api("/api/assets")
    const mine = assets.assets.filter((asset) => asset.userId === me.user.id)
    assetsEl.innerHTML = mine
      .map(
        (asset) => `<article class="asset"><img src="${asset.url}" alt="" /><div><strong>${asset.kind}</strong><p class="muted">${escapeHtml(asset.originalName)}</p></div></article>`,
      )
      .join("") || `<p class="muted">No files yet.</p>`
    const requests = await api("/api/requests")
    films.innerHTML = requests.requests.map(filmCard).join("") || `<p class="muted">No requests yet.</p>`
  }
  document.getElementById("upload-form").addEventListener("submit", async (event) => {
    event.preventDefault()
    const error = document.getElementById("upload-error")
    error.textContent = ""
    try {
      await api("/api/assets", { method: "POST", body: new FormData(event.target) })
      event.target.reset()
      await refresh()
    } catch (err) {
      error.textContent = err.message
    }
  })
  document.getElementById("request-form").addEventListener("submit", async (event) => {
    event.preventDefault()
    const error = document.getElementById("request-error")
    error.textContent = ""
    const brief = new FormData(event.target).get("brief")
    try {
      await api("/api/requests", { method: "POST", body: JSON.stringify({ brief, source: "desk" }) })
      event.target.reset()
      await refresh()
    } catch (err) {
      error.textContent = err.message
    }
  })
  refresh()
  setInterval(refresh, 4000)
}

if (page === "agent") {
  const chat = document.getElementById("chat")
  const error = document.getElementById("agent-error")
  function draw(thread, meta) {
    const note = document.getElementById("tier-note")
    if (meta && !meta.premium) {
      note.textContent = "Preview of the premium tier. Your account is on early access until an admin marks it Cozy Agent. The assistant still runs, and it is labeled as a preview."
    }
    chat.innerHTML = (thread?.messages || [])
      .map((message) => `<div class="bubble ${message.role === "user" ? "user" : "agent"}">${escapeHtml(message.content)}</div>`)
      .join("")
    chat.scrollTop = chat.scrollHeight
  }
  async function load() {
    const data = await api("/api/agent")
    draw(data.thread, data)
  }
  async function send(text, reset = false) {
    error.textContent = ""
    try {
      const data = await api("/api/agent/message", { method: "POST", body: JSON.stringify({ text, reset }) })
      draw(data.thread, data)
    } catch (err) {
      error.textContent = err.message
    }
  }
  document.getElementById("agent-form").addEventListener("submit", async (event) => {
    event.preventDefault()
    const input = event.target.elements.text
    const text = input.value
    input.value = ""
    await send(text)
  })
  document.querySelectorAll("[data-chip]").forEach((button) => {
    button.addEventListener("click", () => send(button.dataset.chip))
  })
  document.getElementById("reset").addEventListener("click", () => send("reset", true))
  load()
}

if (page === "admin") {
  const clients = document.getElementById("clients")
  const requests = document.getElementById("requests")
  const banner = document.getElementById("mode-banner")
  async function refresh() {
    const data = await api("/api/admin/overview")
    banner.textContent =
      data.higgsfield === "mock"
        ? "Higgsfield mock mode. HIGGSFIELD_API_KEY is not set. Generate still runs, and every result is marked mock. Nothing is sent to Higgsfield."
        : "Higgsfield live mode. Generations use the server key and Seedance 2.5 text-to-video or image-to-video."
    clients.innerHTML = `<table><thead><tr><th>Client</th><th>Tier</th><th>Credits</th><th></th></tr></thead><tbody>${data.clients
      .map(
        (client) => `<tr>
          <td>${escapeHtml(client.name)}<br /><span class="muted">${escapeHtml(client.email)}</span></td>
          <td>
            <select data-tier="${client.id}">
              <option value="early-access" ${client.tier === "early-access" ? "selected" : ""}>Early access</option>
              <option value="cozy-agent" ${client.tier === "cozy-agent" ? "selected" : ""}>Cozy Agent</option>
            </select>
          </td>
          <td><input data-credits="${client.id}" type="number" min="0" max="10000" value="${client.credits}" /></td>
          <td><button type="button" data-save="${client.id}">Save</button></td>
        </tr>`,
      )
      .join("")}</tbody></table>`
    requests.innerHTML = data.requests
      .map((request) => {
        const assets = data.assets.filter((asset) => asset.userId === request.userId)
        const options = assets
          .map((asset) => `<option value="${asset.id}">${escapeHtml(asset.originalName)}</option>`)
          .join("")
        const thumbs = assets
          .map((asset) => `<a href="${asset.url}"><img class="thumb" src="${asset.url}" alt="${escapeHtml(asset.originalName)}" /></a>`)
          .join(" ")
        return `<article class="card" style="margin-bottom:0.7rem">
          <span class="status${request.job?.mock ? " mock" : ""}">${escapeHtml(request.job?.status || request.status)}${request.job?.mock ? " · mock" : ""}</span>
          <p><strong>${escapeHtml(request.client?.name || "Client")}</strong> · ${escapeHtml(request.source)}</p>
          <p>${escapeHtml(request.brief)}</p>
          <div class="row">${thumbs || `<span class="muted">No uploads</span>`}</div>
          ${request.job?.note ? `<p class="muted">${escapeHtml(request.job.note)}</p>` : ""}
          ${request.job?.videoUrl ? `<video controls src="${request.job.videoUrl}" style="width:100%;border-radius:12px"></video>` : ""}
          <div class="row">
            <button type="button" data-gen="${request.id}" data-kind="text">Generate from brief</button>
            <select data-asset-for="${request.id}">${options || `<option value="">No image</option>`}</select>
            <button type="button" data-gen="${request.id}" data-kind="image">Generate from image</button>
            <button type="button" data-refresh="${request.id}">Refresh status</button>
          </div>
        </article>`
      })
      .join("") || `<p class="muted">No requests yet.</p>`
    clients.querySelectorAll("[data-save]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.save
        const creditsValue = Number(clients.querySelector(`[data-credits="${id}"]`).value)
        const tier = clients.querySelector(`[data-tier="${id}"]`).value
        await api(`/api/admin/clients/${id}/credits`, { method: "POST", body: JSON.stringify({ credits: creditsValue }) })
        await api(`/api/admin/clients/${id}/tier`, { method: "POST", body: JSON.stringify({ tier }) })
        await refresh()
      })
    })
    requests.querySelectorAll("[data-gen]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.gen
        const kind = button.dataset.kind
        const assetId = requests.querySelector(`[data-asset-for="${id}"]`)?.value
        await api(`/api/admin/requests/${id}/generate`, { method: "POST", body: JSON.stringify({ kind, assetId }) })
        await refresh()
      })
    })
    requests.querySelectorAll("[data-refresh]").forEach((button) => {
      button.addEventListener("click", async () => {
        await api(`/api/admin/requests/${button.dataset.refresh}/refresh`, { method: "POST" })
        await refresh()
      })
    })
  }
  refresh().catch((error) => {
    banner.textContent = error.message
  })
}

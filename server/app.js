import { Hono } from "hono"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, extname, basename } from "node:path"
import { publicPricing, earlyAccessPreview } from "../config/pricing.js"
import {
  createUser,
  devLoginAllowed,
  findUserByEmail,
  googleConfigured,
  oauthStartCookie,
  publicUser,
  readOauthCookie,
  requireAdmin,
  requireUser,
  safeNext,
  sessionCookie,
  userFromRequest,
  verifyPassword,
  expireCookie,
} from "./auth.js"
import { agentReply, blankThread, publicThread } from "./agent.js"
import { billingStatus, checkoutSeam } from "./billing.js"
import {
  clientJob,
  fetchStatus,
  higgsfieldMode,
  submitImageToVideo,
  submitTextToVideo,
  uploadImage,
} from "./higgsfield.js"
import { dataDir, id, read, update } from "./store.js"

const BOOKING = process.env.BOOKING_URL || "https://www.cozydigital.org/cozy-booking/"
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

export const app = new Hono()

app.onError((error, c) => {
  const status = error.status || 500
  if (status >= 500) console.error(error)
  return c.json({ error: error.message || "Something went wrong." }, status)
})

function origin(c) {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/, "")
  const url = new URL(c.req.url)
  return `${url.protocol}//${url.host}`
}

async function sendFile(c, path, type) {
  const bytes = await readFile(path)
  return c.body(bytes, 200, {
    "Content-Type": type || "text/html; charset=utf-8",
    "Cache-Control": type && (type.includes("javascript") || type.includes("css") || type.includes("html")) ? "no-cache" : "public, max-age=86400",
  })
}

async function page(c, name) {
  return sendFile(c, join(process.cwd(), "site", name), "text/html; charset=utf-8")
}

app.get("/api/health", (c) => c.json({ ok: true }))

app.get("/api/system", (c) =>
  c.json({
    higgsfield: higgsfieldMode(),
    googleAuth: googleConfigured(),
    devLogin: devLoginAllowed(),
    billing: billingStatus(),
    bookingUrl: BOOKING,
    previewCredits: earlyAccessPreview.credits,
  }),
)

app.get("/api/pricing", (c) => c.json(publicPricing()))

app.post("/api/billing/checkout", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  return c.json(checkoutSeam(body.planId), 501)
})

app.get("/api/auth/google", (c) => {
  if (!googleConfigured()) {
    return c.json(
      { error: "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      501,
    )
  }
  const { state, challenge, header } = oauthStartCookie()
  const redirect = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  redirect.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID)
  redirect.searchParams.set("redirect_uri", `${origin(c)}/api/auth/google/callback`)
  redirect.searchParams.set("response_type", "code")
  redirect.searchParams.set("scope", "openid email profile")
  redirect.searchParams.set("state", state)
  redirect.searchParams.set("code_challenge", challenge)
  redirect.searchParams.set("code_challenge_method", "S256")
  redirect.searchParams.set("prompt", "select_account")
  c.header("Set-Cookie", header)
  return c.redirect(redirect.toString())
})

app.get("/api/auth/google/callback", async (c) => {
  const code = c.req.query("code")
  const state = c.req.query("state")
  const pending = readOauthCookie(c.req.header("cookie"))
  if (!code || !pending || pending.state !== state) {
    return c.redirect("/login?error=google")
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin(c)}/api/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: pending.verifier,
    }),
  })
  const token = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok) return c.redirect("/login?error=google")
  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  const profile = await profileRes.json().catch(() => ({}))
  if (!profile.email) return c.redirect("/login?error=google")
  const user = await createUser({
    email: profile.email,
    name: profile.name || "",
    googleSub: profile.sub,
  })
  c.header("Set-Cookie", sessionCookie(user.id), { append: true })
  c.header("Set-Cookie", expireCookie("cozy_oauth"), { append: true })
  const next = user.role === "admin" ? "/admin" : "/portal"
  return c.redirect(next)
})

app.post("/api/auth/register", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const email = String(body.email || "")
  const password = String(body.password || "")
  const name = String(body.name || "").slice(0, 80)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "Enter a valid email." }, 400)
  }
  if (password.length < 8) return c.json({ error: "Use at least 8 characters." }, 400)
  const existing = await findUserByEmail(email)
  if (existing?.passwordHash) return c.json({ error: "That email already has a password." }, 409)
  const user = await createUser({ email, name, password })
  c.header("Set-Cookie", sessionCookie(user.id))
  return c.json({ user: publicUser(user) })
})

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const user = await findUserByEmail(String(body.email || ""))
  if (!user?.passwordHash || !verifyPassword(String(body.password || ""), user.passwordHash)) {
    return c.json({ error: "Email or password is wrong." }, 401)
  }
  c.header("Set-Cookie", sessionCookie(user.id))
  return c.json({ user: publicUser(user) })
})

app.post("/api/auth/dev", async (c) => {
  if (!devLoginAllowed()) return c.json({ error: "Dev sign-in is off." }, 404)
  const body = await c.req.json().catch(() => ({}))
  const role = body.role === "admin" ? "admin" : "client"
  const email = role === "admin" ? "admin@preview.cozydigital.local" : "client@preview.cozydigital.local"
  const user = await createUser({
    email,
    name: role === "admin" ? "Preview admin" : "Preview client",
    password: "preview-password",
  })
  if (role === "admin") {
    await update((db) => {
      const row = db.users.find((item) => item.id === user.id)
      row.role = "admin"
      row.tier = "cozy-agent"
      return row
    })
  } else {
    await update((db) => {
      const row = db.users.find((item) => item.id === user.id)
      row.role = "client"
      row.tier = "cozy-agent"
      return row
    })
  }
  const fresh = await findUserByEmail(email)
  c.header("Set-Cookie", sessionCookie(fresh.id))
  return c.json({ user: publicUser(fresh), mock: true })
})

app.post("/api/auth/logout", (c) => {
  c.header("Set-Cookie", expireCookie("cozy_session"))
  return c.json({ ok: true })
})

app.get("/api/me", async (c) => {
  const user = await userFromRequest(c)
  return c.json({ user: publicUser(user) })
})

function uploadsDir(userId) {
  return join(dataDir(), "uploads", userId)
}

app.get("/api/assets", async (c) => {
  const user = requireUser(await userFromRequest(c))
  const db = await read()
  const rows = db.assets.filter((asset) => asset.userId === user.id || user.role === "admin")
  const visible = user.role === "admin" ? db.assets : rows
  return c.json({ assets: visible.map(publicAsset) })
})

app.post("/api/assets", async (c) => {
  const user = requireUser(await userFromRequest(c))
  const form = await c.req.parseBody()
  const file = form.file
  const kind = form.kind === "logo" ? "logo" : "photo"
  if (!file || typeof file === "string" || !file.arrayBuffer) {
    return c.json({ error: "Choose an image." }, 400)
  }
  const type = file.type || "application/octet-stream"
  if (!IMAGE_TYPES.has(type)) return c.json({ error: "Use a JPEG, PNG, WebP, or GIF." }, 400)
  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length > 8 * 1024 * 1024) return c.json({ error: "File is over 8 MB." }, 413)
  const assetId = id("ast")
  const ext = extensionFor(type)
  const dir = uploadsDir(user.id)
  await mkdir(dir, { recursive: true })
  const filename = `${assetId}${ext}`
  await writeFile(join(dir, filename), bytes)
  const asset = await update((db) => {
    const row = {
      id: assetId,
      userId: user.id,
      kind,
      filename,
      originalName: basename(String(file.name || filename)).slice(0, 180),
      mime: type,
      bytes: bytes.length,
      createdAt: new Date().toISOString(),
    }
    db.assets.push(row)
    return row
  })
  return c.json({ asset: publicAsset(asset) }, 201)
})

app.get("/api/assets/:id", async (c) => {
  const user = requireUser(await userFromRequest(c))
  const db = await read()
  const asset = db.assets.find((item) => item.id === c.req.param("id"))
  if (!asset) return c.json({ error: "Not found." }, 404)
  if (asset.userId !== user.id && user.role !== "admin") return c.json({ error: "Not found." }, 404)
  const path = join(uploadsDir(asset.userId), asset.filename)
  const bytes = await readFile(path)
  return c.body(bytes, 200, {
    "Content-Type": asset.mime,
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename="${asset.originalName.replace(/"/g, "")}"`,
  })
})

app.get("/api/requests", async (c) => {
  const user = requireUser(await userFromRequest(c))
  const db = await read()
  const rows = db.requests.filter((item) => item.userId === user.id)
  return c.json({ requests: rows.map(publicRequest) })
})

app.post("/api/requests", async (c) => {
  const user = requireUser(await userFromRequest(c))
  const body = await c.req.json().catch(() => ({}))
  const brief = String(body.brief || "").trim()
  if (brief.length < 8) return c.json({ error: "Write a brief of at least a sentence." }, 400)
  if (user.credits < 1) {
    return c.json(
      { error: "No preview credits left. An admin can add allowance. This is not a paid balance." },
      402,
    )
  }
  const request = await update((db) => {
    const rowUser = db.users.find((item) => item.id === user.id)
    rowUser.credits -= 1
    const row = {
      id: id("req"),
      userId: user.id,
      brief: brief.slice(0, 4000),
      source: body.source === "agent" ? "agent" : "desk",
      assetIds: Array.isArray(body.assetIds) ? body.assetIds.slice(0, 12) : [],
      status: "requested",
      job: null,
      createdAt: new Date().toISOString(),
    }
    db.requests.push(row)
    return { request: row, credits: rowUser.credits }
  })
  return c.json({ request: publicRequest(request.request), credits: request.credits }, 201)
})

app.get("/api/agent", async (c) => {
  const user = requireUser(await userFromRequest(c))
  const db = await read()
  const thread = db.threads.find((item) => item.userId === user.id) || null
  return c.json({
    thread: publicThread(thread),
    tier: user.tier,
    premium: user.tier === "cozy-agent",
    preview: user.tier !== "cozy-agent",
  })
})

app.post("/api/agent/message", async (c) => {
  const user = requireUser(await userFromRequest(c))
  const body = await c.req.json().catch(() => ({}))
  const text = String(body.text || "")
  const result = await update(async (db) => {
    let thread = db.threads.find((item) => item.userId === user.id)
    if (!thread || body.reset) {
      db.threads = db.threads.filter((item) => item.userId !== user.id)
      thread = blankThread(user.id)
      db.threads.push(thread)
      if (body.reset) return { thread, queued: null }
    }
    agentReply(thread, text)
    let queued = null
    if (thread.wantsQueue) {
      thread.wantsQueue = false
      const rowUser = db.users.find((item) => item.id === user.id)
      if (rowUser.credits < 1) {
        thread.messages.push({
          role: "agent",
          content: "I would queue this, but the preview allowance is empty. An admin can add credits. Nothing was charged.",
          at: new Date().toISOString(),
        })
      } else {
        rowUser.credits -= 1
        thread.step = "queued"
        queued = {
          id: id("req"),
          userId: user.id,
          brief: thread.brief,
          source: "agent",
          assetIds: [],
          status: "requested",
          job: null,
          createdAt: new Date().toISOString(),
        }
        db.requests.push(queued)
        thread.messages.push({
          role: "agent",
          content: "Queued with the studio. You can watch the status beside your other films.",
          at: new Date().toISOString(),
        })
      }
    }
    return { thread, queued }
  })
  return c.json({ thread: publicThread(result.thread), request: result.queued ? publicRequest(result.queued) : null })
})

app.get("/api/admin/overview", async (c) => {
  const admin = requireAdmin(await userFromRequest(c))
  const db = await read()
  return c.json({
    higgsfield: higgsfieldMode(),
    admin: publicUser(admin),
    clients: db.users.map(publicUser),
    requests: db.requests.map((item) => ({
      ...publicRequest(item),
      client: publicUser(db.users.find((user) => user.id === item.userId)),
    })),
    assets: db.assets.map(publicAsset),
  })
})

app.post("/api/admin/clients/:id/credits", async (c) => {
  requireAdmin(await userFromRequest(c))
  const body = await c.req.json().catch(() => ({}))
  const credits = Number(body.credits)
  if (!Number.isInteger(credits) || credits < 0 || credits > 10000) {
    return c.json({ error: "Credits must be a whole number from 0 to 10000." }, 400)
  }
  const user = await update((db) => {
    const row = db.users.find((item) => item.id === c.req.param("id"))
    if (!row) return null
    row.credits = credits
    return row
  })
  if (!user) return c.json({ error: "No such client." }, 404)
  return c.json({ user: publicUser(user) })
})

app.post("/api/admin/clients/:id/tier", async (c) => {
  requireAdmin(await userFromRequest(c))
  const body = await c.req.json().catch(() => ({}))
  const tier = body.tier === "cozy-agent" ? "cozy-agent" : "early-access"
  const user = await update((db) => {
    const row = db.users.find((item) => item.id === c.req.param("id"))
    if (!row) return null
    row.tier = tier
    return row
  })
  if (!user) return c.json({ error: "No such client." }, 404)
  return c.json({ user: publicUser(user) })
})

app.post("/api/admin/requests/:id/generate", async (c) => {
  requireAdmin(await userFromRequest(c))
  const body = await c.req.json().catch(() => ({}))
  const db = await read()
  const request = db.requests.find((item) => item.id === c.req.param("id"))
  if (!request) return c.json({ error: "No such request." }, 404)
  const client = db.users.find((item) => item.id === request.userId)
  const prompt = [
    "Commercial film for a business. No likeness of a real person.",
    `Client: ${client?.name || "client"}.`,
    request.brief,
  ].join(" ")
  const kind = body.kind === "image" ? "image" : "text"
  let imageUrl = null
  if (kind === "image") {
    const asset = db.assets.find((item) => item.id === body.assetId && item.userId === request.userId)
    if (!asset) return c.json({ error: "Pick one of this client’s images." }, 400)
    if (higgsfieldMode() === "live") {
      const bytes = await readFile(join(uploadsDir(asset.userId), asset.filename))
      const uploaded = await uploadImage(bytes, asset.mime)
      imageUrl = uploaded.publicUrl
    }
  }
  const submission =
    kind === "image"
      ? await submitImageToVideo({ prompt, imageUrl: imageUrl || "https://example.com/mock.png", idempotencyKey: request.id })
      : await submitTextToVideo({ prompt, idempotencyKey: request.id })
  const saved = await update((state) => {
    const row = state.requests.find((item) => item.id === request.id)
    row.status = submission.status
    row.job = { ...submission, kind: kind === "image" ? "image-to-video" : "text-to-video" }
    return row
  })
  return c.json({ request: publicRequest(saved) })
})

app.post("/api/admin/requests/:id/refresh", async (c) => {
  requireAdmin(await userFromRequest(c))
  const db = await read()
  const request = db.requests.find((item) => item.id === c.req.param("id"))
  if (!request?.job) return c.json({ error: "No generation yet." }, 400)
  const next = await fetchStatus(request.job)
  const saved = await update((state) => {
    const row = state.requests.find((item) => item.id === request.id)
    row.job = next
    row.status = next.status
    return row
  })
  return c.json({ request: publicRequest(saved) })
})

app.get("/", (c) => page(c, "index.html"))
app.get("/login", (c) => page(c, "login.html"))

app.get("/portal", async (c) => {
  const user = await userFromRequest(c)
  if (!user) return c.redirect("/login?next=/portal")
  return page(c, "portal.html")
})

app.get("/portal/agent", async (c) => {
  const user = await userFromRequest(c)
  if (!user) return c.redirect("/login?next=/portal/agent")
  return page(c, "agent.html")
})

app.get("/admin", async (c) => {
  const user = await userFromRequest(c)
  if (!user) return c.redirect("/login?next=/admin")
  if (user.role !== "admin") return c.redirect("/portal")
  return page(c, "admin.html")
})

app.get("/brand/*", (c) => staticFromSite(c))
app.get("/css/*", (c) => staticFromSite(c))
app.get("/js/*", (c) => staticFromSite(c))
app.get("/fonts/*", (c) => staticFromSite(c))
app.get("/media/*", (c) => staticFromSite(c))
app.get("/favicon.svg", (c) => staticFromSite(c))

async function staticFromSite(c) {
  const url = new URL(c.req.url)
  const rel = decodeURIComponent(url.pathname)
  if (rel.includes("..")) return c.text("Not found", 404)
  const path = join(process.cwd(), "site", rel)
  const type = mime(path)
  try {
    return await sendFile(c, path, type)
  } catch {
    return c.text("Not found", 404)
  }
}

function mime(path) {
  const ext = extname(path).toLowerCase()
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".webp": "image/webp",
      ".jpg": "image/jpeg",
      ".woff2": "font/woff2",
      ".txt": "text/plain; charset=utf-8",
      ".json": "application/json",
    }[ext] || "application/octet-stream"
  )
}

function extensionFor(type) {
  return { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" }[type] || ".bin"
}

function publicAsset(asset) {
  return {
    id: asset.id,
    userId: asset.userId,
    kind: asset.kind,
    originalName: asset.originalName,
    mime: asset.mime,
    bytes: asset.bytes,
    createdAt: asset.createdAt,
    url: `/api/assets/${asset.id}`,
  }
}

function publicRequest(request) {
  return {
    id: request.id,
    userId: request.userId,
    brief: request.brief,
    source: request.source,
    assetIds: request.assetIds || [],
    status: request.status,
    job: clientJob(request.job),
    createdAt: request.createdAt,
  }
}

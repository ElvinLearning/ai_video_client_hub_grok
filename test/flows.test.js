import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const dir = await mkdtemp(join(tmpdir(), "cozy-flow-"))
process.env.DATA_DIR = dir
process.env.AUTH_SECRET = "test-secret"
process.env.NODE_ENV = "development"
process.env.ALLOW_DEV_LOGIN = "1"
process.env.ADMIN_EMAILS = "owner@cozydigital.org"
delete process.env.HIGGSFIELD_API_KEY
delete process.env.HIGGSFIELD_API_KEY_ID
delete process.env.HIGGSFIELD_API_KEY_SECRET
delete process.env.GOOGLE_CLIENT_ID
delete process.env.GOOGLE_CLIENT_SECRET

const { app } = await import("../server/app.js")

function cookieFrom(response) {
  const raw = response.headers.get("set-cookie") || ""
  const match = raw.match(/cozy_session=[^;]+/)
  return match ? match[0] : ""
}

test("dev client can upload a brief and admin can mock-generate it", async () => {
  const health = await app.request("/api/health")
  assert.equal(health.status, 200)

  const pricing = await app.request("/api/pricing")
  const body = await pricing.json()
  assert.equal(body.plans[0].priceUsd, null)
  assert.equal(JSON.stringify(body).includes("40"), false)

  const system = await app.request("/api/system")
  const sys = await system.json()
  assert.equal(sys.higgsfield, "mock")
  assert.equal(sys.googleAuth, false)
  assert.equal(sys.billing.ready, false)

  const dev = await app.request("/api/auth/dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "client" }),
  })
  assert.equal(dev.status, 200)
  const clientCookie = cookieFrom(dev)
  assert.ok(clientCookie)

  const me = await app.request("/api/me", { headers: { cookie: clientCookie } })
  const meBody = await me.json()
  assert.equal(meBody.user.credits, 3)
  assert.equal(meBody.user.tier, "cozy-agent")

  const created = await app.request("/api/requests", {
    method: "POST",
    headers: { cookie: clientCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ brief: "A short film of the storefront opening in the morning." }),
  })
  assert.equal(created.status, 201)
  const request = (await created.json()).request
  assert.equal(request.status, "requested")

  const agent = await app.request("/api/agent/message", {
    method: "POST",
    headers: { cookie: clientCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "We sell ceramic mugs." }),
  })
  const thread = (await agent.json()).thread
  assert.match(thread.messages.at(-1).content, /Who is it for/)

  const admin = await app.request("/api/auth/dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin" }),
  })
  const adminCookie = cookieFrom(admin)
  const overview = await app.request("/api/admin/overview", { headers: { cookie: adminCookie } })
  assert.equal(overview.status, 200)
  const data = await overview.json()
  assert.equal(data.higgsfield, "mock")
  assert.ok(data.requests.some((item) => item.id === request.id))

  const generated = await app.request(`/api/admin/requests/${request.id}/generate`, {
    method: "POST",
    headers: { cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "text" }),
  })
  assert.equal(generated.status, 200)
  const job = (await generated.json()).request.job
  assert.equal(job.mock, true)
  assert.equal(job.mode, "mock")

  const refreshed = await app.request(`/api/admin/requests/${request.id}/refresh`, {
    method: "POST",
    headers: { cookie: adminCookie },
  })
  const after = (await refreshed.json()).request.job
  assert.ok(["queued", "in_progress", "completed"].includes(after.status))

  const adjusted = await app.request(`/api/admin/clients/${meBody.user.id}/credits`, {
    method: "POST",
    headers: { cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ credits: 7 }),
  })
  assert.equal((await adjusted.json()).user.credits, 7)

  const blocked = await app.request("/api/admin/overview", { headers: { cookie: clientCookie } })
  assert.equal(blocked.status, 403)

  const checkout = await app.request("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId: "studio" }),
  })
  assert.equal(checkout.status, 501)
})

test("email register then login", async () => {
  const registered = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@cozydigital.org", password: "correct-horse", name: "Owner" }),
  })
  assert.equal(registered.status, 200)
  assert.equal((await registered.json()).user.role, "admin")

  const login = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@cozydigital.org", password: "nope-nope" }),
  })
  assert.equal(login.status, 401)
})

test.after(async () => {
  await rm(dir, { recursive: true, force: true })
})

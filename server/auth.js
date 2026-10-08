import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto"
import { earlyAccessPreview } from "../config/pricing.js"
import { id, read, update } from "./store.js"

const SESSION = "cozy_session"
const OAUTH = "cozy_oauth"
const WEEK = 60 * 60 * 24 * 14

function secret() {
  return process.env.AUTH_SECRET || "dev-only-secret-change-me"
}

export function adminEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function devLoginAllowed() {
  if (process.env.ALLOW_DEV_LOGIN === "1") return true
  if (process.env.NODE_ENV === "production") return false
  return true
}

function sign(body) {
  const sig = createHmac("sha256", secret()).update(body).digest("base64url")
  return `${body}.${sig}`
}

function unsign(token) {
  if (!token || !token.includes(".")) return null
  const i = token.lastIndexOf(".")
  const body = token.slice(0, i)
  const sig = token.slice(i + 1)
  const expected = createHmac("sha256", secret()).update(body).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
}

function cookie(name, value, { maxAge = WEEK, httpOnly = true } = {}) {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ]
  if (httpOnly) parts.push("HttpOnly")
  if (process.env.NODE_ENV === "production") parts.push("Secure")
  return parts.join("; ")
}

export function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`
}

export function readCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(";")) {
    const i = part.indexOf("=")
    if (i === -1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url")
  const hash = scryptSync(password, salt, 32).toString("base64url")
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split("$")
  if (scheme !== "scrypt" || !salt || !hash) return false
  const next = scryptSync(password, salt, 32)
  const prev = Buffer.from(hash, "base64url")
  if (next.length !== prev.length) return false
  return timingSafeEqual(next, prev)
}

export function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tier: user.tier,
    credits: user.credits,
    allowanceLabel: earlyAccessPreview.label,
    allowanceNote: earlyAccessPreview.note,
    provider: user.googleSub ? "google" : "password",
  }
}

function roleFor(email) {
  return adminEmails().has(email.toLowerCase()) ? "admin" : "client"
}

export async function createUser({ email, name, password, googleSub }) {
  const normalized = email.trim().toLowerCase()
  return update((db) => {
    const existing = db.users.find((user) => user.email === normalized)
    if (existing) {
      if (googleSub && !existing.googleSub) existing.googleSub = googleSub
      if (name && !existing.name) existing.name = name
      existing.role = roleFor(normalized)
      return existing
    }
    const user = {
      id: id("usr"),
      email: normalized,
      name: name || normalized.split("@")[0],
      passwordHash: password ? hashPassword(password) : null,
      googleSub: googleSub || null,
      role: roleFor(normalized),
      tier: "early-access",
      credits: earlyAccessPreview.credits,
      createdAt: new Date().toISOString(),
    }
    db.users.push(user)
    return user
  })
}

export async function findUserByEmail(email) {
  const db = await read()
  return db.users.find((user) => user.email === email.trim().toLowerCase()) || null
}

export async function findUserById(userId) {
  const db = await read()
  return db.users.find((user) => user.id === userId) || null
}

export function sessionCookie(userId) {
  const body = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + WEEK * 1000 }),
  ).toString("base64url")
  return cookie(SESSION, sign(body))
}

export async function userFromRequest(c) {
  const cookies = readCookies(c.req.header("cookie"))
  const payload = unsign(cookies[SESSION])
  if (!payload?.uid || payload.exp < Date.now()) return null
  return findUserById(payload.uid)
}

export function requireUser(user) {
  if (!user) {
    const error = new Error("Sign in required")
    error.status = 401
    throw error
  }
  return user
}

export function requireAdmin(user) {
  requireUser(user)
  if (user.role !== "admin") {
    const error = new Error("Admin only")
    error.status = 403
    throw error
  }
  return user
}

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

export function oauthStartCookie() {
  const state = randomBytes(16).toString("base64url")
  const verifier = randomBytes(32).toString("base64url")
  const challenge = base64url(createHash("sha256").update(verifier).digest())
  const body = Buffer.from(JSON.stringify({ state, verifier })).toString("base64url")
  return { state, challenge, header: cookie(OAUTH, sign(body), { maxAge: 600 }) }
}

export function readOauthCookie(header) {
  const cookies = readCookies(header)
  return unsign(cookies[OAUTH])
}

export function safeNext(value) {
  if (typeof value !== "string") return ""
  if (!value.startsWith("/") || value.startsWith("//")) return ""
  return value
}

export { SESSION, OAUTH, clearCookie as expireCookie }

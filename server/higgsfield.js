/**
 * Server-side Higgsfield adapter.
 *
 * Docs used (October 2026):
 * - Auth: Authorization: Key KEY_ID:KEY_SECRET
 *   https://docs.higgsfield.ai/docs/authentication.md
 * - Text to video: POST /bytedance/seedance-2.5/text-to-video
 * - Image to video: POST /bytedance/seedance-2.5/image-to-video
 * - Uploads: POST /files/generate-upload-url, then PUT the bytes
 * - Lifecycle: queued, in_progress, completed, failed, nsfw, canceled
 *   Poll the status_url returned by the submission. Do not invent it.
 *
 * If credentials are missing, mode is "mock". Mock jobs never leave the server.
 * The key is read from the environment only and is never returned to the client.
 */

const API = "https://api.higgsfield.ai"
const TEXT_TO_VIDEO = `${API}/bytedance/seedance-2.5/text-to-video`
const IMAGE_TO_VIDEO = `${API}/bytedance/seedance-2.5/image-to-video`

export function higgsfieldCredentials() {
  const id = process.env.HIGGSFIELD_API_KEY_ID || process.env.HF_API_KEY_ID
  const secret = process.env.HIGGSFIELD_API_KEY_SECRET || process.env.HF_API_KEY_SECRET
  if (id && secret) return { id, secret }
  const combined = process.env.HIGGSFIELD_API_KEY || ""
  const splitAt = combined.indexOf(":")
  if (splitAt > 0) {
    return { id: combined.slice(0, splitAt), secret: combined.slice(splitAt + 1) }
  }
  return null
}

export function higgsfieldMode() {
  return higgsfieldCredentials() ? "live" : "mock"
}

function authHeader() {
  const creds = higgsfieldCredentials()
  if (!creds) throw new Error("Higgsfield credentials are not set")
  return `Key ${creds.id}:${creds.secret}`
}

function clampDuration(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 5
  return Math.max(4, Math.min(30, Math.round(n)))
}

async function postJson(url, body, idempotencyKey) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 500) }
  }
  if (!response.ok) {
    const detail = json?.detail || json?.message || response.statusText
    const error = new Error(`Higgsfield ${response.status}: ${detail}`)
    error.status = response.status
    error.body = json
    throw error
  }
  return json
}

export async function uploadImage(bytes, contentType) {
  if (higgsfieldMode() === "mock") {
    return { publicUrl: null, mock: true }
  }
  const created = await postJson(`${API}/files/generate-upload-url`, {
    content_type: contentType,
  })
  const headers = new Headers()
  for (const [key, value] of Object.entries(created.upload_headers || {})) {
    headers.set(key, String(value))
  }
  if (!headers.has("Content-Type")) headers.set("Content-Type", contentType)
  const put = await fetch(created.upload_url, { method: "PUT", headers, body: bytes })
  if (!put.ok) {
    throw new Error(`Higgsfield upload failed (${put.status})`)
  }
  return { publicUrl: created.public_url, mock: false }
}

export async function submitTextToVideo({ prompt, duration, idempotencyKey }) {
  if (higgsfieldMode() === "mock") return mockSubmission("text-to-video")
  const json = await postJson(
    TEXT_TO_VIDEO,
    {
      prompt,
      duration: clampDuration(duration),
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: false,
    },
    idempotencyKey,
  )
  return normalizeSubmission(json, "live")
}

export async function submitImageToVideo({ prompt, imageUrl, duration, idempotencyKey }) {
  if (higgsfieldMode() === "mock") return mockSubmission("image-to-video")
  const json = await postJson(
    IMAGE_TO_VIDEO,
    {
      image_url: imageUrl,
      prompt: prompt || undefined,
      duration: clampDuration(duration),
      resolution: "720p",
      generate_audio: false,
    },
    idempotencyKey,
  )
  return normalizeSubmission(json, "live")
}

export async function fetchStatus(job) {
  if (!job) return null
  if (job.mode === "mock") return advanceMock(job)
  if (!job.statusUrl) return job
  const response = await fetch(job.statusUrl, {
    headers: { Authorization: authHeader() },
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    return {
      ...job,
      status: "failed",
      error: json.detail || `Status check failed (${response.status})`,
    }
  }
  return {
    ...job,
    status: json.status || job.status,
    error: json.error || null,
    videoUrl: json.video?.url || job.videoUrl || null,
    rawStatus: json.status,
  }
}

function normalizeSubmission(json, mode) {
  return {
    mode,
    mock: false,
    provider: "higgsfield",
    model: "bytedance/seedance-2.5",
    requestId: json.request_id,
    status: json.status || "queued",
    statusUrl: json.status_url,
    cancelUrl: json.cancel_url,
    videoUrl: null,
    error: null,
    submittedAt: new Date().toISOString(),
  }
}

function mockSubmission(kind) {
  return {
    mode: "mock",
    mock: true,
    provider: "mock",
    model: "mock-seedance",
    kind,
    requestId: `mock_${Math.random().toString(16).slice(2, 10)}`,
    status: "queued",
    statusUrl: null,
    cancelUrl: null,
    videoUrl: null,
    error: null,
    submittedAt: new Date().toISOString(),
    note: "Mock mode. No request was sent to Higgsfield.",
  }
}

export function advanceMock(job) {
  const age = Date.now() - new Date(job.submittedAt).getTime()
  let status = "queued"
  if (age > 2800) status = "completed"
  else if (age > 900) status = "in_progress"
  return {
    ...job,
    status,
    mock: true,
    videoUrl: null,
    note: "Mock mode. No request was sent to Higgsfield.",
  }
}

export function clientJob(job) {
  if (!job) return null
  return {
    mode: job.mode,
    mock: Boolean(job.mock || job.mode === "mock"),
    provider: job.provider,
    model: job.model,
    kind: job.kind || null,
    requestId: job.requestId,
    status: job.status,
    videoUrl: job.videoUrl || null,
    error: job.error || null,
    note: job.note || (job.mode === "mock" ? "Mock mode. No request was sent to Higgsfield." : null),
    submittedAt: job.submittedAt,
  }
}

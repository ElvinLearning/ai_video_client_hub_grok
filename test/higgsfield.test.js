import assert from "node:assert/strict"
import test from "node:test"

delete process.env.HIGGSFIELD_API_KEY
delete process.env.HIGGSFIELD_API_KEY_ID
delete process.env.HIGGSFIELD_API_KEY_SECRET
delete process.env.HF_API_KEY_ID
delete process.env.HF_API_KEY_SECRET

const higgsfield = await import("../server/higgsfield.js")

test("missing key is mock, and a combined key stays server-side", async () => {
  assert.equal(higgsfield.higgsfieldMode(), "mock")
  const job = await higgsfield.submitTextToVideo({ prompt: "A product on a table", duration: 99 })
  assert.equal(job.mock, true)
  assert.equal(job.mode, "mock")
  assert.equal(job.status, "queued")
  assert.match(job.note, /No request was sent/)
  const young = higgsfield.advanceMock({ ...job, submittedAt: new Date().toISOString() })
  assert.equal(young.status, "queued")
  const old = higgsfield.advanceMock({ ...job, submittedAt: new Date(Date.now() - 4000).toISOString() })
  assert.equal(old.status, "completed")
  assert.equal(old.videoUrl, null)

  process.env.HIGGSFIELD_API_KEY = "key_test:secret_test"
  assert.equal(higgsfield.higgsfieldMode(), "live")
  const creds = higgsfield.higgsfieldCredentials()
  assert.equal(creds.id, "key_test")
  assert.equal(creds.secret, "secret_test")
  delete process.env.HIGGSFIELD_API_KEY
  assert.equal(higgsfield.higgsfieldMode(), "mock")
})

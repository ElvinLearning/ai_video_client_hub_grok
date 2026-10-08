import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { randomBytes } from "node:crypto"

const memory = {
  users: [],
  assets: [],
  requests: [],
  threads: [],
}

let loaded = false
let writing = Promise.resolve()

export function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR
  if (process.env.VERCEL) return "/tmp/cozy-data"
  return join(process.cwd(), "data")
}

function dbPath() {
  return join(dataDir(), "db.json")
}

async function load() {
  if (loaded) return
  await mkdir(dataDir(), { recursive: true })
  try {
    const raw = await readFile(dbPath(), "utf8")
    const parsed = JSON.parse(raw)
    memory.users = parsed.users || []
    memory.assets = parsed.assets || []
    memory.requests = parsed.requests || []
    memory.threads = parsed.threads || []
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  loaded = true
}

async function persist() {
  const payload = JSON.stringify(
    {
      users: memory.users,
      assets: memory.assets,
      requests: memory.requests,
      threads: memory.threads,
    },
    null,
    2,
  )
  const path = dbPath()
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, payload)
  await rename(tmp, path)
}

export function id(prefix) {
  return `${prefix}_${randomBytes(8).toString("hex")}`
}

export async function update(mutator) {
  writing = writing.then(async () => {
    await load()
    const result = await mutator(memory)
    await persist()
    return result
  })
  return writing
}

export async function read() {
  await load()
  return memory
}

export function resetMemoryForTests() {
  memory.users = []
  memory.assets = []
  memory.requests = []
  memory.threads = []
  loaded = false
  writing = Promise.resolve()
}

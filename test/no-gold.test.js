import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"

const banned = [/gold/i, /goldenrod/i, /#ffd700/i, /#d4af37/i, /#c9a227/i, /#e6c200/i]

async function files(dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "vendor" || entry.name === "fonts" || entry.name.startsWith(".")) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await files(path, acc)
    else if (/\.(js|css|html|md)$/.test(entry.name)) acc.push(path)
  }
  return acc
}

test("no gold in product source", async () => {
  const root = new URL("..", import.meta.url)
  const paths = [
    ...(await files(new URL("site", root).pathname)),
    ...(await files(new URL("server", root).pathname)),
    ...(await files(new URL("config", root).pathname)),
  ]
  for (const path of paths) {
    const text = await readFile(path, "utf8")
    for (const pattern of banned) {
      assert.equal(pattern.test(text), false, `${path} matched ${pattern}`)
    }
  }
})

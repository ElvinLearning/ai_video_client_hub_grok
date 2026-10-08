/**
 * Paints the landing pictures into site/media.
 *
 *   node tools/paint/run.mjs              every scene
 *   node tools/paint/run.mjs hero agent   only these
 *   node tools/paint/run.mjs --preview hero   PNG preview in workbench/out, site/media untouched
 *
 * Renders in headless Chromium. Software GL works; it is slow but deterministic.
 */
import { createServer } from "node:http"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const root = fileURLToPath(new URL("../../", import.meta.url))
const args = process.argv.slice(2)
const preview = args.includes("--preview")
const flatOnly = args.includes("--flat")
const scaleArg = args.find((a) => a.startsWith("--scale="))
const scale = scaleArg ? Number(scaleArg.split("=")[1]) : 1
const only = args.filter((a) => !a.startsWith("--"))
const outDir = preview ? join(root, "workbench/out/paint") : join(root, "site/media")
await mkdir(outDir, { recursive: true })

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg" }
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "")
    const file = join(root, path)
    if (!file.startsWith(root)) throw new Error("outside")
    const body = await readFile(file)
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const port = server.address().port

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
})
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
page.on("pageerror", (e) => console.error("page:", e.message))
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.error("console:", m.text())
})
page.setDefaultTimeout(30 * 60 * 1000)
await page.goto(`http://127.0.0.1:${port}/tools/paint/index.html`)
await page.waitForFunction(() => window.ready === true)

const list = await page.evaluate(() => window.sceneList())
const todo = list.filter((s) => !only.length || only.includes(s.id))
if (!todo.length) console.error(`no scenes match ${only.join(", ")}; have ${list.map((s) => s.id).join(", ")}`)

function decode(url) {
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64")
}

for (const scene of todo) {
  const jobs = scene.layers.length && !flatOnly ? ["flat", ...scene.layers] : ["flat"]
  for (const layer of jobs) {
    const name = layer === "flat" ? scene.id : `${scene.id}-${layer}`
    const type = preview ? "image/png" : "image/webp"
    const { url, ms, marks } = await page.evaluate(([id, l, t, s]) => window.paint(id, l, { type: t, scale: s }), [scene.id, layer, type, scale])
    const file = join(outDir, `${name}.${preview ? "png" : "webp"}`)
    await writeFile(file, decode(url))
    console.log(`${name}  ${scene.size.join("×")}  ${ms} ms  ${(decode(url).length / 1024).toFixed(0)} KB`)
    if (layer === "flat" && marks && Object.keys(marks).length) console.log(`  marks ${JSON.stringify(marks)}`)
    if (!preview && layer === "flat" && scene.small) {
      const small = await page.evaluate(([u, w]) => window.shrink(u, w), [url, Math.round(scene.size[0] / 2)])
      await writeFile(join(outDir, `${name}-sm.webp`), decode(small))
    }
  }
}

if (!preview && (!only.length || only.includes("brush"))) {
  for (const kind of ["wipe", "edge"]) {
    const url = await page.evaluate((k) => window.brush(k), kind)
    await writeFile(join(outDir, `brush-${kind}.png`), decode(url))
    console.log(`brush-${kind}.png`)
  }
}

await browser.close()
server.close()

import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"

const base = process.env.BASE_URL || "http://127.0.0.1:3000"
const out = new URL("../workbench/out/", import.meta.url).pathname
await mkdir(out, { recursive: true })

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors = []
page.on("pageerror", (error) => errors.push(String(error)))
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text())
})

await page.goto(`${base}/?debug=1`, { waitUntil: "networkidle" })
const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2")
  const info = gl?.getExtension("WEBGL_debug_renderer_info")
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown"
})
await page.waitForFunction(() => window.__app?.ready, null, { timeout: 15000 })
const states = ["hero", "lineage", "banneker", "johnson", "blackwell", "lawson", "reel", "method", "pricing", "cta"]
for (const name of states) {
  await page.evaluate((state) => window.__app.goto(state, true), name)
  await page.waitForFunction((state) => Math.abs(window.__app.scroll.value - window.__app.states[state]) < 0.02, name)
  await page.waitForTimeout(180)
  await page.screenshot({ path: `${out}${name}.png` })
}

await page.goto(`${base}/?bench=1`, { waitUntil: "domcontentloaded" })
await page.waitForFunction(() => window.__app?.bench?.done, null, { timeout: 20000 })
const bench = await page.evaluate(() => ({ ...window.__app.bench, quality: window.__app.quality, renderer: window.__app.renderer }))

const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await reduced.goto(`${base}/?motion=reduce`, { waitUntil: "networkidle" })
await reduced.waitForTimeout(400)
await reduced.screenshot({ path: `${out}reduced.png`, fullPage: false })
await reduced.screenshot({ path: `${out}reduced-hero.png` })

const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await desk.goto(`${base}/login`)
await desk.getByRole("button", { name: "Enter as preview client" }).click()
await desk.waitForURL("**/portal")
await desk.waitForTimeout(300)
await desk.screenshot({ path: `${out}portal.png` })
await desk.getByLabel("Brief").fill("A morning film of the storefront, logo at the end.")
await desk.getByRole("button", { name: "Request a video" }).click()
await desk.waitForTimeout(400)
await desk.screenshot({ path: `${out}portal-request.png` })
await desk.goto(`${base}/portal/agent`)
await desk.waitForTimeout(300)
await desk.screenshot({ path: `${out}agent.png` })

const admin = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await admin.goto(`${base}/login`)
await admin.getByRole("button", { name: "Enter as preview admin" }).click()
await admin.waitForURL("**/admin")
await admin.waitForTimeout(400)
await admin.screenshot({ path: `${out}admin.png` })

console.log(JSON.stringify({ bench, errors, gpu }, null, 2))
await browser.close()

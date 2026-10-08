import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"

const base = process.env.BASE_URL || "http://127.0.0.1:3000"
const out = new URL("../workbench/out/", import.meta.url).pathname
await mkdir(out, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors = []
page.on("pageerror", (error) => errors.push(String(error)))
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text())
})

await page.goto(`${base}/?debug=1&motion=full`, { waitUntil: "networkidle" })
await page.waitForFunction(() => window.__app?.ready, null, { timeout: 15000 })
const states = ["hero", "highlights", "method", "studio", "agent", "lineage", "blackwell", "pricing", "cta"]
for (const name of states) {
  await page.evaluate((state) => window.__app.goto(state), name)
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}${name}.png` })
}

// Scroll the whole page once and record frame rate.
const bench = await page.evaluate(async () => {
  window.scrollTo(0, 0)
  const total = document.documentElement.scrollHeight - innerHeight
  const rates = []
  const start = performance.now()
  let last = start
  await new Promise((done) => {
    function step(now) {
      const t = Math.min(1, (now - start) / 9000)
      window.scrollTo(0, t * total)
      rates.push(1000 / Math.max(1, now - last))
      last = now
      if (t < 1) requestAnimationFrame(step)
      else done()
    }
    requestAnimationFrame(step)
  })
  return { frames: rates.length, avgFps: rates.reduce((a, b) => a + b, 0) / rates.length, minFps: Math.min(...rates.slice(5)) }
})

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await phone.goto(`${base}/?motion=full`, { waitUntil: "networkidle" })
await phone.waitForTimeout(600)
await phone.screenshot({ path: `${out}phone-hero.png` })
await phone.screenshot({ path: `${out}phone-full.png`, fullPage: true })

const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await reduced.goto(`${base}/?motion=reduce`, { waitUntil: "networkidle" })
await reduced.waitForTimeout(400)
await reduced.screenshot({ path: `${out}reduced-hero.png` })
await reduced.screenshot({ path: `${out}reduced-full.png`, fullPage: true })

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

console.log(JSON.stringify({ bench, errors }, null, 2))
await browser.close()

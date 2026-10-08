import { createGraphics } from "./graphics.js"
import { applyScroll, mountPricing, placeChapters } from "./dom.js"
import { chapterAt, end, states } from "./timeline.js"

const params = new URLSearchParams(location.search)
const motionQuery = params.get("motion")
const reduced =
  motionQuery === "reduce" ||
  (motionQuery !== "full" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)

const root = document.documentElement
root.classList.toggle("is-reduced", reduced)

const canvas = document.getElementById("gl")
const hud = document.getElementById("hud")
const debug = params.get("debug") === "1"
if (debug && hud) hud.hidden = false

let graphics = null
let target = window.scrollY / Math.max(1, window.innerHeight)
let value = target
let last = performance.now()
let active = "intro"
const samples = []
let bench = null
let filmStart = 0
let filmArmed = params.get("film") === "1"

function onScroll() {
  target = window.scrollY / Math.max(1, window.innerHeight)
}

function goto(name, immediate = false) {
  if (reduced && typeof name === "string") {
    document.querySelector(`[data-chapter="${name}"]`)?.scrollIntoView({ behavior: "auto", block: "start" })
    return
  }
  const next = typeof name === "number" ? name : states[name]
  if (next == null) return
  const y = next * window.innerHeight
  window.scrollTo(0, y)
  target = next
  if (immediate || reduced) value = next
}

window.addEventListener("scroll", onScroll, { passive: true })
document.querySelectorAll("[data-goto]").forEach((node) => {
  node.addEventListener("click", () => goto(node.dataset.goto))
})

let visible = "field"
if (reduced) {
  const observer = new IntersectionObserver(
    (entries) => {
      const shown = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (!shown) return
      visible = shown.target.dataset.chapter || visible
      target = states[visible] ?? target
      value = target
    },
    { threshold: [0.35, 0.6] },
  )
  document.querySelectorAll("[data-chapter]").forEach((node) => observer.observe(node))
}

function filmOn() {
  return root.classList.contains("is-film")
}

function layout() {
  placeChapters(filmOn())
  if (graphics) graphics.resize()
  onScroll()
  if (!filmOn()) value = target
  active = applyScroll(value, filmOn())
}

try {
  if (canvas && !reduced) {
    graphics = createGraphics(canvas)
    root.classList.add("is-film")
  }
} catch (error) {
  console.error(error)
  root.classList.remove("is-film")
  graphics = null
}

layout()
mountPricing()
window.addEventListener("resize", layout)

const app = {
  ready: false,
  reducedMotion: reduced,
  states,
  layout,
  goto,
  fps: 0,
  active: "hero",
  warmMs: graphics?.warmMs ?? 0,
  bench: null,
  get scroll() {
    return { target, value }
  },
  play() {
    filmArmed = true
    filmStart = 0
  },
}
window.__app = app

function frame(now) {
  const rawDt = (now - last) / 1000
  const dt = Math.min(0.05, rawDt)
  last = now
  if (!reduced) requestAnimationFrame(frame)

  const auto = params.get("bench") === "1" ? "bench" : filmArmed ? "film" : ""
  if (auto && !reduced && app.ready) {
    if (!filmStart) filmStart = now
    const elapsed = now - filmStart
    if (auto === "bench") {
      const duration = 9000
      const t = Math.min(1, elapsed / duration)
      const eased = t * t * (3 - 2 * t)
      window.scrollTo(0, eased * end * window.innerHeight)
      target = eased * end
    } else {
      const duration = 36000
      const t = Math.min(1, elapsed / duration)
      const next = t * states.cta
      window.scrollTo(0, next * window.innerHeight)
      target = next
    }
  }

  if (reduced) value = target
  else value += (target - value) * (1 - Math.exp(-dt * 7.5))
  if (Math.abs(target - value) < 0.0004) value = target

  active = applyScroll(value, filmOn())
  const motion = reduced ? 0 : 1
  const time = reduced ? 0 : now / 1000
  if (graphics && root.classList.contains("is-film")) {
    graphics.render({ value, time, motion })
  }

  const fps = rawDt > 0 ? 1 / rawDt : 0
  samples.push(fps)
  if (samples.length > 45) samples.shift()
  app.fps = samples.reduce((sum, n) => sum + n, 0) / samples.length
  app.active = active
  app.renderer = graphics?.rendererName || "reduced-motion"
  app.quality = graphics?.quality || (reduced ? "reduced-motion" : "unavailable")
  app.ready = true
  root.classList.add("is-ready")
  root.classList.remove("is-booting")

  if (params.get("bench") === "1" && !reduced && filmStart) {
    if (!bench) bench = { frames: 0, minFps: Infinity, sum: 0, done: false }
    if (now - filmStart > 400) {
      bench.frames += 1
      bench.sum += fps
      bench.minFps = Math.min(bench.minFps, fps)
    }
    if (now - filmStart >= 9000) {
      bench.done = true
      bench.avgFps = bench.sum / Math.max(1, bench.frames)
      app.bench = bench
    }
  }

  if (debug && hud) {
    const chapter = chapterAt(value)
    hud.textContent = `${app.fps.toFixed(0)} fps · ${value.toFixed(2)} vh · ${chapter.id}`
  }
}

requestAnimationFrame(frame)
if (reduced) {
  requestAnimationFrame(frame)
}

setTimeout(() => {
  root.classList.add("is-ready")
  root.classList.remove("is-booting")
}, 3500)

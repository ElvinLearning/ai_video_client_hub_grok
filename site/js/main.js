import { mountPricing } from "./pricing.js"
import { chapters, clamp, methodState, pinProgress, smoothstep } from "./timeline.js"

const params = new URLSearchParams(location.search)
const root = document.documentElement
const reduced = root.classList.contains("is-reduced")
const debug = params.get("debug") === "1"
const hud = document.getElementById("hud")
if (debug && hud) hud.hidden = false

const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]

const topbar = $(".topbar")
const bar = $(".progress > span")
const hero = $(".hero")
const heroCopy = $(".hero-copy")
const cue = $(".scroll-cue")
const closing = $(".closing")
const method = $(".method")
const plates = $$(".plate")
const steps = $$(".step")
const statement = $("[data-words]")
const lineage = $(".lineage")
const track = $(".hanging-track")
const agentArt = $(".agent-art img")
const navLinks = $$("[data-nav]")
const sections = chapters
  .map((c) => ({ ...c, el: document.querySelector(`[data-chapter="${c.id}"]`) }))
  .filter((c) => c.el)

// ---------- words of the statement light up as it is read ----------
let words = []
if (statement) {
  const text = statement.textContent.trim().replace(/\s+/g, " ")
  statement.textContent = ""
  for (const [i, word] of text.split(" ").entries()) {
    const span = document.createElement("span")
    span.className = "w"
    span.textContent = word
    statement.append(span, i < text.split(" ").length - 1 ? " " : "")
  }
  words = $$(".w", statement)
}

// ---------- reveal on entry, with a small stagger ----------
$$(".cards [data-reveal]").forEach((el, i) => el.style.setProperty("--delay", `${(i % 3) * 0.08}s`))
$$(".chat [data-reveal]").forEach((el, i) => el.style.setProperty("--delay", `${i * 0.45}s`))
if (!reduced && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in")
          io.unobserve(e.target)
        }
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
  )
  $$("[data-reveal]").forEach((el) => io.observe(el))
} else {
  $$("[data-reveal]").forEach((el) => el.classList.add("is-in"))
}

// ---------- pointer, eased ----------
const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
window.addEventListener(
  "pointermove",
  (e) => {
    if (e.pointerType !== "mouse") return
    pointer.x = (e.clientX / innerWidth) * 2 - 1
    pointer.y = (e.clientY / innerHeight) * 2 - 1
  },
  { passive: true },
)

// ---------- layout ----------
let vw = innerWidth
let vh = innerHeight
let wide = vw > 860
let hangDistance = 0

function layout() {
  vw = innerWidth
  vh = innerHeight
  wide = vw > 860
  if (lineage && track) {
    if (!reduced && wide) {
      const pad = parseFloat(getComputedStyle($(".lineage-pin")).paddingLeft) || 0
      hangDistance = Math.max(0, track.scrollWidth - (vw - pad * 2))
      lineage.style.setProperty("--hang-h", `${Math.round(vh + hangDistance * 1.1)}px`)
    } else {
      hangDistance = 0
      lineage.style.removeProperty("--hang-h")
    }
  }
  dirty = true
}
window.addEventListener("resize", layout)
window.addEventListener("scroll", () => (dirty = true), { passive: true })

function setLayer(el, x, y, s) {
  if (!el) return
  el.style.setProperty("--lx", `${x.toFixed(2)}px`)
  el.style.setProperty("--ly", `${y.toFixed(2)}px`)
  if (s != null) el.style.setProperty("--ls", s.toFixed(4))
}

function paintStage(scope, p, px, py) {
  if (!scope) return
  const back = $(".layer-back", scope)
  const mid = $(".layer-mid", scope)
  const front = $(".layer-front", scope)
  setLayer(back, px * 6, p * vh * 0.1 + py * 4, 1.04 + p * 0.02)
  setLayer(mid, px * 14, p * vh * 0.2 + py * 8, 1.04 + p * 0.03)
  setLayer(front, px * 30, p * vh * 0.36 + py * 14, 1.06 + p * 0.05)
  for (const glow of $$(".glow", scope)) setLayer(glow, px * 14, p * vh * 0.2 + py * 8)
}

let active = "hero"
let dirty = true

function update() {
  const y = window.scrollY
  const max = Math.max(1, document.documentElement.scrollHeight - vh)
  bar?.style.setProperty("--progress", (y / max).toFixed(4))
  topbar?.classList.toggle("is-solid", y > vh * 0.55)

  // hero: layers drift apart as the page lifts away
  if (hero) {
    const r = hero.getBoundingClientRect()
    if (r.bottom > 0) {
      const p = clamp(-r.top / r.height, 0, 1)
      paintStage(hero, p, pointer.sx, pointer.sy)
      heroCopy?.style.setProperty("--copy-y", `${(-p * vh * 0.22).toFixed(1)}px`)
      const o = (1 - smoothstep(0.04, 0.5, p)).toFixed(3)
      heroCopy?.style.setProperty("--copy-o", o)
      cue?.style.setProperty("--copy-o", (1 - smoothstep(0, 0.12, p)).toFixed(3))
    }
  }

  // closing plate: the same depth trick, entering from below
  if (closing) {
    const r = closing.getBoundingClientRect()
    if (r.top < vh && r.bottom > 0) {
      const p = clamp((r.top + r.height) / (vh + r.height), 0, 1) - 0.5
      paintStage(closing, p * 0.5, pointer.sx, pointer.sy)
    }
  }

  // statement
  if (statement && words.length) {
    const r = statement.getBoundingClientRect()
    const p = clamp((vh * 0.9 - r.top) / (r.height + vh * 0.45), 0, 1)
    const lit = Math.round(p * words.length * 1.15)
    words.forEach((w, i) => w.classList.toggle("is-lit", i < lit))
  }

  // method: brush the next plate over the last
  if (method && wide) {
    const p = pinProgress(method.getBoundingClientRect(), vh)
    const { step, wipe } = methodState(p)
    plates.forEach((plate, i) => {
      plate.style.setProperty("--wipe", wipe[i].toFixed(4))
      plate.style.setProperty("--zoom", (1.1 - 0.1 * wipe[i] - 0.03 * clamp(p * 3 - i, 0, 1)).toFixed(4))
      plate.classList.toggle("is-on", i === step)
    })
    steps.forEach((s, i) => s.classList.toggle("is-on", i === step))
  }

  // lineage: the hanging slides past
  if (lineage && track && hangDistance > 0) {
    const p = pinProgress(lineage.getBoundingClientRect(), vh)
    track.style.setProperty("--hang-x", `${(-p * hangDistance).toFixed(1)}px`)
  }

  // agent: a slow push in
  if (agentArt) {
    const r = agentArt.getBoundingClientRect()
    if (r.top < vh && r.bottom > 0) {
      const p = clamp((vh - r.top) / (vh + r.height), 0, 1)
      agentArt.style.setProperty("--zoom", (1.12 - p * 0.1).toFixed(4))
    }
  }

  // which chapter is under the bar
  let current = sections[0]
  for (const s of sections) {
    if (s.el.getBoundingClientRect().top <= vh * 0.45) current = s
  }
  if (current && current.id !== active) {
    active = current.id
    navLinks.forEach((a) => a.classList.toggle("is-active", a.dataset.nav === current.nav))
  }
}

// ---------- loop ----------
const samples = []
let last = performance.now()
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  samples.push(dt > 0 ? 1 / dt : 60)
  if (samples.length > 45) samples.shift()
  last = now
  const k = 1 - Math.exp(-dt * 5)
  const dx = pointer.x - pointer.sx
  const dy = pointer.y - pointer.sy
  if (Math.abs(dx) + Math.abs(dy) > 0.0005) {
    pointer.sx += dx * k
    pointer.sy += dy * k
    dirty = true
  }
  if (dirty) {
    dirty = false
    update()
  }
  if (debug && hud) hud.textContent = `${app.fps.toFixed(0)} fps · ${active}`
  app.fps = samples.reduce((a, b) => a + b, 0) / samples.length
  requestAnimationFrame(frame)
}

// ---------- navigation ----------
function goto(name) {
  const el = document.querySelector(`[data-chapter="${name}"]`)
  if (!el) return
  if (lineage && track && hangDistance > 0 && lineage.contains(el) && el !== lineage) {
    const index = $$(".work", track).indexOf(el)
    const share = index / Math.max(1, $$(".work", track).length - 1)
    const top = lineage.getBoundingClientRect().top + window.scrollY
    window.scrollTo(0, top + share * (lineage.offsetHeight - vh))
    return
  }
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })
}

const app = {
  ready: false,
  reducedMotion: reduced,
  chapters: chapters.map((c) => c.id),
  goto,
  fps: 0,
  get active() {
    return active
  },
}
window.__app = app

layout()
mountPricing()
if (reduced) {
  update()
} else {
  requestAnimationFrame(frame)
}

// Ready once the hero painting can be shown.
const heroImages = $$(".hero img").filter((img) => getComputedStyle(img).display !== "none")
Promise.all(heroImages.map((img) => (img.complete ? null : img.decode().catch(() => null)))).then(() => {
  app.ready = true
  root.classList.add("is-ready")
  layout()
})

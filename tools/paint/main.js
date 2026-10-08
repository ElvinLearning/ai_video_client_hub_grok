import * as THREE from "three"
import { createPainter } from "./painter.js"
import { reseed } from "./kit.js"
import { scenes } from "./scenes.js"

const painter = createPainter()

/**
 * Layer i is painted with every nearer layer moved to three.js layer 1: those props still cast
 * shadows but are never drawn, so whatever they hid is painted in. Layers after the first are then
 * cut out with a coverage mask, so glass and glow keep whatever stands behind them.
 */
function isolate(shot, layer, order) {
  shot.scene.traverse((o) => {
    if (o.isLight && o.shadow) o.shadow.camera.layers.enableAll()
  })
  const index = order.indexOf(layer)
  if (index < 0) return
  for (const name of order.slice(index + 1)) {
    for (const obj of shot.layers[name] || []) {
      obj.traverse((o) => {
        if (!o.isLight) o.layers.set(1)
      })
    }
  }
}

async function loadFonts() {
  await Promise.all([
    document.fonts.load('600 40px "Fraunces"'),
    document.fonts.load('italic 400 40px "Fraunces"'),
    document.fonts.load('500 40px "Outfit"'),
    document.fonts.load('600 40px "Outfit"'),
  ])
}

window.sceneList = () =>
  Object.entries(scenes).map(([id, s]) => ({ id, size: s.size, layers: s.layers || [], small: s.small ?? true }))

/**
 * Render one scene (or one layer of it) and return a data URL.
 * Each call rebuilds the scene from the same seed so every layer lines up.
 */
window.paint = async (id, layer = "flat", { type = "image/webp", quality = 0.86, scale = 1 } = {}) => {
  await loadFonts()
  const def = scenes[id]
  if (!def) throw new Error(`no scene ${id}`)
  reseed(def.seed ?? 11)
  const [w, h] = def.size
  const shot = await def.build({ w, h })
  const order = def.layers || []
  isolate(shot, layer, order)
  const opaque = layer === "flat" || layer === order[0]
  const maskObjects = !opaque ? shot.layers[layer] : null
  const t0 = performance.now()
  const canvas = painter.paint(shot, { width: Math.round(w * scale), height: Math.round(h * scale), ...def.paint, opaque, maskObjects })
  const ms = Math.round(performance.now() - t0)
  const marks = {}
  if (shot.marks) {
    shot.scene.updateMatrixWorld(true)
    for (const [name, obj] of Object.entries(shot.marks)) {
      const v = obj.getWorldPosition(new THREE.Vector3()).project(shot.camera)
      marks[name] = { x: +((v.x + 1) / 2).toFixed(4), y: +((1 - v.y) / 2).toFixed(4) }
    }
  }
  let out = canvas
  if (scale !== 1) {
    out = document.createElement("canvas")
    out.width = Math.round(w * scale)
    out.height = Math.round(h * scale)
    out.getContext("2d").drawImage(canvas, 0, 0, out.width, out.height)
  }
  return { url: out.toDataURL(type, quality), ms, marks }
}

/** Downscale an encoded image in the page so the site can serve a small variant. */
window.shrink = async (dataUrl, width, { type = "image/webp", quality = 0.84 } = {}) => {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const c = document.createElement("canvas")
  c.width = width
  c.height = Math.round((img.height / img.width) * width)
  const g = c.getContext("2d")
  g.imageSmoothingQuality = "high"
  g.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL(type, quality)
}

/**
 * Brush masks for the page, white on transparent.
 * "wipe": opaque on the left, a ragged column of stroke ends in the middle, clear on the right.
 * "edge": opaque below a dry-brushed top edge.
 */
window.brush = (kind) => {
  let s = kind === "wipe" ? 91 : 17
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const c = document.createElement("canvas")
  const g = c.getContext("2d")
  g.fillStyle = "#fff"
  g.strokeStyle = "#fff"
  g.lineCap = "round"
  if (kind === "wipe") {
    c.width = 2048
    c.height = 512
    const mid = c.width / 2
    g.fillRect(0, 0, mid - 220, c.height)
    for (let y = -10; y < c.height + 10; y += 7) {
      const thick = 10 + rnd() * 26
      const end = mid + (rnd() - 0.5) * 300 + Math.sin(y * 0.02) * 60
      for (let b = 0; b < 9; b++) {
        const by = y + (rnd() - 0.5) * thick
        const be = end - rnd() * 120 * (b / 9)
        g.globalAlpha = 0.25 + rnd() * 0.75
        g.lineWidth = 1 + rnd() * 5
        g.beginPath()
        g.moveTo(mid - 260, by)
        g.lineTo(be, by + (rnd() - 0.5) * 6)
        g.stroke()
      }
      g.globalAlpha = 1
      g.lineWidth = thick * 0.7
      g.beginPath()
      g.moveTo(mid - 260, y)
      g.lineTo(end - 140, y + (rnd() - 0.5) * 4)
      g.stroke()
    }
  } else {
    c.width = 2048
    c.height = 192
    const base = (x) => 96 + Math.sin(x * 0.004) * 18 + Math.sin(x * 0.013 + 1.3) * 10 + Math.sin(x * 0.041) * 5
    g.beginPath()
    g.moveTo(0, c.height)
    for (let x = 0; x <= c.width; x += 8) g.lineTo(x, base(x) + (rnd() - 0.5) * 8)
    g.lineTo(c.width, c.height)
    g.closePath()
    g.fill()
    for (let i = 0; i < 900; i++) {
      const x = rnd() * c.width
      const len = 30 + rnd() * 220
      const y = base(x) + (rnd() - 0.65) * 34
      g.globalAlpha = 0.2 + rnd() * 0.8
      g.lineWidth = 1 + rnd() * 4
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + len, y + (rnd() - 0.5) * 3)
      g.stroke()
    }
  }
  return c.toDataURL("image/png")
}

window.ready = true

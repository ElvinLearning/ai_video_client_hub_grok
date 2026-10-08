import * as THREE from "three"
import * as K from "./kit.js"

const { palette: P } = K

function camera(w, h, fov, pos, look) {
  const c = new THREE.PerspectiveCamera(fov, w / h, 0.5, 200)
  c.position.set(...pos)
  c.lookAt(new THREE.Vector3(...look))
  return c
}

function place(obj, x, y, z, ry = 0, s = 1) {
  obj.position.set(x, y, z)
  obj.rotation.y = ry
  obj.scale.multiplyScalar(s)
  return obj
}

function add(scene, list, ...objs) {
  for (const o of objs) {
    scene.add(o)
    list.push(o)
  }
}

/** A small painted frame used on phone screens and prints, drawn on a 2D canvas. */
function screenArt({ w = 540, h = 1080, hue = "teal", caption = "" }) {
  return K.canvasTexture(w, h, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, h)
    if (hue === "teal") {
      grd.addColorStop(0, "#0d3b40")
      grd.addColorStop(0.55, "#1d8a8c")
      grd.addColorStop(1, "#0a1d22")
    } else if (hue === "dusk") {
      grd.addColorStop(0, "#1b1640")
      grd.addColorStop(0.5, "#7a5ac8")
      grd.addColorStop(1, "#10101a")
    } else {
      grd.addColorStop(0, "#3a1410")
      grd.addColorStop(0.5, "#c0702c")
      grd.addColorStop(1, "#120a08")
    }
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
    // a bottle silhouette in a pool of light
    g.fillStyle = "rgba(255,255,255,0.18)"
    g.beginPath()
    g.ellipse(w / 2, h * 0.62, w * 0.42, h * 0.2, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = "rgba(240,250,250,0.88)"
    g.fillRect(w * 0.42, h * 0.36, w * 0.16, h * 0.3)
    g.fillRect(w * 0.47, h * 0.28, w * 0.06, h * 0.09)
    g.fillStyle = "#14110f"
    g.fillRect(w * 0.455, h * 0.24, w * 0.09, h * 0.05)
    // play bar
    g.fillStyle = "rgba(255,255,255,0.85)"
    g.fillRect(w * 0.08, h * 0.9, w * 0.84, 6)
    g.fillStyle = "#55eef0"
    g.fillRect(w * 0.08, h * 0.9, w * 0.5, 6)
    if (caption) {
      g.fillStyle = "#f4fbfb"
      g.font = `600 ${Math.round(w * 0.085)}px Fraunces, Georgia, serif`
      g.textAlign = "center"
      g.fillText(caption, w / 2, h * 0.16)
    }
  })
}


/** Shared still-life set: wall, optional drape, table, cloth, chiaroscuro key, cyan rim, wall wash. */
function stage({
  wall = 0x33251a,
  cloth = 0x4a0e14,
  clothSheen = 0xff9a8a,
  clothRange = [-16, 16],
  drape = P.deepTeal,
  drapeX = -12,
  wood = "#3e2616",
  key = {},
  rim = {},
  wash = {},
  env = 0.18,
} = {}) {
  const scene = new THREE.Scene()
  const L = { back: [], mid: [], front: [] }
  add(scene, L.back, K.room({ wall }))
  if (drape) add(scene, L.back, place(K.curtain({ width: 16, height: 26, folds: 6, amp: 1, material: K.velvet(drape, 0x9fe7e8) }), drapeX, 9, -9, 0.18))
  add(scene, L.mid, K.table({ width: 44, depth: 13, tone: wood }))
  if (cloth) {
    const mat = cloth === "linen" ? K.linen(0xb5a88e) : K.velvet(cloth, clothSheen)
    add(scene, L.mid, K.tablecloth({ x0: clothRange[0], x1: clothRange[1], back: -6, edge: 6.5, drop: 7, folds: 9, amp: 0.9, material: mat }))
  }
  if (key) K.keyLight(scene, { intensity: 5200, pos: [-16, 20, 16], target: [1, 1.5, 0], angle: 0.24, penumbra: 0.9, ...key })
  if (rim) K.rimLight(scene, { color: P.cyan, intensity: 520, pos: [14, 9, -8], target: [2, 2, 0], angle: 0.4, ...rim })
  K.fill(scene, { intensity: 0.06 })
  if (wash) K.keyLight(scene, { color: 0xffc89a, intensity: 900, pos: [-6, 14, 10], target: [3, 7, -14], angle: 0.45, penumbra: 1, size: 512, ...wash })
  return { scene, L, env }
}

async function loadImage(url) {
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } catch {
    return null
  }
}

/** A crop of an already painted picture, as a texture. Falls back to a drawn frame on first run. */
async function cropTexture(url, [x, y, w, h], fallback = "teal", out = [540, 960]) {
  const img = await loadImage(url)
  return K.canvasTexture(out[0], out[1], (g, cw, ch) => {
    if (!img) {
      g.drawImage(screenArt({ hue: fallback, w: cw, h: ch }).image, 0, 0)
      return
    }
    g.drawImage(img, x * img.width, y * img.height, w * img.width, h * img.height, 0, 0, cw, ch)
  })
}

function uploadScreen() {
  return K.canvasTexture(540, 1080, (g, w, h) => {
    g.fillStyle = "#0f1012"
    g.fillRect(0, 0, w, h)
    g.fillStyle = "#e7f3f3"
    g.font = "600 46px Fraunces, Georgia, serif"
    g.fillText("Your brand", 40, 120)
    g.font = "500 24px Outfit, sans-serif"
    g.fillStyle = "#9aafb3"
    g.fillText("Logo · photos · brief", 40, 165)
    const tiles = ["#1d8a8c", "#7a5ac8", "#c0702c", "#efe4cc"]
    tiles.forEach((c, i) => {
      const x = 40 + (i % 2) * 240
      const y = 220 + Math.floor(i / 2) * 260
      g.fillStyle = c
      g.fillRect(x, y, 220, 230)
      g.fillStyle = "rgba(0,0,0,0.25)"
      g.fillRect(x + 70, y + 60, 80, 120)
    })
    g.fillStyle = "#2a2d31"
    g.fillRect(40, 800, w - 80, 14)
    g.fillStyle = "#55eef0"
    g.fillRect(40, 800, (w - 80) * 0.72, 14)
    g.fillStyle = "#e7f3f3"
    g.font = "500 26px Outfit, sans-serif"
    g.fillText("Uploading 3 of 4", 40, 860)
    g.fillStyle = "#55eef0"
    g.fillRect(40, 930, w - 80, 90)
    g.fillStyle = "#101010"
    g.font = "600 30px Outfit, sans-serif"
    g.fillText("Send the brief", 150, 987)
  })
}

function pageTexture(kind) {
  return K.canvasTexture(768, 1024, (g, w, h) => {
    g.drawImage(K.paperTexture(0, "#e6d6b6").image, 0, 0, w, h)
    g.strokeStyle = "rgba(45,30,20,0.75)"
    g.fillStyle = "rgba(45,30,20,0.8)"
    if (kind === "chart") {
      g.lineWidth = 9
      g.beginPath()
      g.arc(w / 2, h * 0.45, w * 0.36, 0, Math.PI * 2)
      g.stroke()
      g.lineWidth = 4
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        g.beginPath()
        g.moveTo(w / 2, h * 0.45)
        g.lineTo(w / 2 + Math.cos(a) * w * 0.36, h * 0.45 + Math.sin(a) * w * 0.36)
        g.stroke()
      }
      const stars = []
      for (let i = 0; i < 70; i++) {
        const a = K.rnd() * Math.PI * 2
        const r = Math.sqrt(K.rnd()) * w * 0.34
        const x = w / 2 + Math.cos(a) * r
        const y = h * 0.45 + Math.sin(a) * r
        stars.push([x, y])
        g.beginPath()
        g.arc(x, y, 5 + K.rnd() * 9, 0, Math.PI * 2)
        g.fill()
      }
      g.lineWidth = 6
      for (let i = 0; i < 14; i++) {
        const [a, b] = [stars[i * 3], stars[i * 3 + 1]]
        g.beginPath()
        g.moveTo(...a)
        g.lineTo(...b)
        g.stroke()
      }
      g.font = "italic 400 76px Fraunces, Georgia, serif"
      g.textAlign = "center"
      g.fillText("Ephemeris", w / 2, h * 0.92)
    } else {
      g.font = "600 62px Fraunces, Georgia, serif"
      g.fillText("The Moon", 70, 130)
      g.font = "600 44px Outfit, monospace"
      for (let r = 0; r < 15; r++) {
        let x = 70
        for (let c = 0; c < 4; c++) {
          g.fillText(String(Math.floor(K.rnd() * 90 + 10)), x, 230 + r * 54)
          x += 160
        }
      }
    }
  })
}

export const scenes = {
  hero: {
    size: [2400, 1350],
    layers: ["back", "mid", "front"],
    seed: 21,
    paint: { exposure: 1.2, radii: [8, 4], bristle: 0.2, impasto: 0.45, grain: 1.7, sigma: 3.2, vignette: 0.45 },
    build({ w, h }) {
      const scene = new THREE.Scene()
      const L = { back: [], mid: [], front: [] }

      add(scene, L.back, K.room({ wall: 0x33251a }))
      const drape = K.curtain({ width: 16, height: 26, folds: 6, amp: 1.0, material: K.velvet(P.deepTeal, 0x9fe7e8) })
      add(scene, L.back, place(drape, -12, 9, -9, 0.18))
      const drape2 = K.curtain({ width: 9, height: 26, folds: 4, amp: 0.8, material: K.velvet(0x3b0d12, 0xffb0a0) })
      add(scene, L.back, place(drape2, 15, 9, -10, -0.3))

      // table and its cloth
      add(scene, L.mid, place(K.table({ width: 40, depth: 13, tone: "#3e2616" }), 0, 0, 0))
      const cloth = K.tablecloth({ x0: -16, x1: 4.2, back: -6, edge: 6.5, drop: 7, folds: 9, amp: 0.9, material: K.velvet(0x4a0e14, 0xff9a8a) })
      add(scene, L.mid, cloth)

      // products
      const label = K.labelTexture({ title: "Cozy", sub: "eau de studio", bg: "#e9dcc0", accent: "#0f4a4e" })
      add(scene, L.mid, place(K.bottle({ h: 4.2, r: 0.95, neck: 0.24, shoulder: 0.7, tint: 0xd6f2ef, liquid: 0x127a7b, label, cap: 0x101010 }), 0.6, 0.05, 0.6, -0.2))
      const serum = K.labelTexture({ title: "No. 7", sub: "serum", bg: "#14110f", ink: "#e9dcc0", w: 384, h: 512 })
      add(scene, L.mid, place(K.bottle({ h: 3.0, r: 0.7, neck: 0.16, shoulder: 0.78, tint: 0xf0d6b0, liquid: 0xb2621f, square: true, label: serum, cap: 0x14110f }), 3.1, 0.05, 1.6, -0.35))
      const jarLabel = K.labelTexture({ title: "Balm", sub: "small batch", bg: "#0f4a4e", ink: "#efe4cc", w: 768, h: 256 })
      add(scene, L.mid, place(K.jar({ r: 1.2, h: 1.2, color: 0xe9e0cf, lid: 0x1b1b1d, label: jarLabel }), 5.4, 0.05, 0.4, 0.4))
      const boxLabel = K.labelTexture({ title: "Cozy", sub: "digital · studio", bg: "#101010", ink: "#55eef0", w: 512, h: 640 })
      const pack = K.box({ w: 2.6, h: 3.3, d: 1.6, color: 0xd9ccb2, label: boxLabel })
      add(scene, L.mid, place(pack, -2.6, 0.05, -1.4, 0.35))

      // the phone leans on the pack, playing the cut
      const ph = K.phone({ screen: screenArt({ hue: "teal", caption: "Cozy" }), glowPower: 9 })
      ph.rotation.set(-0.22, 0.3, 0)
      add(scene, L.mid, place(ph, -2.0, 1.65, 0.2, 0.32))

      const cam = K.cinemaCamera({})
      add(scene, L.mid, place(cam, 9.6, 0.05, -2.2, -0.65, 0.95))

      const plate = K.plate({ r: 2.3 })
      add(scene, L.mid, place(plate, -7.2, 0.05, 1.4))
      add(scene, L.mid, place(K.grapes({ s: 1.05 }), -7.6, 0.6, 1.2))
      add(scene, L.mid, place(K.pomegranate({ s: 1.0 }), -5.9, 1.15, 1.9))
      add(scene, L.mid, place(K.ewer({ h: 5.4, r: 1.35 }), -10.2, 0.05, -2.6, 0.5))
      const candle = K.candlestick({ h: 2.6, candle: 3.2 })
      add(scene, L.mid, place(candle, -4.6, 0.05, -3.2))

      // foreground fruit at the lip of the table
      add(scene, L.front, place(K.lemon({ s: 0.62 }), -3.4, 0.55, 3.5, 0.6))
      add(scene, L.front, place(K.lemon({ s: 0.58 }), -2.1, 0.5, 4.3, -0.9))
      add(scene, L.front, place(K.pear({ s: 0.8 }), 6.6, 0.05, 3.6, 0.2))

      K.keyLight(scene, { intensity: 5200, pos: [-16, 20, 16], target: [1, 1.5, 0], angle: 0.24, penumbra: 0.9 })
      K.rimLight(scene, { color: P.cyan, intensity: 520, pos: [14, 9, -8], target: [2, 2, 0], angle: 0.4 })
      K.fill(scene, { intensity: 0.06 })
      // a soft wash on the wall behind the group, the way a window would fall
      K.keyLight(scene, { color: 0xffc89a, intensity: 900, pos: [-6, 14, 10], target: [3, 7, -14], angle: 0.45, penumbra: 1, size: 512 })

      const c = camera(w, h, 27, [1.2, 8.2, 25.5], [1.2, 4.7, 0])
      // where the live glows sit on the page
      const marks = { candle: candle.userData.flame, screen: ph }
      return { scene, camera: c, layers: L, envIntensity: 0.18, marks }
    },
  },

  brand: {
    size: [1800, 1200],
    seed: 5,
    paint: { exposure: 1.2, radii: [4.5, 2.5], bristle: 0.18, impasto: 0.4, grain: 1.5, sigma: 2.6 },
    async build({ w, h }) {
      const { scene, L, env } = stage({ cloth: P.deepTeal, clothSheen: 0x9fe7e8, drape: null, key: { target: [0, 0, 0.5], angle: 0.3, pos: [-14, 24, 12], intensity: 2300 }, rim: { intensity: 260 } })
      const brief = K.sheet({ w: 4.2, d: 5.6, map: K.paperTexture(18), curl: 0.12 })
      add(scene, L.mid, place(brief, -2.6, 0.04, 0.6, 0.18))
      const prints = [
        await cropTexture("/site/media/hero.webp", [0.38, 0.28, 0.2, 0.42], "teal", [600, 760]),
        await cropTexture("/site/media/hero.webp", [0.03, 0.4, 0.22, 0.42], "ember", [600, 760]),
        await cropTexture("/site/media/hero.webp", [0.72, 0.3, 0.24, 0.42], "dusk", [600, 760]),
      ]
      add(scene, L.mid, place(K.sheet({ w: 2.4, d: 3.0, map: prints[0], curl: 0.05 }), 1.6, 0.06, 1.4, -0.25))
      add(scene, L.mid, place(K.sheet({ w: 2.4, d: 3.0, map: prints[1], curl: 0.05 }), 3.4, 0.08, 0.2, 0.3))
      add(scene, L.mid, place(K.sheet({ w: 2.4, d: 3.0, map: prints[2], curl: 0.05 }), 2.6, 0.1, -1.8, -0.05))
      const ph = K.phone({ screen: uploadScreen(), glowPower: 5 })
      ph.rotation.x = -Math.PI / 2
      add(scene, L.mid, place(ph, -6.6, 0.1, 1.6, 0.35))
      const pack = K.box({ w: 2.2, h: 2.8, d: 1.4, color: 0x101010, label: K.labelTexture({ title: "Cozy", sub: "logo · v2", bg: "#101010", ink: "#55eef0", w: 512, h: 640 }) })
      add(scene, L.mid, place(pack, 6.2, 0.05, -1.4, -0.5))
      add(scene, L.mid, place(K.seal({ r: 0.75 }), -0.6, 0.08, 3.6))
      add(scene, L.mid, place(K.lemon({ s: 0.55 }), 5.6, 0.5, 2.6, 0.9))
      const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0x0f4a4e, roughness: 0.5 }))
      pencil.rotation.set(0, 0.5, Math.PI / 2)
      add(scene, L.mid, place(K.shadow(pencil), -1.6, 0.14, 3.0, 0.5))
      const c = camera(w, h, 25, [0, 15, 14.5], [-0.4, 0, 0.8])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  agent: {
    size: [1600, 1200],
    seed: 9,
    paint: { exposure: 1.2, radii: [7, 3.5], bristle: 0.2, impasto: 0.45, grain: 1.7, sigma: 3.2 },
    build({ w, h }) {
      const { scene, L, env } = stage({ cloth: 0x14141a, clothSheen: 0x7db1f3, drape: P.deepTeal, drapeX: 9, key: { intensity: 2400, target: [-3, 1.5, 0] }, rim: { intensity: 300, pos: [-14, 9, -8] }, wash: { intensity: 500 } })
      add(scene, L.mid, place(K.stand({ r: 1.05, h: 1.0 }), 0, 0.05, 0))
      add(scene, L.mid, place(K.orb({ r: 1.7, power: 22 }), 0, 1.0, 0))
      const stack = new THREE.Group()
      const colors = [P.oxblood, 0x1d3a3e, 0x3a2a1a, 0x22222a]
      colors.forEach((c, i) => {
        const b = K.book({ w: 3.2 - i * 0.2, h: 0.62, d: 4.4 - i * 0.2, cover: c })
        b.position.y = i * 0.62
        b.rotation.y = (K.rnd() - 0.5) * 0.4
        stack.add(b)
      })
      add(scene, L.mid, place(stack, -5.4, 0.05, -0.6, 0.3))
      add(scene, L.mid, place(K.book({ w: 2.6, d: 3.6, open: true, cover: P.oxblood, pages: [pageTexture("chart"), pageTexture("table")] }), 5.2, 0.06, 1.2, -0.35))
      add(scene, L.mid, place(K.lens({ r: 0.8 }), -2.6, 0.12, 3.2, 0.6))
      const cs = K.candlestick({ h: 2.0, candle: 1.6, flicker: 0.5 })
      add(scene, L.mid, place(cs, -7.8, 2.53, -1.4))
      const c = camera(w, h, 30, [0, 6.5, 17], [0, 2.6, 0])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  deliver: {
    size: [1800, 1200],
    seed: 13,
    paint: { exposure: 1.25, radii: [7, 3.5], bristle: 0.2, impasto: 0.45, grain: 1.7, sigma: 3.2 },
    async build({ w, h }) {
      const { scene, L, env } = stage({ cloth: 0x4a0e14, drape: P.deepTeal, drapeX: -11, key: { target: [0, 2.5, 0], angle: 0.26 } })
      const tall = await cropTexture("/site/media/hero.webp", [0.4, 0.15, 0.17, 0.6], "teal", [540, 960])
      const square = await cropTexture("/site/media/hero.webp", [0.0, 0.25, 0.36, 0.72], "ember", [800, 800])
      const wide = await cropTexture("/site/media/hero.webp", [0.0, 0.0, 1.0, 1.0], "dusk", [1280, 640])
      const ph = K.phone({ w: 1.9, h: 3.9, screen: tall, glowPower: 10 })
      ph.rotation.x = -0.12
      add(scene, L.mid, place(ph, 0.4, 2.0, 1.2, -0.08))
      const sq = K.frame({ w: 3.2, h: 3.2, art: square, color: P.ink, border: 0.22 })
      sq.rotation.x = -0.1
      add(scene, L.mid, place(sq, -4.4, 1.85, -0.6, 0.3))
      const wd = K.frame({ w: 6.2, h: 3.1, art: wide, color: P.brass, border: 0.28 })
      wd.rotation.x = -0.08
      add(scene, L.mid, place(wd, 5.4, 1.8, -1.2, -0.35))
      for (const [x, z, ry] of [[-4.4, -0.3, 0.3], [5.4, -0.9, -0.35]]) {
        const easel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.8), K.metal(P.brass, 0.4))
        add(scene, L.mid, place(K.shadow(easel), x, 0.15, z + 0.5, ry))
      }
      add(scene, L.front, place(K.pomegranate({ s: 0.8 }), -2.0, 0.85, 3.6))
      add(scene, L.front, place(K.grapes({ s: 0.7 }), 2.6, 0.45, 3.4))
      const c = camera(w, h, 28, [0, 6.2, 19], [0.4, 2.4, 0])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  "f-product": {
    size: [1200, 900],
    seed: 31,
    paint: { exposure: 1.25, radii: [6, 3], bristle: 0.2, impasto: 0.45, grain: 1.6, sigma: 3 },
    build({ w, h }) {
      const { scene, L, env } = stage({ cloth: P.deepTeal, clothSheen: 0x9fe7e8, drape: 0x3b0d12, drapeX: 6, key: { target: [0, 2, 0], angle: 0.2 }, rim: { intensity: 700, pos: [10, 7, -6] } })
      const label = K.labelTexture({ title: "Cozy", sub: "eau de studio", bg: "#e9dcc0", accent: "#0f4a4e" })
      add(scene, L.mid, place(K.bottle({ h: 4.4, r: 1.0, neck: 0.25, shoulder: 0.7, tint: 0xd6f2ef, liquid: 0x127a7b, label, cap: 0x101010 }), 0, 0.05, 0, -0.15))
      add(scene, L.mid, place(K.lemon({ s: 0.62 }), 2.2, 0.55, 1.4, 0.4))
      add(scene, L.mid, place(K.lemon({ s: 0.55 }), -2.1, 0.5, 1.8, -1.2))
      add(scene, L.mid, place(K.bottle({ h: 2.6, r: 0.6, neck: 0.15, shoulder: 0.78, tint: 0xf0d6b0, liquid: 0xb2621f, square: true, cap: 0x14110f, label: K.labelTexture({ title: "No. 7", bg: "#14110f", ink: "#e9dcc0", w: 384, h: 512 }) }), -2.6, 0.05, -1.4, 0.3))
      const c = camera(w, h, 22, [0, 4.4, 15], [0, 2.4, 0])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  "f-social": {
    size: [1200, 900],
    seed: 37,
    paint: { exposure: 1.25, radii: [6, 3], bristle: 0.2, impasto: 0.45, grain: 1.6, sigma: 3 },
    async build({ w, h }) {
      const { scene, L, env } = stage({ cloth: 0x4a0e14, drape: P.deepTeal, drapeX: -8, key: { target: [0, 2, 0], angle: 0.2 } })
      const tall = await cropTexture("/site/media/f-product.webp", [0.28, 0.05, 0.42, 0.9], "dusk", [540, 960])
      const ph = K.phone({ w: 1.9, h: 3.9, screen: tall, glowPower: 12, glow: P.fuchsia })
      ph.rotation.x = -0.1
      add(scene, L.mid, place(ph, 0.2, 2.0, 0.2, -0.15))
      add(scene, L.mid, place(K.grapes({ s: 0.85 }), -2.6, 0.5, 1.0))
      add(scene, L.mid, place(K.pomegranate({ s: 0.85 }), 2.6, 0.9, 0.8))
      add(scene, L.mid, place(K.pomegranate({ s: 0.7 }), 3.6, 0.75, 2.2))
      add(scene, L.mid, place(K.plate({ r: 2.0 }), -2.6, 0.05, 0.8))
      const c = camera(w, h, 24, [0, 4.6, 15], [0, 2.2, 0])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  "f-logo": {
    size: [1200, 900],
    seed: 41,
    paint: { exposure: 1.2, radii: [4.5, 2.5], bristle: 0.18, impasto: 0.4, grain: 1.5, sigma: 2.6 },
    build({ w, h }) {
      const { scene, L, env } = stage({ cloth: 0x2e0a0f, clothSheen: 0xff9a8a, drape: null, key: { target: [0, 0, 0.5], angle: 0.22, pos: [-12, 22, 10], intensity: 2200 }, rim: { intensity: 200 } })
      add(scene, L.mid, place(K.envelope({ w: 5.2, d: 3.4, map: K.paperTexture(0, "#e4d6ba") }), 0, 0.05, 0.4, -0.12))
      add(scene, L.mid, place(K.seal({ r: 0.95, letter: "C" }), 0.1, 0.12, 0.25))
      add(scene, L.mid, place(K.candlestick({ h: 1.8, candle: 2.4 }), -4.6, 0.05, -1.6))
      add(scene, L.mid, place(K.seal({ r: 0.5, color: 0x0f4a4e }), 3.6, 0.06, 2.0))
      const c = camera(w, h, 26, [0, 11, 11], [0, 0.6, 0.4])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  "f-season": {
    size: [1200, 900],
    seed: 43,
    paint: { exposure: 1.25, radii: [6, 3], bristle: 0.2, impasto: 0.45, grain: 1.6, sigma: 3 },
    build({ w, h }) {
      const { scene, L, env } = stage({ cloth: 0x3a0b10, drape: 0x0a2f33, drapeX: -7, key: { target: [0, 1.5, 0], angle: 0.22, intensity: 3600 }, rim: { intensity: 220 } })
      add(scene, L.mid, place(K.plate({ r: 2.6 }), 0, 0.05, 0.6))
      add(scene, L.mid, place(K.pomegranate({ s: 1.0 }), -0.6, 1.1, 0.4))
      add(scene, L.mid, place(K.pomegranate({ s: 0.85 }), 1.2, 0.95, 1.2))
      add(scene, L.mid, place(K.grapes({ s: 0.8 }), 1.6, 0.6, -0.2))
      add(scene, L.mid, place(K.candlestick({ h: 2.4, candle: 2.6 }), -3.8, 0.05, -1.2))
      add(scene, L.mid, place(K.candlestick({ h: 1.6, candle: 1.8 }), 4.2, 0.05, -1.6))
      add(scene, L.mid, place(K.ewer({ h: 4.4, r: 1.1 }), 6.2, 0.05, -2.8, -0.8))
      const c = camera(w, h, 26, [0, 5, 15], [0.4, 2.1, 0])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  "f-memory": {
    size: [1200, 900],
    seed: 47,
    paint: { exposure: 1.25, radii: [6, 3], bristle: 0.2, impasto: 0.45, grain: 1.6, sigma: 3 },
    build({ w, h }) {
      const { scene, L, env } = stage({ cloth: null, drape: P.deepTeal, drapeX: 8, key: { target: [-1, 2, 0], angle: 0.24 } })
      const stack = new THREE.Group()
      ;[0x5c1118, 0x0f4a4e, 0x2a2018, 0x3b2a5a, 0x1b1b1d].forEach((c, i) => {
        const b = K.book({ w: 3.4 - (i % 2) * 0.3, h: 0.66, d: 4.6 - (i % 3) * 0.2, cover: c })
        b.position.y = i * 0.66
        b.rotation.y = (K.rnd() - 0.5) * 0.35
        stack.add(b)
      })
      add(scene, L.mid, place(stack, -1.6, 0.05, 0, 0.2))
      const jl = (t, bg) => K.labelTexture({ title: t, bg, ink: "#efe4cc", w: 768, h: 256 })
      add(scene, L.mid, place(K.jar({ r: 0.8, h: 0.9, color: 0xe9e0cf, label: jl("Logo", "#0f4a4e") }), -1.4, 3.35, 0.2, 0.3))
      add(scene, L.mid, place(K.jar({ r: 0.9, h: 1.0, color: 0xe9e0cf, label: jl("Tone", "#5c1118") }), 2.6, 0.05, 0.8, -0.2))
      add(scene, L.mid, place(K.jar({ r: 0.7, h: 0.8, color: 0xe9e0cf, label: jl("Palette", "#3b2a5a") }), 3.8, 0.05, -1.2, 0.1))
      add(scene, L.mid, place(K.lens({ r: 0.7 }), 0.8, 0.12, 2.6, -0.4))
      const c = camera(w, h, 26, [0, 5.2, 15], [0.6, 2.0, 0])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  "f-motion": {
    size: [1200, 900],
    seed: 53,
    paint: { exposure: 1.25, radii: [6, 3], bristle: 0.2, impasto: 0.45, grain: 1.6, sigma: 3 },
    async build({ w, h }) {
      const { scene, L, env } = stage({ cloth: 0x4a0e14, drape: null, key: { target: [0, 1.8, 0], angle: 0.24 }, rim: { intensity: 600 } })
      const art = await cropTexture("/site/media/hero.webp", [0.3, 0.1, 0.4, 0.8], "teal", [800, 800])
      const fr = K.frame({ w: 3.6, h: 3.6, art, color: P.brass, border: 0.32 })
      fr.rotation.x = -0.12
      add(scene, L.mid, place(fr, -1.2, 2.1, -0.8, 0.2))
      const img = await loadImage("/site/media/hero.webp")
      const frames = []
      if (img) {
        for (let i = 0; i < 6; i++) {
          const c = document.createElement("canvas")
          c.width = 300
          c.height = 200
          c.getContext("2d").drawImage(img, img.width * (0.05 + i * 0.13), img.height * 0.3, img.width * 0.22, img.height * 0.5, 0, 0, 300, 200)
          frames.push(c)
        }
      }
      const strip = K.filmStrip({ frames, length: 10, height: 1.5, bend: 2.2 })
      strip.rotation.set(-1.1, 0.35, 0.08)
      add(scene, L.mid, place(strip, 2.0, 0.9, 1.8, 0))
      const c = camera(w, h, 26, [0, 5, 15], [0.4, 1.9, 0])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  "f-review": {
    size: [1200, 900],
    seed: 59,
    paint: { exposure: 1.2, radii: [4.5, 2.5], bristle: 0.18, impasto: 0.4, grain: 1.5, sigma: 2.6 },
    async build({ w, h }) {
      const { scene, L, env } = stage({ cloth: P.deepTeal, clothSheen: 0x9fe7e8, drape: null, key: { target: [0, 0, 0.5], angle: 0.24, pos: [-12, 24, 12], intensity: 3000 }, rim: { intensity: 200 } })
      const prints = [
        await cropTexture("/site/media/f-product.webp", [0.2, 0.1, 0.6, 0.8], "teal", [600, 760]),
        await cropTexture("/site/media/f-season.webp", [0.2, 0.1, 0.6, 0.8], "ember", [600, 760]),
      ]
      add(scene, L.mid, place(K.sheet({ w: 3.0, d: 3.8, map: prints[0], curl: 0.05 }), -1.6, 0.06, 0.2, 0.15))
      add(scene, L.mid, place(K.sheet({ w: 3.0, d: 3.8, map: prints[1], curl: 0.05 }), 1.9, 0.08, -0.2, -0.2))
      const lensObj = K.lens({ r: 1.1 })
      add(scene, L.mid, place(lensObj, -0.6, 0.6, 1.4, 0.5))
      const note = K.sheet({ w: 2.2, d: 2.8, map: K.paperTexture(9), curl: 0.08 })
      add(scene, L.mid, place(note, 4.8, 0.05, 1.6, 0.4))
      add(scene, L.mid, place(K.seal({ r: 0.55, color: 0x0f4a4e }), 4.6, 0.12, 2.4))
      const c = camera(w, h, 28, [0, 12.5, 10.5], [0.6, 0, 0.6])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  "l-almanac": {
    size: [1000, 1250],
    seed: 61,
    paint: { exposure: 1.2, radii: [4.5, 2.5], bristle: 0.18, impasto: 0.4, grain: 1.5, sigma: 2.6 },
    build({ w, h }) {
      const { scene, L, env } = stage({ cloth: 0x2a2018, clothSheen: 0xffd8b0, drape: null, key: { target: [0, 0, 0.5], angle: 0.2, pos: [-10, 22, 10], intensity: 1900 }, rim: { intensity: 160 } })
      add(scene, L.mid, place(K.book({ w: 2.6, d: 3.6, open: true, cover: 0x3a2014, pages: [pageTexture("chart"), pageTexture("table")] }), 0, 0.06, 0.6, 0))
      add(scene, L.mid, place(K.candlestick({ h: 1.8, candle: 2.2 }), -2.8, 0.05, -2.4))
      add(scene, L.mid, place(K.lens({ r: 0.6 }), 2.4, 0.12, 2.6, -0.6))
      const c = camera(w, h, 30, [0, 10.5, 9], [0, 0.6, 0.2])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  "l-orbit": {
    size: [1000, 1250],
    seed: 67,
    paint: { exposure: 1.3, radii: [6, 3], bristle: 0.2, impasto: 0.45, grain: 1.6, sigma: 3 },
    build({ w, h }) {
      const { scene, L, env } = stage({ cloth: 0x0a2f33, clothSheen: 0x9fe7e8, drape: null, wall: 0x241c16, key: { target: [0, 3, 0], angle: 0.2, intensity: 4200 }, rim: { intensity: 700, pos: [10, 8, -6], target: [0, 3, 0] } })
      const arm = K.armillary({ r: 2.1 })
      arm.rotation.y = 0.5
      add(scene, L.mid, place(arm, 0, 0.05, 0))
      add(scene, L.mid, place(K.book({ w: 2.4, h: 0.5, d: 3.4, cover: 0x3a2014 }), -3.2, 0.05, 1.6, 0.4))
      const c = camera(w, h, 30, [0, 4.6, 13], [0, 3.0, 0])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  "l-estimate": {
    size: [1000, 1250],
    seed: 71,
    paint: { exposure: 1.2, radii: [4.5, 2.5], bristle: 0.18, impasto: 0.4, grain: 1.5, sigma: 2.6 },
    build({ w, h }) {
      const { scene, L, env } = stage({ cloth: 0x14141a, clothSheen: 0xb49df0, drape: null, key: { target: [0, 0, 0.5], angle: 0.2, pos: [-10, 22, 10], intensity: 2200 }, rim: { color: P.fuchsia, intensity: 300 } })
      const faces = [[3, 5, 1], [6, 2, 4], [1, 3, 5]]
      add(scene, L.mid, place(K.die({ s: 0.95, face: faces[0] }), -1.2, 0.05, 0.6, 0.4))
      add(scene, L.mid, place(K.die({ s: 0.95, face: faces[1] }), 0.4, 0.05, 1.4, -0.3))
      add(scene, L.mid, place(K.die({ s: 0.95, face: faces[2], color: 0x5c1118, pip: 0xefe4cc }), 1.4, 0.05, -0.2, 0.9))
      const face = (suit) =>
        K.canvasTexture(256, 368, (g, cw, ch) => {
          g.fillStyle = "#efe4cc"
          g.fillRect(0, 0, cw, ch)
          g.strokeStyle = "#14110f"
          g.lineWidth = 4
          g.strokeRect(12, 12, cw - 24, ch - 24)
          g.fillStyle = suit === "a" ? "#5c1118" : "#14110f"
          g.font = "600 120px Fraunces, Georgia, serif"
          g.textAlign = "center"
          g.textBaseline = "middle"
          g.fillText(suit === "a" ? "A" : "K", cw / 2, ch / 2)
        })
      for (let i = 0; i < 3; i++) {
        const cd = K.card({ w: 1.6, h: 2.3, face: face(i === 1 ? "a" : "k") })
        add(scene, L.mid, place(cd, -2.8 + i * 0.5, 0.02 + i * 0.022, -1.2 + i * 0.2, 0.5 - i * 0.35))
      }
      const formula = K.canvasTexture(1024, 512, (g, cw, ch) => {
        g.drawImage(K.paperTexture(0, "#d9c9a8").image, 0, 0, cw, ch)
        g.fillStyle = "rgba(24,16,10,0.95)"
        g.font = "600 104px Fraunces, Georgia, serif"
        g.textAlign = "center"
        g.textBaseline = "middle"
        g.fillText("δ₁(T) = E[ δ₀(X) | T ]", cw / 2, ch / 2)
      })
      add(scene, L.mid, place(K.sheet({ w: 3.4, d: 1.7, map: formula, curl: 0.06 }), 0.4, 0.04, 3.4, -0.08))
      const coinM = K.metal(P.pewter, 0.35)
      for (let i = 0; i < 7; i++) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 40), coinM)
        add(scene, L.mid, place(K.shadow(coin), 2.6 + (K.rnd() - 0.5) * 0.3, 0.09 + i * 0.075, 1.4 + (K.rnd() - 0.5) * 0.3))
      }
      const c = camera(w, h, 30, [0, 10, 9], [0.2, 0.4, 0.8])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  "l-cartridge": {
    size: [1000, 1250],
    seed: 73,
    paint: { exposure: 1.3, radii: [6, 3], bristle: 0.2, impasto: 0.45, grain: 1.6, sigma: 3 },
    build({ w, h }) {
      const { scene, L, env } = stage({ cloth: null, drape: null, wall: 0x241c16, key: { target: [0, 0.5, 0], angle: 0.22, pos: [-10, 22, 12] }, rim: { intensity: 500 } })
      const label = K.canvasTexture(512, 480, (g, cw, ch) => {
        g.fillStyle = "#101010"
        g.fillRect(0, 0, cw, ch)
        const bands = ["#55eef0", "#7db1f3", "#b49df0", "#efe4cc"]
        bands.forEach((c, i) => {
          g.fillStyle = c
          g.fillRect(0, 60 + i * 46, cw, 30)
        })
        g.fillStyle = "#efe4cc"
        g.font = "600 70px Fraunces, Georgia, serif"
        g.fillText("Game 01", 30, 380)
      })
      const cart = K.cartridge({ label })
      add(scene, L.mid, place(cart, -0.6, 0.05, 1.4, 0.35))
      // an abstract console: a block with a slot, not any real machine
      const wood = K.woodTexture("#5a3a22")
      const block = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 4), [
        new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.5 }),
        new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.5 }),
        new THREE.MeshStandardMaterial({ map: wood, roughness: 0.5 }),
        new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.5 }),
        new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.5 }),
        new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.5 }),
      ])
      block.position.y = 0.8
      const slot = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 0.6), new THREE.MeshBasicMaterial({ color: 0x050505 }))
      slot.position.set(0, 1.62, -0.6)
      const group = new THREE.Group()
      group.add(block, slot)
      add(scene, L.mid, place(K.shadow(group), 1.0, 0.05, -2.6, -0.2))
      const c = camera(w, h, 30, [0, 9.5, 10], [0.3, 0.5, 0])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },

  cta: {
    size: [2400, 1100],
    layers: ["back", "mid", "front"],
    seed: 79,
    paint: { exposure: 1.25, radii: [8, 4], bristle: 0.2, impasto: 0.45, grain: 1.7, sigma: 3.2, vignette: 0.5 },
    build({ w, h }) {
      const { scene, L, env } = stage({ cloth: P.deepTeal, clothSheen: 0x9fe7e8, clothRange: [-20, 20], drape: 0x3b0d12, drapeX: 14, key: { target: [3, 1, 1], angle: 0.2, intensity: 3600 } })
      add(scene, L.mid, place(K.envelope({ w: 5.2, d: 3.4, map: K.paperTexture(0, "#cdbf9f") }), 3.4, 0.05, 1.6, -0.18))
      add(scene, L.mid, place(K.seal({ r: 0.9, letter: "C" }), 3.5, 0.12, 1.45))
      add(scene, L.mid, place(K.candlestick({ h: 2.6, candle: 3.0 }), 0.2, 0.05, -1.8))
      add(scene, L.mid, place(K.plate({ r: 2.0 }), -2.4, 0.05, 0.6))
      add(scene, L.mid, place(K.grapes({ s: 0.85 }), -2.6, 0.55, 0.4))
      const label = K.labelTexture({ title: "Cozy", sub: "eau de studio", bg: "#e9dcc0", accent: "#0f4a4e" })
      add(scene, L.mid, place(K.bottle({ h: 4.0, r: 0.9, neck: 0.22, shoulder: 0.7, tint: 0xd6f2ef, liquid: 0x127a7b, label, cap: 0x101010 }), 7.6, 0.05, -1.0, -0.3))
      add(scene, L.front, place(K.pomegranate({ s: 0.8 }), 0.6, 0.8, 4.2))
      add(scene, L.front, place(K.lemon({ s: 0.55 }), 6.6, 0.5, 4.0, 0.8))
      const c = camera(w, h, 19, [3.2, 7.4, 24], [3.2, 2.4, 0])
      return { scene, camera: c, layers: L, envIntensity: env }
    },
  },
}

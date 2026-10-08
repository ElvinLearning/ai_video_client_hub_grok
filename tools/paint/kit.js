import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js"

/** Props for the still lifes. Units are roughly decimetres. Everything is procedural. */

export const palette = {
  umber: 0x2a1d14,
  wall: 0x3a2c22,
  teal: 0x0f4a4e,
  deepTeal: 0x0a2f33,
  oxblood: 0x5c1118,
  ochre: 0xc9962e,
  lemon: 0xe0b23a,
  ivory: 0xefe4cc,
  brass: 0xb08a4a,
  pewter: 0x8a8a86,
  ink: 0x14110f,
  cyan: 0x55eef0,
  blue: 0x7db1f3,
  fuchsia: 0xb49df0,
}

let seed = 7
export function reseed(n) {
  seed = n
}
export function rnd() {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
const range = (a, b) => a + (b - a) * rnd()

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}
export function vnoise(x, y, z = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz)
  const l = (a, b, t) => a + (b - a) * t
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz)
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  )
}
export function fbm(x, y, z = 0, oct = 4) {
  let a = 0.5, s = 0
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x, y, z)
    x *= 2.03; y *= 2.03; z *= 2.03
    a *= 0.5
  }
  return s
}

// ---------- canvas textures ----------

export function canvasTexture(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const g = c.getContext("2d")
  draw(g, w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.anisotropy = 8
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

export function noiseCanvas(w, h, scale, contrast = 1, base = 128) {
  return canvasTexture(
    w,
    h,
    (g) => {
      const img = g.createImageData(w, h)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const n = fbm((x / w) * scale, (y / h) * scale, 0, 4) - 0.5
          const v = Math.max(0, Math.min(255, base + n * 255 * contrast))
          const i = (y * w + x) * 4
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v
          img.data[i + 3] = 255
        }
      }
      g.putImageData(img, 0, 0)
    },
    { srgb: false, repeat: true },
  )
}

export function woodTexture(tone = "#5a3a22") {
  return canvasTexture(
    1024,
    512,
    (g, w, h) => {
      g.fillStyle = tone
      g.fillRect(0, 0, w, h)
      for (let i = 0; i < 260; i++) {
        const y = rnd() * h
        g.strokeStyle = `rgba(${rnd() < 0.5 ? "20,10,4" : "120,80,45"},${range(0.05, 0.22)})`
        g.lineWidth = range(0.6, 3.2)
        g.beginPath()
        g.moveTo(0, y)
        for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 4 + (fbm(x * 0.004, i * 0.3) - 0.5) * 18)
        g.stroke()
      }
    },
    { repeat: true },
  )
}

export function plasterTexture(color = "#3a2c22") {
  return canvasTexture(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = color
      g.fillRect(0, 0, w, h)
      const img = g.getImageData(0, 0, w, h)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const n = fbm(x / 90, y / 90, 3, 5) - 0.5
          const i = (y * w + x) * 4
          for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, img.data[i + k] * (1 + n * 0.55)))
        }
      }
      g.putImageData(img, 0, 0)
    },
    { repeat: true },
  )
}

export function paperTexture(lines = 0, tone = "#e9dcc0") {
  return canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = tone
    g.fillRect(0, 0, w, h)
    const img = g.getImageData(0, 0, w, h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = fbm(x / 120, y / 120, 9, 4) - 0.5
        const i = (y * w + x) * 4
        img.data[i] *= 1 + n * 0.25
        img.data[i + 1] *= 1 + n * 0.28
        img.data[i + 2] *= 1 + n * 0.34
      }
    }
    g.putImageData(img, 0, 0)
    g.fillStyle = "rgba(34,24,16,0.8)"
    const step = Math.max(46, (h - 180) / Math.max(1, lines))
    for (let i = 0; i < lines; i++) {
      const y = 100 + i * step
      if (y > h - 80) break
      let x = 80
      const end = i % 4 === 3 ? w * 0.55 : w - 80
      while (x < end) {
        const len = range(30, 120)
        g.fillRect(x, y, Math.min(len, end - x), 11)
        x += len + range(16, 30)
      }
    }
  })
}

export function labelTexture({ bg = "#efe4cc", ink = "#14110f", title = "COZY", sub = "", accent = null, w = 512, h = 512, serif = true }) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    g.strokeStyle = ink
    g.lineWidth = Math.max(2, w * 0.008)
    g.strokeRect(w * 0.08, h * 0.08, w * 0.84, h * 0.84)
    if (accent) {
      g.fillStyle = accent
      g.fillRect(w * 0.08, h * 0.62, w * 0.84, h * 0.05)
    }
    g.fillStyle = ink
    g.textAlign = "center"
    g.textBaseline = "middle"
    g.font = `${serif ? "600" : "500"} ${Math.round(h * 0.17)}px ${serif ? "Fraunces, Georgia, serif" : "Outfit, sans-serif"}`
    g.fillText(title, w / 2, h * 0.42)
    if (sub) {
      g.font = `500 ${Math.round(h * 0.06)}px Outfit, sans-serif`
      g.fillText(sub.toUpperCase(), w / 2, h * 0.76)
    }
  })
}

export function imageTexture(url) {
  const tex = new THREE.TextureLoader().load(url)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ---------- materials ----------

const bumpNoise = () => noiseCanvas(256, 256, 18, 0.9)
let sharedBump = null
export function bump() {
  if (!sharedBump) sharedBump = bumpNoise()
  return sharedBump
}

export function velvet(color, sheenColor = 0xffffff) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.92,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(sheenColor).multiplyScalar(0.35),
    side: THREE.DoubleSide,
  })
}

export function linen(color = palette.ivory) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide, bumpMap: bump(), bumpScale: 0.6 })
}

export function metal(color, roughness = 0.32) {
  return new THREE.MeshStandardMaterial({ color, metalness: 1, roughness })
}

export function glass(tint = 0xffffff, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    metalness: 0,
    roughness: 0.04,
    transmission: 1,
    thickness: opts.thickness ?? 0.4,
    ior: 1.5,
    attenuationColor: new THREE.Color(opts.attenuation ?? tint),
    attenuationDistance: opts.distance ?? 2.5,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    specularIntensity: 1,
    envMapIntensity: opts.env ?? 1.4,
    side: THREE.DoubleSide,
  })
}

export function glaze(color, roughness = 0.18) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: 1, clearcoatRoughness: 0.08, bumpMap: bump(), bumpScale: 0.08 })
}

// ---------- helpers ----------

export function shadow(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast
      o.receiveShadow = receive
    }
  })
  return obj
}

function lathe(points, segments = 96) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments)
}

/** Smooth a lathe profile through control points. */
function profile(ctrl, steps = 64) {
  const curve = new THREE.SplineCurve(ctrl.map(([x, y]) => new THREE.Vector2(x, y)))
  return curve.getPoints(steps).map((p) => [Math.max(0.0001, p.x), p.y])
}

// ---------- environment ----------

export function room({ wall = palette.wall, floorY = 0 } = {}) {
  const group = new THREE.Group()
  const tex = plasterTexture(`#${new THREE.Color(wall).getHexString()}`)
  tex.repeat.set(3, 2)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }))
  back.position.set(0, floorY + 12, -14)
  back.receiveShadow = true
  group.add(back)
  return group
}

export function table({ width = 30, depth = 12, height = 0, tone = "#4a2f1c" } = {}) {
  const tex = woodTexture(tone)
  tex.repeat.set(2, 1)
  const top = new THREE.Mesh(
    new RoundedBoxGeometry(width, 1.2, depth, 3, 0.15),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, bumpMap: tex, bumpScale: 0.3 }),
  )
  top.position.y = height - 0.6
  const g = new THREE.Group()
  g.add(top)
  return shadow(g)
}

/**
 * Cloth laid on a table top that spills over the front edge in folds.
 * `x0..x1` along the table, `back..edge` in depth, then falls by `drop`.
 */
export function tablecloth({ x0 = -6, x1 = 6, back = -4, edge = 6, drop = 6, folds = 7, material, y = 0.02, amp = 0.35 }) {
  const segX = 180
  const segZ = 160
  const geo = new THREE.PlaneGeometry(1, 1, segX, segZ)
  const pos = geo.attributes.position
  const depthLen = edge - back
  const total = depthLen + drop
  const ph = rnd() * 10
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5
    const v = pos.getY(i) + 0.5
    const x = x0 + (x1 - x0) * u
    const s = v * total
    let px = x
    let py = y
    let pz
    const foldPhase = Math.sin(u * folds * Math.PI * 2 + ph + fbm(u * 3, 1.3) * 3)
    const fn = fbm(u * 6, s * 0.4, 2)
    if (s <= depthLen) {
      pz = back + s
      const ripple = foldPhase * amp * 0.25 * Math.max(0, (s - depthLen * 0.4) / depthLen) + (fn - 0.5) * 0.25
      py = y + Math.max(0, ripple)
    } else {
      const d = s - depthLen
      const r = 0.35
      const ang = Math.min(Math.PI / 2, d / r)
      const along = Math.max(0, d - r * Math.PI / 2)
      pz = edge + Math.sin(ang) * r
      py = y - (1 - Math.cos(ang)) * r - along
      const k = Math.min(1, d / 1.5)
      pz += foldPhase * amp * (0.4 + d * 0.25) * k + (fn - 0.5) * 0.4 * k
      px += Math.sin(u * folds * Math.PI + ph) * 0.15 * k
    }
    pos.setXYZ(i, px, py, pz)
  }
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  return shadow(mesh)
}

/** Hanging drape, folds deepening toward the floor, gathered near the top. */
export function curtain({ width = 14, height = 20, folds = 9, amp = 0.9, material, gather = 0.5 }) {
  const geo = new THREE.PlaneGeometry(width, height, 220, 160)
  const pos = geo.attributes.position
  const ph = rnd() * 10
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const v = (y + height / 2) / height // 0 bottom, 1 top
    const u = x / width + 0.5
    const depth = amp * (0.35 + (1 - v) * 0.9)
    const z =
      Math.sin(u * folds * Math.PI * 2 + ph + fbm(u * 2.5, v * 1.5) * 2.4) * depth +
      Math.sin(u * folds * 5.3 + ph * 2) * depth * 0.18 +
      (fbm(u * 5, v * 3, 4) - 0.5) * 0.8
    const pinch = 1 - gather * Math.pow(v, 3) * 0.25
    pos.setXYZ(i, x * pinch, y, z)
  }
  geo.computeVertexNormals()
  return shadow(new THREE.Mesh(geo, material))
}

// ---------- vessels ----------

export function bottle({ h = 3.2, r = 0.8, neck = 0.22, shoulder = 0.75, tint = 0xbfe8e6, liquid = 0x0f6d6f, fill = 0.7, cap = palette.ink, label = null, square = false }) {
  const g = new THREE.Group()
  const pts = profile([
    [0.0001, 0],
    [r * 0.92, 0.01],
    [r, 0.12],
    [r, h * shoulder - 0.4],
    [r * 0.75, h * shoulder],
    [neck * 1.25, h * shoulder + 0.35],
    [neck, h * 0.9],
    [neck, h],
  ])
  let body
  if (square) {
    body = new THREE.Mesh(new RoundedBoxGeometry(r * 2, h * shoulder + 0.1, r * 1.3, 6, 0.28), glass(tint, { thickness: 1.2, distance: 3 }))
    body.position.y = (h * shoulder + 0.1) / 2
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(neck, neck * 1.2, h * (1 - shoulder), 48), glass(tint))
    neckMesh.position.y = h * shoulder + (h * (1 - shoulder)) / 2
    g.add(body, neckMesh)
    const liq = new THREE.Mesh(new RoundedBoxGeometry(r * 1.8, (h * shoulder) * fill, r * 1.1, 4, 0.22), new THREE.MeshPhysicalMaterial({ color: liquid, transmission: 0.85, roughness: 0.1, thickness: 1, attenuationColor: new THREE.Color(liquid), attenuationDistance: 0.8 }))
    liq.position.y = ((h * shoulder) * fill) / 2 + 0.06
    g.add(liq)
  } else {
    body = new THREE.Mesh(lathe(pts), glass(tint, { thickness: 0.6 }))
    g.add(body)
    const inner = pts.filter(([, y]) => y < h * shoulder * fill).map(([x, y]) => [Math.max(0.0001, x - 0.06), y + 0.04])
    inner.push([0.0001, inner[inner.length - 1][1]])
    const liq = new THREE.Mesh(lathe(inner), new THREE.MeshPhysicalMaterial({ color: liquid, transmission: 0.8, roughness: 0.08, thickness: 1.5, attenuationColor: new THREE.Color(liquid), attenuationDistance: 0.6, ior: 1.36 }))
    g.add(liq)
  }
  if (cap) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(neck * 1.6, neck * 1.6, h * 0.22, 48), new THREE.MeshPhysicalMaterial({ color: cap, roughness: 0.25, clearcoat: 1 }))
    c.position.y = h + h * 0.1
    g.add(c)
  }
  if (label) {
    const lw = square ? r * 1.4 : r * 2 * Math.PI * 0.33
    const lh = h * shoulder * 0.45
    let lab
    if (square) {
      lab = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshStandardMaterial({ map: label, roughness: 0.7 }))
      lab.position.set(0, h * shoulder * 0.45, r * 0.651)
    } else {
      lab = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.012, r + 0.012, lh, 64, 1, true, -Math.PI * 0.33, Math.PI * 0.66), new THREE.MeshStandardMaterial({ map: label, roughness: 0.7 }))
      lab.position.y = h * shoulder * 0.42
    }
    g.add(lab)
  }
  return shadow(g)
}

export function jar({ r = 1.1, h = 1.3, color = palette.ivory, lid = palette.ink, label = null }) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(lathe(profile([[0.0001, 0], [r * 0.9, 0], [r, 0.15], [r, h - 0.1], [r * 0.96, h]]), 64), glaze(color, 0.25))
  const cap = new THREE.Mesh(new RoundedBoxGeometry(r * 2.04, h * 0.42, r * 2.04, 4, 0.12), new THREE.MeshPhysicalMaterial({ color: lid, roughness: 0.3, clearcoat: 1 }))
  // round lid instead of box
  const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, h * 0.4, 64), cap.material)
  lidMesh.position.y = h + h * 0.2
  g.add(body, lidMesh)
  if (label) {
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.01, r + 0.01, h * 0.55, 64, 1, true, -0.8, 1.6), new THREE.MeshStandardMaterial({ map: label, roughness: 0.6 }))
    lab.position.y = h * 0.5
    g.add(lab)
  }
  return shadow(g)
}

export function ewer({ h = 4.2, r = 1.2, color = palette.pewter }) {
  const pts = profile([[0.0001, 0], [r * 0.6, 0.02], [r * 0.7, 0.3], [r, h * 0.35], [r * 0.85, h * 0.6], [r * 0.42, h * 0.8], [r * 0.5, h * 0.95], [r * 0.56, h]])
  const g = new THREE.Group()
  g.add(new THREE.Mesh(lathe(pts), metal(color, 0.38)))
  const handle = new THREE.Mesh(new THREE.TorusGeometry(h * 0.22, 0.09, 12, 48, Math.PI * 1.15), metal(color, 0.38))
  handle.rotation.z = -Math.PI * 0.55
  handle.position.set(r * 0.78, h * 0.62, 0)
  g.add(handle)
  return shadow(g)
}

export function candlestick({ h = 2.2, candle = 3.4, lit = true, color = palette.brass, flicker = 1 }) {
  const g = new THREE.Group()
  const pts = profile([[0.0001, 0], [0.95, 0.02], [0.9, 0.18], [0.4, 0.35], [0.22, 0.7], [0.3, h * 0.55], [0.18, h * 0.75], [0.42, h * 0.95], [0.46, h]])
  g.add(new THREE.Mesh(lathe(pts), metal(color, 0.3)))
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, candle, 32), new THREE.MeshPhysicalMaterial({ color: 0xf2e6cf, roughness: 0.55, transmission: 0.25, thickness: 0.6 }))
  wax.position.y = h + candle / 2
  g.add(wax)
  if (lit) {
    const top = h + candle
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.82, 0.45).multiplyScalar(14) }))
    flame.scale.set(1, 2.6, 1)
    flame.position.y = top + 0.36
    flame.castShadow = false
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.6, 0.25).multiplyScalar(0.5), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }))
    halo.scale.set(1, 1.6, 1)
    halo.position.y = top + 0.4
    g.add(flame, halo)
    const light = new THREE.PointLight(0xffb36b, 22 * flicker, 26, 2)
    light.position.y = top + 0.5
    light.castShadow = true
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.radius = 6
    light.shadow.bias = -0.002
    g.add(light)
    g.userData.flame = flame
  }
  shadow(g)
  g.traverse((o) => {
    if (o.material?.blending === THREE.AdditiveBlending || o === g.userData.flame) {
      o.castShadow = false
      o.receiveShadow = false
    }
  })
  return g
}

// ---------- fruit ----------

function blobGeometry(r, wobble, seedOffset, detail = 64) {
  let geo = new THREE.SphereGeometry(r, detail, Math.round(detail * 0.75))
  geo.deleteAttribute("uv")
  geo = mergeVertices(geo)
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = fbm(v.x * 1.4 + seedOffset, v.y * 1.4, v.z * 1.4, 3) - 0.5
    v.multiplyScalar(1 + n * wobble)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

export function lemon({ s = 1, color = palette.lemon }) {
  const geo = blobGeometry(0.9 * s, 0.12, rnd() * 50)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (0.9 * s)
    const tip = Math.pow(Math.abs(x), 8) * 0.22
    pos.setX(i, pos.getX(i) * 1.14 * (1 + tip))
    pos.setY(i, pos.getY(i) * 0.86)
    pos.setZ(i, pos.getZ(i) * 0.86)
  }
  geo.computeVertexNormals()
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4, bumpMap: bump(), bumpScale: 1.6 })
  return shadow(new THREE.Mesh(geo, m))
}

export function pomegranate({ s = 1 }) {
  const g = new THREE.Group()
  const geo = blobGeometry(1.0 * s, 0.1, rnd() * 50)
  const body = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0x7a1a1c, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25, bumpMap: bump(), bumpScale: 0.6 }))
  body.scale.y = 0.92
  g.add(body)
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 0.38 * s, 6), new THREE.MeshStandardMaterial({ color: 0x5a1416, roughness: 0.6 }))
    const a = (i / 6) * Math.PI * 2
    c.position.set(Math.cos(a) * 0.13 * s, 0.98 * s, Math.sin(a) * 0.13 * s)
    c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)
    g.add(c)
  }
  return shadow(g)
}

export function pear({ s = 1, color = 0xa8a24a }) {
  const pts = profile([[0.0001, 0], [0.55, 0.05], [0.95, 0.55], [0.85, 1.2], [0.48, 1.75], [0.3, 2.2], [0.12, 2.42], [0.0001, 2.45]]).map(([x, y]) => [x * s, y * s])
  const g = new THREE.Group()
  const body = new THREE.Mesh(lathe(pts, 64), new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.3, bumpMap: bump(), bumpScale: 0.8 }))
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.06 * s, 0.6 * s, 8), new THREE.MeshStandardMaterial({ color: 0x3a2814, roughness: 0.8 }))
  stem.position.y = 2.65 * s
  stem.rotation.z = 0.3
  g.add(body, stem)
  return shadow(g)
}

export function grapes({ s = 1, color = 0x2a1630, count = 34 }) {
  const g = new THREE.Group()
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, clearcoat: 0.5, sheen: 0.6, sheenColor: new THREE.Color(0x6a6a80), sheenRoughness: 0.5 })
  const geo = new THREE.SphereGeometry(0.32 * s, 24, 16)
  for (let i = 0; i < count; i++) {
    const t = i / count
    const y = (1 - t) * 2.2 * s
    const rad = (0.2 + t * 0.85) * s * (1 - t * 0.35) * 1.1
    const a = i * 2.4
    const grape = new THREE.Mesh(geo, m)
    grape.position.set(Math.cos(a) * rad * rnd(), y - rnd() * 0.3, Math.sin(a) * rad * rnd())
    grape.scale.setScalar(range(0.85, 1.1))
    g.add(grape)
  }
  return shadow(g)
}

export function plate({ r = 2.4, color = palette.pewter }) {
  const pts = profile([[0.0001, 0], [r * 0.6, 0], [r * 0.66, 0.08], [r * 0.95, 0.22], [r, 0.26], [r * 0.98, 0.3], [r * 0.62, 0.14], [0.0001, 0.12]])
  return shadow(new THREE.Mesh(lathe(pts, 96), metal(color, 0.34)))
}

// ---------- objects ----------

export function box({ w = 2, h = 2.4, d = 1.2, color = palette.ivory, label = null, radius = 0.06 }) {
  const mats = Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial({ color, roughness: 0.55 }))
  if (label) mats[4] = new THREE.MeshStandardMaterial({ map: label, roughness: 0.55 })
  const geo = new RoundedBoxGeometry(w, h, d, 3, radius)
  // RoundedBoxGeometry has no groups; assign front face material by splitting
  const mesh = new THREE.Mesh(geo, mats[0])
  const g = new THREE.Group()
  g.add(mesh)
  if (label) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w - radius * 2, h - radius * 2), mats[4])
    face.position.z = d / 2 + 0.002
    g.add(face)
  }
  mesh.position.y = 0
  g.children.forEach((c) => (c.position.y += h / 2))
  return shadow(g)
}

export function book({ w = 3, h = 0.6, d = 4.2, cover = palette.oxblood, open = false, pages = null }) {
  const g = new THREE.Group()
  const coverMat = new THREE.MeshStandardMaterial({ color: cover, roughness: 0.75, bumpMap: bump(), bumpScale: 0.4 })
  const pageMat = new THREE.MeshStandardMaterial({ color: 0xe6d8bb, roughness: 0.9 })
  if (!open) {
    const c = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.05), coverMat)
    const p = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, h - 0.1, d - 0.16), pageMat)
    p.position.x = 0.06
    c.position.y = p.position.y = h / 2
    g.add(c, p)
  } else {
    // two curved leaves
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(w, d, 40, 2)
      const pos = geo.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + w / 2
        const t = x / w
        pos.setXYZ(i, side * x, Math.sin(t * Math.PI * 0.5) * 0.35 * (1 - t * 0.6) + 0.18, -pos.getY(i))
      }
      geo.computeVertexNormals()
      const leafMat = pages ? new THREE.MeshStandardMaterial({ map: pages[side < 0 ? 0 : 1], roughness: 0.9, side: THREE.DoubleSide }) : pageMat
      const leaf = new THREE.Mesh(geo, leafMat)
      if (side < 0) {
        // mirror UVs so text reads correctly
        const uv = geo.attributes.uv
        for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i))
      }
      leaf.rotation.x = 0
      g.add(leaf)
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), pageMat)
      block.position.set(side * w / 2, 0.08, 0)
      g.add(block)
    }
    const c = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.2, 0.06, d + 0.2), coverMat)
    c.position.y = 0.0
    g.add(c)
    g.children.forEach((ch) => {
      if (ch.geometry.type === "PlaneGeometry") ch.rotation.x = 0
    })
  }
  return shadow(g)
}

export function phone({ w = 1.6, h = 3.3, d = 0.18, screen = null, glow = palette.cyan, glowPower = 6 }) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 6, 0.08), new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.25, metalness: 0.4, clearcoat: 1 }))
  g.add(body)
  if (screen) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h * 0.94), new THREE.MeshBasicMaterial({ map: screen, toneMapped: false }))
    s.material.color.setScalar(1.6)
    s.position.z = d / 2 + 0.003
    s.castShadow = false
    g.add(s)
  }
  if (glow) {
    const light = new THREE.PointLight(glow, glowPower, 9, 2)
    light.position.set(0, 0, 1.1)
    g.add(light)
  }
  shadow(g)
  g.children.forEach((c) => {
    if (c.material?.isMeshBasicMaterial) c.castShadow = false
  })
  return g
}

export function cinemaCamera({ color = 0x1b1b1d }) {
  const g = new THREE.Group()
  const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0.5, clearcoat: 0.6, bumpMap: bump(), bumpScale: 0.2 })
  const trim = metal(palette.pewter, 0.3)
  const body = new THREE.Mesh(new RoundedBoxGeometry(3.6, 2.4, 1.8, 4, 0.2), bodyMat)
  body.position.y = 1.2
  g.add(body)
  for (const [x, r] of [[-0.9, 1.15], [1.0, 1.05]]) {
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.42, 64), bodyMat)
    reel.rotation.x = Math.PI / 2
    reel.position.set(x, 2.4 + r * 0.92, 0)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.25, 0.46, 32), trim)
    hub.rotation.x = Math.PI / 2
    hub.position.copy(reel.position)
    g.add(reel, hub)
    for (let k = 0; k < 3; k++) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.47, 24), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }))
      hole.rotation.x = Math.PI / 2
      const a = (k / 3) * Math.PI * 2 + 0.4
      hole.position.set(x + Math.cos(a) * r * 0.58, reel.position.y + Math.sin(a) * r * 0.58, 0)
      g.add(hole)
    }
  }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 1.6, 64), trim)
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(-2.5, 1.25, 0)
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.25, 64), bodyMat)
  ring.rotation.z = Math.PI / 2
  ring.position.set(-3.2, 1.25, 0)
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.58, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), glass(0x6fd6d8, { thickness: 0.4, env: 2 }))
  lens.rotation.z = Math.PI / 2
  lens.position.set(-3.33, 1.25, 0)
  const view = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.1, 32), bodyMat)
  view.rotation.z = Math.PI / 2
  view.position.set(2.2, 1.7, 0.55)
  g.add(barrel, ring, lens, view)
  return shadow(g)
}

export function orb({ r = 1.4, core = palette.cyan, power = 18 }) {
  const g = new THREE.Group()
  const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), glass(0xdff7f7, { thickness: r * 2, distance: 8, env: 1.6 }))
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.2, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(core).multiplyScalar(3) }))
  const haze = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(core).multiplyScalar(0.35), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }))
  shell.position.y = inner.position.y = haze.position.y = r
  g.add(shell, inner, haze)
  const light = new THREE.PointLight(core, power, 18, 2)
  light.position.y = r
  g.add(light)
  shell.castShadow = false
  shell.receiveShadow = true
  return g
}

export function stand({ r = 1, h = 0.9, color = palette.brass }) {
  const pts = profile([[0.0001, 0], [r * 1.2, 0.02], [r * 1.15, 0.2], [r * 0.5, 0.4], [r * 0.35, h * 0.75], [r * 0.85, h], [r * 0.8, h + 0.05], [0.0001, h + 0.05]])
  return shadow(new THREE.Mesh(lathe(pts), metal(color, 0.32)))
}

export function armillary({ r = 2, color = palette.brass }) {
  const g = new THREE.Group()
  const m = metal(color, 0.28)
  const rings = [
    [0, 0, 0],
    [Math.PI / 2, 0, 0],
    [0, Math.PI / 2, 0],
    [Math.PI / 2, 0, 0.41],
    [0.41, 0, Math.PI / 2],
  ]
  for (const [i, rot] of rings.entries()) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * (1 - i * 0.03), 0.055, 12, 160), m)
    ring.rotation.set(...rot)
    g.add(ring)
  }
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, r * 2.5, 12), m)
  axis.rotation.z = 0.41
  g.add(axis)
  const globe = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 48, 32), new THREE.MeshPhysicalMaterial({ color: 0x1d4b52, roughness: 0.35, clearcoat: 1 }))
  g.add(globe)
  g.position.y = r + 1.1
  const base = stand({ r: 0.9, h: 1.1, color })
  const out = new THREE.Group()
  out.add(g, base)
  return shadow(out)
}

export function die({ s = 0.8, color = palette.ivory, pip = palette.ink, face = [1, 2, 3] }) {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(new RoundedBoxGeometry(s, s, s, 4, s * 0.12), new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1 })))
  const pipGeo = new THREE.SphereGeometry(s * 0.085, 16, 12)
  const pipMat = new THREE.MeshStandardMaterial({ color: pip, roughness: 0.4 })
  const layouts = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, 1], [-1, 1], [1, -1]],
    5: [[-1, -1], [1, 1], [-1, 1], [1, -1], [0, 0]],
    6: [[-1, -1], [1, 1], [-1, 1], [1, -1], [-1, 0], [1, 0]],
  }
  const faces = [
    [new THREE.Vector3(0, 1, 0), face[0]],
    [new THREE.Vector3(0, 0, 1), face[1]],
    [new THREE.Vector3(1, 0, 0), face[2]],
  ]
  for (const [n, count] of faces) {
    const u = Math.abs(n.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const v = new THREE.Vector3().crossVectors(n, u)
    for (const [a, b] of layouts[count]) {
      const p = new THREE.Mesh(pipGeo, pipMat)
      p.position.copy(n.clone().multiplyScalar(s * 0.47)).addScaledVector(u, a * s * 0.25).addScaledVector(v, b * s * 0.25)
      p.scale.set(1, 1, 1)
      g.add(p)
    }
  }
  g.position.y = s / 2
  const out = new THREE.Group()
  out.add(g)
  return shadow(out)
}

export function card({ w = 1.6, h = 2.3, face }) {
  const mat = new THREE.MeshStandardMaterial({ map: face, roughness: 0.6 })
  const back = new THREE.MeshStandardMaterial({ color: palette.deepTeal, roughness: 0.6 })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, h), [back, back, mat, back, back, back])
  mesh.position.y = 0.01
  return shadow(mesh)
}

export function cartridge({ label, color = 0x1a1a1c }) {
  const g = new THREE.Group()
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.3, bumpMap: bump(), bumpScale: 0.15 })
  const shell = new THREE.Mesh(new RoundedBoxGeometry(3.4, 0.55, 4.2, 4, 0.12), m)
  shell.position.y = 0.275
  g.add(shell)
  for (let i = 0; i < 7; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 0.1), m)
    rib.position.set(0, 0.58, 1.55 + i * 0.07 - 0.2)
    g.add(rib)
  }
  if (label) {
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.4), new THREE.MeshStandardMaterial({ map: label, roughness: 0.5 }))
    lab.rotation.x = -Math.PI / 2
    lab.position.set(0, 0.556, -0.5)
    g.add(lab)
  }
  const pins = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.3), metal(palette.brass, 0.25))
  pins.position.set(0, 0.2, -2.15)
  g.add(pins)
  return shadow(g)
}

export function sheet({ w = 5, d = 3.6, map, curl = 0.25 }) {
  const geo = new THREE.PlaneGeometry(w, d, 60, 40)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (w / 2)
    const z = pos.getZ(i) / (d / 2)
    pos.setY(i, Math.pow(Math.abs(x), 3) * curl + (fbm(x * 2, z * 2, 4) - 0.5) * 0.06 + 0.03)
  }
  geo.computeVertexNormals()
  return shadow(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, roughness: 0.9, side: THREE.DoubleSide })))
}

export function frame({ w = 3, h = 4, art, color = palette.brass, depth = 0.25, border = 0.32 }) {
  const g = new THREE.Group()
  const m = metal(color, 0.4)
  const bars = [
    [w + border * 2, border, 0, h / 2 + border / 2],
    [w + border * 2, border, 0, -h / 2 - border / 2],
    [border, h, -w / 2 - border / 2, 0],
    [border, h, w / 2 + border / 2, 0],
  ]
  for (const [bw, bh, x, y] of bars) {
    const bar = new THREE.Mesh(new RoundedBoxGeometry(bw, bh, depth, 2, 0.06), m)
    bar.position.set(x, y, 0)
    g.add(bar)
  }
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: art, roughness: 0.8 }))
  canvas.position.z = -0.02
  g.add(canvas)
  return shadow(g)
}

export function filmStrip({ frames = [], length = 9, height = 1.4, bend = 1.2 }) {
  const tex = canvasTexture(2048, 320, (g, w, h) => {
    g.fillStyle = "#0e0c0b"
    g.fillRect(0, 0, w, h)
    g.fillStyle = "#d8cdb6"
    for (let x = 12; x < w; x += 44) {
      g.fillRect(x, 16, 22, 28)
      g.fillRect(x, h - 44, 22, 28)
    }
    const n = Math.max(1, frames.length || 5)
    const fw = (w - 40) / n
    for (let i = 0; i < n; i++) {
      const x = 20 + i * fw
      g.fillStyle = "#2a2622"
      g.fillRect(x + 6, 62, fw - 12, h - 124)
      const img = frames[i % (frames.length || 1)]
      if (img) g.drawImage(img, x + 6, 62, fw - 12, h - 124)
    }
  })
  const geo = new THREE.PlaneGeometry(length, height, 120, 4)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (length / 2)
    pos.setZ(i, Math.sin(x * Math.PI * 0.9) * bend * 0.5 + x * x * bend * 0.3)
  }
  geo.computeVertexNormals()
  return shadow(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.25, clearcoat: 1, side: THREE.DoubleSide })))
}

export function seal({ r = 0.7, color = 0x7a1218, letter = "C" }) {
  const g = new THREE.Group()
  const n = noiseCanvas(256, 256, 6, 1.2)
  const emboss = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = "#808080"
    c.fillRect(0, 0, w, h)
    c.strokeStyle = "#ffffff"
    c.lineWidth = 10
    c.beginPath()
    c.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2)
    c.stroke()
    c.fillStyle = "#ffffff"
    c.font = "600 130px Fraunces, Georgia, serif"
    c.textAlign = "center"
    c.textBaseline = "middle"
    c.fillText(letter, w / 2, h / 2 + 8)
  }, { srgb: false })
  const geo = blobGeometry(r, 0.25, rnd() * 9, 48)
  geo.scale(1, 0.22, 1)
  const blob = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6, bumpMap: n, bumpScale: 0.4 }))
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.08, 64), new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.7, bumpMap: emboss, bumpScale: 3 }))
  disc.position.y = r * 0.18
  g.add(blob, disc)
  return shadow(g)
}

export function envelope({ w = 4.4, d = 2.8, map }) {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.92 })
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), mat)
  base.position.y = 0.025
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2, 0)
  shape.lineTo(w / 2, 0)
  shape.lineTo(0, -d * 0.58)
  shape.closePath()
  const flap = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ map, roughness: 0.9, side: THREE.DoubleSide, color: 0xe9dfca }))
  flap.rotation.x = -Math.PI / 2
  flap.position.set(0, 0.056, -d / 2)
  g.add(base, flap)
  return shadow(g)
}

export function lens({ r = 0.9 }) {
  const g = new THREE.Group()
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 16, 96), metal(palette.brass, 0.3))
  const glassDisc = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 64, 32, 0, Math.PI * 2, 0, 0.66), glass(0xffffff, { thickness: 0.2 }))
  glassDisc.scale.y = 0.35
  glassDisc.position.y = -r * 1.6 * 0.35 * Math.cos(0.66)
  const lensGroup = new THREE.Group()
  lensGroup.add(rim)
  rim.rotation.x = Math.PI / 2
  lensGroup.add(glassDisc)
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.2, 24), new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.5 }))
  handle.rotation.z = Math.PI / 2
  handle.position.x = r + 1.15
  lensGroup.add(handle)
  g.add(lensGroup)
  return shadow(g)
}

// ---------- lights ----------

export function keyLight(scene, { color = 0xffd6a8, intensity = 900, pos = [-14, 18, 10], target = [0, 1, 0], angle = 0.42, penumbra = 0.8, size = 2048, radius = 8 }) {
  const l = new THREE.SpotLight(color, intensity, 0, angle, penumbra, 2)
  l.position.set(...pos)
  l.target.position.set(...target)
  l.castShadow = true
  l.shadow.mapSize.set(size, size)
  l.shadow.radius = radius
  l.shadow.bias = -0.0004
  l.shadow.normalBias = 0.02
  l.shadow.camera.near = 4
  l.shadow.camera.far = 80
  scene.add(l, l.target)
  return l
}

export function rimLight(scene, { color = palette.cyan, intensity = 160, pos = [12, 6, -6], target = [0, 2, 0], angle = 0.5 }) {
  const l = new THREE.SpotLight(color, intensity, 0, angle, 0.9, 2)
  l.position.set(...pos)
  l.target.position.set(...target)
  scene.add(l, l.target)
  return l
}

export function fill(scene, { color = 0x6e7f90, intensity = 0.25 } = {}) {
  const h = new THREE.HemisphereLight(color, 0x1a120c, intensity)
  scene.add(h)
  return h
}

import * as THREE from "three"
import { chapters, clamp, smoothstep } from "./timeline.js"

const SAFE = /* glsl */ `
float sstep(float edge0, float edge1, float x) {
  float denom = edge1 - edge0;
  float span = abs(denom) < 1.0e-4 ? (denom < 0.0 ? -1.0e-4 : 1.0e-4) : denom;
  float t = clamp((x - edge0) / span, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
`

const PLATE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const PLATE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uA;
uniform vec3 uB;
uniform float uGrid;
uniform float uSimple;
${SAFE}
void main() {
  vec2 uv = vUv;
  if (uSimple > 0.5) {
    vec3 col = vec3(0.008, 0.009, 0.011);
    col += uA * uv.x * uv.x * 0.035;
    col += uB * uv.x * 0.02;
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  float n = fbm(uv * vec2(2.2, 1.5) + uTime * 0.012);
  float veil = sstep(0.28, 0.82, n);
  vec3 col = vec3(0.012, 0.014, 0.016);
  col += uA * veil * uv.x * 0.55;
  col += uB * pow(fbm(uv * 3.2 - n), 2.0) * uv.x * 0.45;
  if (uGrid > 0.01) {
    vec2 g = abs(fract(uv * vec2(22.0, 14.0)) - 0.5);
    float grid = sstep(0.48, 0.5, max(g.x, g.y));
    col += uA * grid * uGrid * 0.12;
  }
  float vig = sstep(1.15, 0.2, length((uv - vec2(0.62, 0.5)) * vec2(1.1, 1.0)));
  col *= mix(0.55, 1.0, vig);
  gl_FragColor = vec4(col, 1.0);
}
`

const MESH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const LAMP_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
${SAFE}
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = sstep(1.05, 0.05, d);
  a *= a;
  gl_FragColor = vec4(uColor, a * uAlpha);
}
`

const GRID_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uReveal;
${SAFE}
void main() {
  vec2 g = vUv * vec2(16.0, 11.0);
  vec2 f = fract(g);
  vec2 id = floor(g);
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float grid = 1.0 - sstep(0.045, 0.09, edge);
  float h = hash(id);
  float lit = sstep(h * 0.85, h * 0.85 + 0.08, uReveal);
  vec3 cyan = vec3(0.333, 0.933, 0.941);
  vec3 blue = vec3(0.490, 0.694, 0.953);
  vec3 magenta = vec3(0.706, 0.616, 0.941);
  vec3 ink = vec3(0.04, 0.055, 0.06);
  vec3 col = mix(ink, mix(cyan, mix(blue, magenta, h), h), lit);
  col = mix(col, vec3(0.82, 0.93, 0.94), grid * 0.45);
  gl_FragColor = vec4(col, 0.96);
}
`

const POINT_VERT = /* glsl */ `
attribute float aSeed;
attribute vec3 aCond;
uniform float uTime;
uniform float uCollapse;
uniform float uSize;
uniform float uMotion;
uniform float uShift;
varying float vSeed;
void main() {
  vSeed = aSeed;
  vec3 p = mix(position, aCond, clamp(uCollapse, 0.0, 1.0));
  p.x += uShift;
  p.y += sin(uTime * 0.25 + aSeed * 10.0) * 0.02 * uMotion;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(2.4, -mv.z);
  gl_PointSize = min(11.0, uSize * (64.0 / depth));
}
`

const POINT_FRAG = /* glsl */ `
precision highp float;
varying float vSeed;
${SAFE}
void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float d = length(p);
  if (d > 0.5) discard;
  float a = sstep(0.5, 0.05, d);
  vec3 cyan = vec3(0.333, 0.933, 0.941);
  vec3 blue = vec3(0.490, 0.694, 0.953);
  vec3 magenta = vec3(0.706, 0.616, 0.941);
  vec3 col = mix(cyan, mix(blue, magenta, vSeed), vSeed);
  gl_FragColor = vec4(col * a, a * 0.9);
}
`

const LINE_VERT = /* glsl */ `
attribute float aReveal;
uniform float uReveal;
varying float vOn;
void main() {
  vOn = step(aReveal, uReveal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const LINE_FRAG = /* glsl */ `
precision highp float;
varying float vOn;
uniform vec3 uColor;
void main() {
  if (vOn < 0.5) discard;
  gl_FragColor = vec4(uColor, 0.95);
}
`

const MIX_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uBlend;
${SAFE}
void main() {
  vec3 a = texture2D(tA, vUv).rgb;
  vec3 b = texture2D(tB, vUv).rgb;
  float brush = fbm(vec2(vUv.x * 3.2, vUv.y * 1.8 + uBlend * 2.0));
  float edge = sstep(uBlend - 0.14, uBlend + 0.14, vUv.x + (brush - 0.5) * 0.28);
  float wipe = uBlend <= 0.001 ? 0.0 : edge;
  gl_FragColor = vec4(mix(a, b, wipe), 1.0);
}
`

const EXTRACT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tMap;
${SAFE}
void main() {
  vec3 c = texture2D(tMap, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float t = sstep(0.45, 1.05, l);
  gl_FragColor = vec4(c * t, 1.0);
}
`

const BLUR_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tMap;
uniform vec2 uTexel;
void main() {
  vec3 c = texture2D(tMap, vUv).rgb * 0.4;
  c += texture2D(tMap, vUv + uTexel * vec2(1.0, 0.0)).rgb * 0.15;
  c += texture2D(tMap, vUv - uTexel * vec2(1.0, 0.0)).rgb * 0.15;
  c += texture2D(tMap, vUv + uTexel * vec2(0.0, 1.0)).rgb * 0.15;
  c += texture2D(tMap, vUv - uTexel * vec2(0.0, 1.0)).rgb * 0.15;
  gl_FragColor = vec4(c, 1.0);
}
`

const FINAL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tMap;
uniform sampler2D tBloom;
uniform float uBloom;
${SAFE}
vec3 filmic(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / max(x * (c * x + d) + e, vec3(1.0e-4)), 0.0, 1.0);
}
void main() {
  vec3 col = texture2D(tMap, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
  col = filmic(col);
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  col += (ign - 0.5) / 255.0;
  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`

function fullscreenMaterial(fragment, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: PLATE_VERT,
    fragmentShader: fragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
  })
}

function makePlate(colorA, colorB, grid) {
  const uniforms = {
    uTime: { value: 0 },
    uA: { value: colorA.clone() },
    uB: { value: colorB.clone() },
    uGrid: { value: grid },
    uSimple: { value: 0 },
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fullscreenMaterial(PLATE_FRAG, uniforms))
  mesh.frustumCulled = false
  const scene = new THREE.Scene()
  scene.add(mesh)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  return { scene, camera, uniforms }
}

function lamp(color, alpha) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.8),
    new THREE.ShaderMaterial({
      vertexShader: MESH_VERT,
      fragmentShader: LAMP_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uAlpha: { value: alpha },
      },
      transparent: true,
      depthWrite: false,
    }),
  )
  return mesh
}

function frameRect(w, h, color, opacity = 0.9) {
  const pts = [
    [-w / 2, -h / 2, 0],
    [w / 2, -h / 2, 0],
    [w / 2, -h / 2, 0],
    [w / 2, h / 2, 0],
    [w / 2, h / 2, 0],
    [-w / 2, h / 2, 0],
    [-w / 2, h / 2, 0],
    [-w / 2, -h / 2, 0],
  ]
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  )
}

function frameMesh(w, h, color, t = 0.045) {
  const group = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color })
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w + t, t), mat)
  const bot = new THREE.Mesh(new THREE.PlaneGeometry(w + t, t), mat)
  const left = new THREE.Mesh(new THREE.PlaneGeometry(t, h), mat)
  const right = new THREE.Mesh(new THREE.PlaneGeometry(t, h), mat)
  top.position.y = h / 2
  bot.position.y = -h / 2
  left.position.x = -w / 2
  right.position.x = w / 2
  group.add(top, bot, left, right)
  return group
}

function painting(w, h, fill, stroke) {
  const group = new THREE.Group()
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: fill, transparent: true, opacity: 0.92, depthWrite: false }),
  )
  group.add(board)
  group.add(frameMesh(w, h, stroke, Math.max(0.035, Math.min(w, h) * 0.045)))
  return group
}

function ellipseLine(rx, ry, tilt, color) {
  const pts = []
  const segments = 80
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2
    const p = new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, 0)
    p.applyAxisAngle(new THREE.Vector3(1, 0.15, 0), tilt)
    pts.push(p)
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  )
}

function sampleEllipse(rx, ry, tilt, angle) {
  const p = new THREE.Vector3(Math.cos(angle) * rx, Math.sin(angle) * ry, 0)
  p.applyAxisAngle(new THREE.Vector3(1, 0.15, 0), tilt)
  return p
}

function ring(rx, ry, color) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.78, 1, 72),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  )
  mesh.scale.set(rx, ry, 1)
  return mesh
}

function stageFloor(scene) {
  const arc = ellipseLine(3.4, 0.42, 0, 0x24575c)
  arc.position.set(1.3, -1.45, -0.4)
  arc.material.opacity = 0.35
  scene.add(arc)
}

function look(camera, progress, from, to, at) {
  camera.position.lerpVectors(from, to, clamp(progress, 0, 1))
  camera.position.z *= 0.78
  camera.lookAt(at)
}

function curtain(cols, rows) {
  const positions = []
  const cond = []
  const seeds = []
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = x * 0.11
      const py = (y - (rows - 1) / 2) * 0.115
      positions.push(px, py, (x % 4) * 0.05)
      cond.push(1.15, py * 0.22, 0.02)
      seeds.push(((x * 17 + y * 5) % 97) / 97)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute("aCond", new THREE.Float32BufferAttribute(cond, 3))
  geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1))
  const uniforms = {
    uTime: { value: 0 },
    uCollapse: { value: 0 },
    uSize: { value: 5.2 },
    uMotion: { value: 1 },
    uShift: { value: 0.35 },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  return { points: new THREE.Points(geo, mat), uniforms }
}

function buildTree() {
  const positions = []
  const reveal = []
  const maxDepth = 4
  function branch(x, y, depth, spread) {
    if (depth > maxDepth) return
    const y2 = y + 0.46
    const next = spread * 0.58
    for (const side of [-1, 1]) {
      const x2 = x + side * spread
      positions.push(x, y, 0, x2, y2, 0)
      const t = depth / maxDepth
      reveal.push(t, t)
      branch(x2, y2, depth + 1, next)
    }
  }
  branch(0, -1.2, 0, 0.62)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute("aReveal", new THREE.Float32BufferAttribute(reveal, 1))
  const uniforms = { uReveal: { value: 0 }, uColor: { value: new THREE.Color("#b49df0") } }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    transparent: true,
  })
  return { line: new THREE.LineSegments(geo, mat), uniforms }
}

function makePass(fragment, uniforms) {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fullscreenMaterial(fragment, uniforms))
  mesh.frustumCulled = false
  scene.add(mesh)
  return { scene, camera, uniforms }
}

function target(w, h, half) {
  return new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
    type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
  })
}

export function createGraphics(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  })
  renderer.setClearColor(0x101010, 1)
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.autoClear = false
  const gl = renderer.getContext()
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info")
  const rendererName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : ""
  const software = /SwiftShader|llvmpipe|softpipe|Basic Render/i.test(rendererName || "")

  const disabled = new Set()
  const scenes = {}

  function addScene(id, build) {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 40)
    const api = build(scene, camera)
    scenes[id] = { scene, camera, ...api }
  }

  addScene("studio", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.33, 0.93, 0.94), new THREE.Vector3(0.49, 0.69, 0.95), 0)
    const glow = lamp("#55eef0", 0.1)
    glow.position.set(1.7, 0.1, -0.8)
    scene.add(glow)
    const lens = new THREE.Group()
    lens.add(ring(1.7, 1.7, 0x55eef0))
    lens.add(ring(1.15, 1.15, 0x7db1f3))
    lens.position.set(1.75, 0.05, 0)
    scene.add(lens)
    const frames = [0, 1, 2].map((index) => {
      const card = painting(1.15, 0.62, index === 1 ? 0x12383c : 0x101820, index === 2 ? 0xb49df0 : 0x55eef0)
      card.position.set(1.75, 0.55 - index * 0.42, 0.25 + index * 0.08)
      scene.add(card)
      return card
    })
    stageFloor(scene)
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        lens.rotation.z = time * 0.05
        frames.forEach((card, index) => {
          const lift = smoothstep(0.05 + index * 0.08, 0.55, progress)
          card.position.y = 0.15 - index * 0.38 + lift * 0.35
          card.position.z = 0.15 + lift * 0.2
        })
        look(
          scenes.studio.camera,
          progress,
          new THREE.Vector3(-1.15, 0.12, 4.6),
          new THREE.Vector3(-0.85, 0.08, 3.9),
          new THREE.Vector3(1.6, 0.05, 0),
        )
      },
      plate,
    }
  })

  addScene("gallery", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.49, 0.69, 0.95), new THREE.Vector3(0.71, 0.62, 0.94), 0)
    const glow = lamp("#7db1f3", 0.09)
    glow.position.set(2.2, 0.4, -1.2)
    scene.add(glow)
    const frames = [
      [1.15, 0.15, 0.4, 1.15, 1.45, 0x102226, 0x55eef0],
      [1.85, 0.35, -0.15, 0.95, 1.2, 0x14182c, 0x7db1f3],
      [2.45, -0.05, -0.7, 0.8, 1.0, 0x1a1428, 0xb49df0],
      [3.05, 0.25, -1.25, 0.62, 0.8, 0x10161c, 0x55eef0],
    ].map((spec) => {
      const card = painting(spec[3], spec[4], spec[5], spec[6])
      card.position.set(spec[0], spec[1], spec[2])
      scene.add(card)
      return card
    })
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 2.4),
      new THREE.MeshBasicMaterial({ color: 0x55eef0, transparent: true, opacity: 0.35, depthWrite: false }),
    )
    scene.add(beam)
    stageFloor(scene)
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        beam.position.set(1.1 + progress * 2.1, 0.15, 0.6)
        frames.forEach((card, index) => {
          card.rotation.y = -0.18 + progress * 0.08
          card.position.x += 0
          void index
        })
        look(
          scenes.gallery.camera,
          progress,
          new THREE.Vector3(-0.4, 0.2, 5.2),
          new THREE.Vector3(0.15, 0.12, 4.4),
          new THREE.Vector3(2.0, 0.15, -0.3),
        )
      },
      plate,
    }
  })

  addScene("almanac", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.2, 0.45, 0.85), new THREE.Vector3(0.33, 0.93, 0.94), 0.55)
    const glow = lamp("#7db1f3", 0.09)
    glow.position.set(1.6, 0.2, -0.9)
    scene.add(glow)
    const chart = new THREE.Group()
    chart.add(ring(2.15, 2.15, 0x7db1f3))
    chart.add(ring(1.45, 1.45, 0x55eef0))
    chart.add(ring(0.72, 0.72, 0xb49df0))
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2
      const inner = i % 3 === 0 ? 0.55 : 1.35
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(a) * inner, Math.sin(a) * inner, 0),
        new THREE.Vector3(Math.cos(a) * 2.25, Math.sin(a) * 2.25, 0),
      ])
      chart.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xb49df0, transparent: true, opacity: 0.45 })))
    }
    const stars = []
    for (let i = 0; i < 18; i += 1) {
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.035, 8),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x55eef0 : 0xe7f3f3 }),
      )
      const a = (i / 18) * Math.PI * 2
      const radius = 0.9 + (i % 3) * 0.45
      dot.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0.05)
      chart.add(dot)
      stars.push(dot)
    }
    chart.position.set(1.7, 0.05, 0)
    scene.add(chart)
    const hand = new THREE.Mesh(
      new THREE.PlaneGeometry(0.03, 1.35),
      new THREE.MeshBasicMaterial({ color: 0x55eef0 }),
    )
    hand.position.set(1.7, 0.05, 0.1)
    const hand2 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.02, 0.85),
      new THREE.MeshBasicMaterial({ color: 0xb49df0 }),
    )
    hand2.position.set(1.7, 0.05, 0.12)
    scene.add(hand, hand2)
    const gear = ring(0.48, 0.48, 0x7db1f3)
    gear.position.set(2.85, -0.85, 0.2)
    scene.add(gear)
    stageFloor(scene)
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        chart.rotation.z = progress * 0.25
        const spin = time * 0.15 + progress * 2.2
        hand.rotation.z = spin
        hand2.rotation.z = -spin * 0.35
        gear.rotation.z = -spin * 0.5
        void stars
        look(
          scenes.almanac.camera,
          progress,
          new THREE.Vector3(-1.2, 0.1, 5.1),
          new THREE.Vector3(-0.9, 0.05, 4.3),
          new THREE.Vector3(1.7, 0.05, 0),
        )
      },
      plate,
    }
  })

  addScene("orbit", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.15, 0.4, 0.75), new THREE.Vector3(0.33, 0.93, 0.94), 0)
    const glow = lamp("#55eef0", 0.08)
    glow.position.set(1.5, 0.1, -1)
    scene.add(glow)
    const specs = [
      [2.4, 1.15, 0.45, 0x55eef0],
      [1.7, 0.95, -0.35, 0x7db1f3],
      [1.05, 0.62, 0.2, 0xb49df0],
    ]
    const orbits = new THREE.Group()
    for (const spec of specs) orbits.add(ellipseLine(spec[0], spec[1], spec[2], spec[3]))
    orbits.position.set(1.65, 0.1, 0)
    scene.add(orbits)
    const earth = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 32),
      new THREE.MeshBasicMaterial({ color: 0x16383c }),
    )
    const earthRim = ring(0.46, 0.46, 0xe7f3f3)
    earth.position.set(1.65, 0.1, 0.02)
    earthRim.position.copy(earth.position)
    scene.add(earth, earthRim)
    const craft = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 12),
      new THREE.MeshBasicMaterial({ color: 0x55eef0 }),
    )
    scene.add(craft)
    const trailPts = []
    for (let i = 0; i < 24; i += 1) trailPts.push(new THREE.Vector3())
    const trail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(trailPts),
      new THREE.LineBasicMaterial({ color: 0x55eef0, transparent: true, opacity: 0.7 }),
    )
    scene.add(trail)
    stageFloor(scene)
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        const angle = progress * Math.PI * 1.7 + 0.4
        const p = sampleEllipse(specs[0][0], specs[0][1], specs[0][2], angle)
        craft.position.set(p.x + 1.65, p.y + 0.1, p.z + 0.08)
        const positions = trail.geometry.attributes.position
        for (let i = 0; i < 24; i += 1) {
          const q = sampleEllipse(specs[0][0], specs[0][1], specs[0][2], angle - i * 0.08)
          positions.setXYZ(i, q.x + 1.65, q.y + 0.1, q.z)
        }
        positions.needsUpdate = true
        look(
          scenes.orbit.camera,
          progress,
          new THREE.Vector3(-1.05, 0.25, 5.0),
          new THREE.Vector3(-0.7, 0.15, 4.2),
          new THREE.Vector3(1.55, 0.1, 0),
        )
      },
      plate,
    }
  })

  addScene("estimate", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.71, 0.62, 0.94), new THREE.Vector3(0.33, 0.93, 0.94), 0)
    const glow = lamp("#b49df0", 0.11)
    glow.position.set(1.9, 0.15, -0.7)
    scene.add(glow)
    const halo = ring(1.55, 1.55, 0xb49df0)
    halo.position.set(2.15, 0.05, -0.35)
    halo.material.opacity = 0.35
    scene.add(halo)
    const field = curtain(14, 16)
    field.points.position.set(0.15, 0, 0)
    scene.add(field.points)
    const statistic = new THREE.Mesh(
      new THREE.PlaneGeometry(0.025, 2.5),
      new THREE.MeshBasicMaterial({ color: 0x55eef0, transparent: true, opacity: 0.85 }),
    )
    statistic.position.set(1.7, 0, 0.15)
    scene.add(statistic)
    const tree = buildTree()
    tree.line.position.set(2.35, -0.05, 0.35)
    tree.line.scale.setScalar(0.92)
    scene.add(tree.line)
    stageFloor(scene)
    return {
      update(progress, time, motion) {
        plate.uniforms.uTime.value = time
        field.uniforms.uTime.value = time
        field.uniforms.uMotion.value = motion
        field.uniforms.uCollapse.value = smoothstep(0.08, 0.72, progress)
        tree.uniforms.uReveal.value = smoothstep(0.02, 0.46, progress)
        halo.rotation.z = time * 0.04
        statistic.scale.y = 0.35 + smoothstep(0.1, 0.7, progress) * 0.65
        look(
          scenes.estimate.camera,
          progress,
          new THREE.Vector3(-1.25, 0.08, 4.8),
          new THREE.Vector3(-0.85, 0.04, 4.0),
          new THREE.Vector3(1.85, 0.05, 0),
        )
      },
      plate,
    }
  })

  addScene("cartridge", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.33, 0.93, 0.94), new THREE.Vector3(0.12, 0.28, 0.42), 0)
    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 1.7),
      new THREE.ShaderMaterial({
        vertexShader: MESH_VERT,
        fragmentShader: GRID_FRAG,
        uniforms: { uReveal: { value: 0 } },
      }),
    )
    grid.position.set(1.85, 0.05, -0.15)
    scene.add(grid)
    const slot = frameRect(0.78, 1.15, 0xe7f3f3, 0.8)
    slot.position.set(2.55, 0.0, 0.05)
    scene.add(slot)
    const colors = [0x55eef0, 0x7db1f3, 0xb49df0]
    const cards = colors.map((color, index) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.95),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 }),
      )
      mesh.position.set(0.2 + index * 0.15, 0.15 * (1 - index), 0.2 - index * 0.05)
      scene.add(mesh)
      return mesh
    })
    stageFloor(scene)
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        grid.material.uniforms.uReveal.value = smoothstep(0.15, 0.9, progress)
        const slide = smoothstep(0.08, 0.78, progress)
        cards.forEach((mesh, index) => {
          mesh.position.x = 0.35 + index * 0.22 + slide * (1.55 - index * 0.08)
        })
        look(
          scenes.cartridge.camera,
          progress,
          new THREE.Vector3(-1.1, 0.1, 4.5),
          new THREE.Vector3(-0.75, 0.05, 3.9),
          new THREE.Vector3(1.8, 0.05, 0),
        )
      },
      plate,
    }
  })

  addScene("reel", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.71, 0.62, 0.94), new THREE.Vector3(0.33, 0.93, 0.94), 0)
    const glow = lamp("#55eef0", 0.08)
    glow.position.set(1.8, 0.2, -0.8)
    scene.add(glow)
    const frames = []
    for (let i = 0; i < 6; i += 1) {
      const group = new THREE.Group()
      const card = painting(0.78, 0.48, 0x101820, i % 2 ? 0x55eef0 : 0xb49df0)
      group.add(card)
      const sprocket = new THREE.Mesh(
        new THREE.CircleGeometry(0.035, 8),
        new THREE.MeshBasicMaterial({ color: 0xe7f3f3 }),
      )
      sprocket.position.set(-0.48, 0, 0.02)
      group.add(sprocket)
      const home = new THREE.Vector3(1.85, 1.15 - i * 0.42, 0.1)
      const scattered = new THREE.Vector3(0.4 + (i % 3) * 0.9, (i - 2.5) * 0.55, -0.8 + (i % 2) * 0.6)
      group.position.copy(scattered)
      group.userData.home = home
      group.userData.scattered = scattered
      scene.add(group)
      frames.push(group)
    }
    const spine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.04, 2.7),
      new THREE.MeshBasicMaterial({ color: 0x55eef0, transparent: true, opacity: 0.5 }),
    )
    spine.position.set(1.15, 0.05, -0.05)
    scene.add(spine)
    stageFloor(scene)
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        const t = smoothstep(0.08, 0.82, progress)
        frames.forEach((group) => {
          group.position.lerpVectors(group.userData.scattered, group.userData.home, t)
          group.rotation.z = (1 - t) * 0.4
        })
        spine.scale.y = 0.2 + t * 0.8
        look(
          scenes.reel.camera,
          progress,
          new THREE.Vector3(-1.15, 0.05, 4.7),
          new THREE.Vector3(-0.8, 0.02, 4.0),
          new THREE.Vector3(1.7, 0.05, 0),
        )
      },
      plate,
    }
  })

  addScene("steps", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.33, 0.93, 0.94), new THREE.Vector3(0.49, 0.69, 0.95), 0)
    const pieces = [
      painting(0.9, 0.9, 0x12383c, 0x55eef0),
      painting(0.7, 1.15, 0x141820, 0x7db1f3),
      painting(0.95, 0.7, 0x1a1428, 0xb49df0),
    ]
    pieces.forEach((piece, index) => {
      piece.position.set(1.05 + index * 0.85, -1.1, 0.1 - index * 0.15)
      scene.add(piece)
    })
    const mark = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 16),
      new THREE.MeshBasicMaterial({ color: 0x55eef0 }),
    )
    mark.position.set(1.05, 0, 0.2)
    scene.add(mark)
    stageFloor(scene)
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        pieces.forEach((piece, index) => {
          const rise = smoothstep(index * 0.18, 0.45 + index * 0.18, progress)
          piece.position.y = -0.9 + rise * 1.05
        })
        mark.position.y = pieces[0].position.y
        look(
          scenes.steps.camera,
          progress,
          new THREE.Vector3(-1.2, 0.15, 4.8),
          new THREE.Vector3(-0.85, 0.1, 4.1),
          new THREE.Vector3(1.8, 0.05, 0),
        )
      },
      plate,
    }
  })

  addScene("ledger", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.49, 0.69, 0.95), new THREE.Vector3(0.71, 0.62, 0.94), 0)
    const left = painting(1.05, 1.7, 0x101820, 0x7db1f3)
    const right = painting(1.05, 1.7, 0x161222, 0xb49df0)
    left.position.set(1.25, 0.05, 0)
    right.position.set(2.55, 0.05, 0.05)
    scene.add(left, right)
    const slit = new THREE.Mesh(
      new THREE.PlaneGeometry(0.045, 1.9),
      new THREE.MeshBasicMaterial({ color: 0x55eef0, transparent: true, opacity: 0.8 }),
    )
    slit.position.set(1.9, 0.05, 0.2)
    scene.add(slit)
    const glow = lamp("#55eef0", 0.08)
    glow.position.set(1.9, 0.2, -0.6)
    scene.add(glow)
    stageFloor(scene)
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        const open = smoothstep(0.05, 0.6, progress)
        left.position.x = 1.55 - open * 0.28
        right.position.x = 2.25 + open * 0.28
        left.rotation.y = open * 0.18
        right.rotation.y = -open * 0.18
        look(
          scenes.ledger.camera,
          progress,
          new THREE.Vector3(-1.05, 0.12, 4.6),
          new THREE.Vector3(-0.7, 0.08, 4.0),
          new THREE.Vector3(1.9, 0.05, 0),
        )
      },
      plate,
    }
  })

  addScene("aperture", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.33, 0.93, 0.94), new THREE.Vector3(0.71, 0.62, 0.94), 0)
    const glow = lamp("#55eef0", 0.12)
    glow.position.set(1.7, 0.15, -0.4)
    scene.add(glow)
    const arch = ellipseLine(1.15, 1.55, 0, 0x55eef0)
    arch.position.set(1.75, 0.15, 0)
    scene.add(arch)
    const jambL = new THREE.Mesh(
      new THREE.PlaneGeometry(0.04, 1.7),
      new THREE.MeshBasicMaterial({ color: 0x7db1f3 }),
    )
    const jambR = jambL.clone()
    jambL.position.set(0.7, -0.35, 0.05)
    jambR.position.set(2.8, -0.35, 0.05)
    scene.add(jambL, jambR)
    const sill = frameRect(2.2, 1.15, 0xb49df0, 0.85)
    sill.position.set(1.75, -0.15, 0.15)
    scene.add(sill)
    stageFloor(scene)
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        const open = smoothstep(0.05, 0.7, progress)
        jambL.position.x = 1.15 - open * 0.45
        jambR.position.x = 2.35 + open * 0.45
        arch.scale.setScalar(0.86 + open * 0.2)
        look(
          scenes.aperture.camera,
          progress,
          new THREE.Vector3(-1.2, 0.1, 4.7),
          new THREE.Vector3(-0.8, 0.06, 3.9),
          new THREE.Vector3(1.75, 0.05, 0),
        )
      },
      plate,
    }
  })

  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mix = makePass(MIX_FRAG, {
    tA: { value: null },
    tB: { value: null },
    uBlend: { value: 0 },
  })
  const extract = makePass(EXTRACT_FRAG, { tMap: { value: null } })
  const blur = makePass(BLUR_FRAG, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } })
  const finalPass = makePass(FINAL_FRAG, {
    tMap: { value: null },
    tBloom: { value: null },
    uBloom: { value: 0.28 },
  })

  let rtA
  let rtB
  let rtMix
  let bloom = []
  let size = { w: 2, h: 2 }
  let halfFloat = !software

  function allocate(w, h) {
    disposeTargets()
    rtA = target(w, h, halfFloat)
    rtB = target(w, h, halfFloat)
    rtMix = target(w, h, halfFloat)
    bloom = [target(Math.floor(w / 2), Math.floor(h / 2), halfFloat), target(Math.floor(w / 4), Math.floor(h / 4), halfFloat)]
  }

  function disposeTargets() {
    ;[rtA, rtB, rtMix, ...bloom].forEach((rt) => rt?.dispose())
  }

  function resize() {
    const cssW = canvas.clientWidth || window.innerWidth
    const cssH = canvas.clientHeight || window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, cssW < 800 ? 1 : 1.15)
    const capW = software ? 720 : 960
    const capH = software ? 450 : 600
    let w = Math.max(2, Math.round(Math.min(cssW * dpr, capW)))
    let h = Math.max(2, Math.round(w / (cssW / Math.max(1, cssH))))
    if (h > capH) {
      h = capH
      w = Math.max(2, Math.round(h * (cssW / Math.max(1, cssH))))
    }
    if (Math.abs(w - size.w) < 8 && Math.abs(h - size.h) < 8 && rtA) return
    size = { w, h }
    renderer.setPixelRatio(1)
    renderer.setSize(w, h, false)
    for (const scene of Object.values(scenes)) scene.camera.aspect = w / h
    for (const scene of Object.values(scenes)) scene.camera.updateProjectionMatrix()
    allocate(w, h)
  }

  function renderScene(id, progress, time, motion, rt) {
    if (disabled.has(id)) return
    const scene = scenes[id]
    try {
      scene.update(clamp(progress, 0, 1), time, motion)
      renderer.setRenderTarget(rt)
      renderer.setClearColor(0x101010, 1)
      renderer.clear()
      if (scene.plate) renderer.render(scene.plate.scene, scene.plate.camera)
      renderer.clearDepth()
      renderer.render(scene.scene, scene.camera)
    } catch (error) {
      disabled.add(id)
      console.error(`Chapter ${id} disabled`, error)
    }
  }

  function blit(pass, to) {
    renderer.setRenderTarget(to)
    renderer.clear()
    renderer.render(pass.scene, pass.camera)
  }

  function locate(value) {
    let index = 0
    for (let i = 0; i < chapters.length; i += 1) {
      if (value >= chapters[i].start) index = i
    }
    const chapter = chapters[index]
    const prev = chapters[index - 1]
    const next = chapters[index + 1]
    const windowVh = 0.42
    let from = chapter.scene
    let to = chapter.scene
    let blend = 0
    if (prev && prev.scene !== chapter.scene && value < chapter.start + windowVh) {
      from = prev.scene
      to = chapter.scene
      blend = smoothstep(chapter.start - windowVh, chapter.start + windowVh, value)
    } else if (next && next.scene !== chapter.scene && value > next.start - windowVh) {
      from = chapter.scene
      to = next.scene
      blend = smoothstep(next.start - windowVh, next.start + windowVh, value)
    }
    return { from, to, blend }
  }

  function sceneProgress(sceneId, value) {
    const group = chapters.filter((chapter) => chapter.scene === sceneId)
    let best = group[0]
    let bestDist = Infinity
    for (const chapter of group) {
      const mid = chapter.start + chapter.span / 2
      const dist = Math.abs(value - mid)
      if (dist < bestDist) {
        bestDist = dist
        best = chapter
      }
    }
    return clamp((value - best.start) / best.span, 0, 1)
  }

  function render({ value, time, motion }) {
    if (!rtA) resize()
    const loc = locate(value)
    renderScene(loc.from, sceneProgress(loc.from, value), time, motion, rtA)
    const second = loc.blend > 0.001 && loc.to !== loc.from
    if (second) renderScene(loc.to, sceneProgress(loc.to, value), time, motion, rtB)
    mix.uniforms.tA.value = rtA.texture
    mix.uniforms.tB.value = second ? rtB.texture : rtA.texture
    mix.uniforms.uBlend.value = second ? loc.blend : 0
    try {
      blit(mix, rtMix)
      if (software) {
        finalPass.uniforms.uBloom.value = 0
        finalPass.uniforms.tMap.value = rtMix.texture
        finalPass.uniforms.tBloom.value = rtMix.texture
        renderer.setRenderTarget(null)
        renderer.clear()
        renderer.render(finalPass.scene, ortho)
        return
      }
      finalPass.uniforms.uBloom.value = 0.28
      extract.uniforms.tMap.value = rtMix.texture
      blit(extract, bloom[0])
      blur.uniforms.tMap.value = bloom[0].texture
      blur.uniforms.uTexel.value.set(1 / bloom[0].width, 1 / bloom[0].height)
      blit(blur, bloom[1])
      blur.uniforms.tMap.value = bloom[1].texture
      blur.uniforms.uTexel.value.set(1 / bloom[0].width, 1 / bloom[0].height)
      blit(blur, bloom[0])
      finalPass.uniforms.tMap.value = rtMix.texture
      finalPass.uniforms.tBloom.value = bloom[0].texture
      renderer.setRenderTarget(null)
      renderer.clear()
      renderer.render(finalPass.scene, ortho)
    } catch (error) {
      if (halfFloat) {
        halfFloat = false
        allocate(size.w, size.h)
        console.error("Half-float unavailable, falling back", error)
        return
      }
      throw error
    }
  }

  if (software) {
    for (const scene of Object.values(scenes)) {
      if (scene.plate) scene.plate.uniforms.uSimple.value = 1
    }
  }

  const warmStarted = performance.now()
  resize()
  const ids = Object.keys(scenes)
  for (const id of ids) {
    renderScene(id, 0.2, 0.2, 0, rtA)
    renderScene(id, 0.65, 0.8, 1, rtA)
    try {
      renderer.compile?.(scenes[id].scene, scenes[id].camera)
    } catch {
      /* compile is a hint; the renders above already built the programs */
    }
  }
  render({ value: 0.4, time: 0.2, motion: 0 })
  render({ value: chapters[4].start + 0.8, time: 0.6, motion: 1 })
  const warmMs = performance.now() - warmStarted

  return {
    render,
    resize,
    disabled,
    rendererName,
    quality: software ? "software" : "hdr",
    warmMs,
    dispose() {
      disposeTargets()
      renderer.dispose()
    },
  }
}

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
    vec3 col = vec3(0.012, 0.013, 0.015);
    col += uA * uv.y * 0.18;
    col += uB * (1.0 - uv.x) * 0.1;
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  float n = fbm(uv * vec2(2.4, 1.6) + uTime * 0.015);
  float veil = sstep(0.25, 0.85, n);
  vec3 col = vec3(0.012, 0.014, 0.016);
  col += uA * veil * 0.9;
  col += uB * pow(fbm(uv * 4.0 - n), 2.2) * 1.15;
  float grid = 0.0;
  if (uGrid > 0.01) {
    vec2 g = abs(fract(uv * vec2(18.0, 10.0)) - 0.5);
    grid = sstep(0.48, 0.5, max(g.x, g.y));
    col += uA * grid * uGrid * 0.18;
  }
  float vig = sstep(1.15, 0.25, length(uv - 0.5));
  col *= mix(0.45, 1.0, vig);
  gl_FragColor = vec4(col, 1.0);
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
  p.x += sin(uTime * 0.32 + aSeed * 12.0) * 0.045 * uMotion;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(2.2, -mv.z);
  gl_PointSize = min(16.0, uSize * (70.0 / depth));
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
  float a = sstep(0.5, 0.02, d);
  vec3 cyan = vec3(0.333, 0.933, 0.941);
  vec3 blue = vec3(0.490, 0.694, 0.953);
  vec3 magenta = vec3(0.706, 0.616, 0.941);
  vec3 col = mix(cyan, mix(blue, magenta, vSeed), sstep(0.0, 1.0, vSeed));
  gl_FragColor = vec4(col * a, a * 0.85);
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
  float edge = sstep(uBlend - 0.12, uBlend + 0.12, vUv.x + (brush - 0.5) * 0.28);
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
  float t = sstep(0.42, 1.05, l);
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

const SLAB_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
${SAFE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec2 b = vec2(0.92, 0.78);
  float r = 0.18;
  vec2 q = abs(p) - b + r;
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  if (dist > 0.0) discard;
  float rim = sstep(0.12, 0.0, abs(dist));
  vec3 base = vec3(0.05, 0.07, 0.08);
  gl_FragColor = vec4(mix(base, uColor * 1.7, rim), 1.0);
}
`

const SLAB_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const LINE_VERT = /* glsl */ `
attribute float aReveal;
uniform float uReveal;
varying float vOn;
void main() {
  vOn = step(aReveal, uReveal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`

const LINE_FRAG = /* glsl */ `
precision highp float;
varying float vOn;
uniform vec3 uColor;
void main() {
  if (vOn < 0.5) discard;
  gl_FragColor = vec4(uColor, 0.9);
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

function makePoints(count, box, collapse) {
  const positions = new Float32Array(count * 3)
  const cond = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    const x = Math.random() * box[0]
    const y = (Math.random() - 0.5) * box[1]
    const z = (Math.random() - 0.5) * box[2]
    positions.set([x, y, z], i * 3)
    if (collapse) cond.set([1.15 + x * 0.22, y * 0.62, Math.sin(y * 1.4) * 0.18], i * 3)
    else cond.set([x, y, z], i * 3)
    seeds[i] = Math.random()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setAttribute("aCond", new THREE.BufferAttribute(cond, 3))
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1))
  const uniforms = {
    uTime: { value: 0 },
    uCollapse: { value: 0 },
    uSize: { value: collapse ? 5.4 : 6.4 },
    uMotion: { value: 1 },
    uShift: { value: 0.85 },
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

function band(radiusX, radiusY, color, rotation = 0) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 96),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
  )
  mesh.scale.set(radiusX, radiusY, 1)
  mesh.rotation.z = rotation
  return mesh
}

function ellipseLine(rx, ry, rot, color) {
  return band(rx, ry, color, rot)
}

function sampleEllipse(rx, ry, rot, t) {
  const x = Math.cos(t) * rx
  const y = Math.sin(t) * ry
  return new THREE.Vector3(x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot), 0)
}

function glowDot() {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3))
  geo.setAttribute("aCond", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3))
  geo.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array([0.15]), 1))
  const uniforms = { uTime: { value: 0 }, uCollapse: { value: 0 }, uSize: { value: 7 }, uMotion: { value: 0 } }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  return { points, uniforms }
}

function slab(color) {
  const uniforms = { uColor: { value: color.clone() } }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.6),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SLAB_VERT,
      fragmentShader: SLAB_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
    }),
  )
  return mesh
}

function buildTree() {
  const positions = []
  const reveal = []
  const maxDepth = 5
  function branch(x, y, depth) {
    if (depth > maxDepth) return
    const y2 = y + 0.48
    const spread = 1.35 / (depth + 1)
    for (const side of [-1, 1]) {
      const x2 = x + side * spread
      positions.push(x, y, 0, x2, y2, 0)
      const t = depth / maxDepth
      reveal.push(t, t)
      branch(x2, y2, depth + 1)
    }
  }
  branch(0, -1.35, 0)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute("aReveal", new THREE.Float32BufferAttribute(reveal, 1))
  const uniforms = { uReveal: { value: 1 }, uColor: { value: new THREE.Color("#b49df0") } }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    transparent: true,
  })
  return { line: new THREE.LineSegments(geo, mat), uniforms }
}

function cameraPath(camera, points, t, look) {
  const n = points.length
  const x = clamp(t, 0, 1) * (n - 1)
  const i = Math.min(n - 2, Math.floor(x))
  const u = x - i
  const p0 = points[Math.max(0, i - 1)]
  const p1 = points[i]
  const p2 = points[Math.min(n - 1, i + 1)]
  const p3 = points[Math.min(n - 1, i + 2)]
  const uu = u * u
  const uuu = uu * u
  const q = p0
    .clone()
    .multiplyScalar(-0.5 * uuu + uu - 0.5 * u)
    .add(p1.clone().multiplyScalar(1.5 * uuu - 2.5 * uu + 1))
    .add(p2.clone().multiplyScalar(-1.5 * uuu + 2 * uu + 0.5 * u))
    .add(p3.clone().multiplyScalar(0.5 * uuu - 0.5 * uu))
  camera.position.copy(q)
  camera.lookAt(look)
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
  const count = software ? 640 : window.innerWidth < 800 ? 1200 : 1800
  const scenes = {}

  function addScene(id, build) {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40)
    const api = build(scene, camera)
    scenes[id] = { scene, camera, ...api }
  }

  addScene("field", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.33, 0.93, 0.94), new THREE.Vector3(0.71, 0.62, 0.94), 0)
    const field = makePoints(count, [4.2, 3.6, 2.4], false)
    scene.add(field.points)
    const path = [
      new THREE.Vector3(-1.35, 0.12, 4.3),
      new THREE.Vector3(-1.05, 0.22, 3.7),
      new THREE.Vector3(-0.7, 0.08, 3.3),
    ]
    return {
      update(progress, time, motion) {
        plate.uniforms.uTime.value = time
        field.uniforms.uTime.value = time
        field.uniforms.uMotion.value = motion
        cameraPath(scenes.field.camera, path, smoothstep(0, 1, progress), new THREE.Vector3(0.85, 0, 0))
      },
      plate,
    }
  })

  addScene("banneker", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.2, 0.55, 0.85), new THREE.Vector3(0.33, 0.93, 0.94), 0.35)
    const group = new THREE.Group()
    ;[1.35, 2.05, 2.75].forEach((radius, index) => {
      group.add(band(radius, radius * 0.62, index === 2 ? 0x55eef0 : 0x7db1f3))
    })
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2
      const inner = 0.4
      const outer = 2.45
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(a) * inner, Math.sin(a) * inner * 0.62, 0),
        new THREE.Vector3(Math.cos(a) * outer, Math.sin(a) * outer * 0.62, 0),
      ])
      group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xb49df0, transparent: true, opacity: 0.35 })))
    }
    const moon = band(0.28, 0.28, 0x55eef0)
    group.add(moon)
    scene.add(group)
    return {
      update(progress, time, motion) {
        plate.uniforms.uTime.value = time
        group.rotation.z = progress * 0.35
        const ang = progress * Math.PI * 2
        moon.position.set(Math.cos(ang) * 1.7, Math.sin(ang) * 1.05, 0.05)
        scenes.banneker.camera.position.set(-1.35, 0.15, 4.2 - progress * 0.25)
        scenes.banneker.camera.lookAt(0.85, 0, 0)
        void motion
      },
      plate,
    }
  })

  addScene("johnson", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.15, 0.45, 0.9), new THREE.Vector3(0.33, 0.93, 0.94), 0)
    const orbits = new THREE.Group()
    const specs = [
      [2.7, 1.35, 0.35, 0x55eef0],
      [1.9, 1.05, -0.45, 0x7db1f3],
      [1.15, 0.7, 0.15, 0xb49df0],
    ]
    for (const spec of specs) orbits.add(ellipseLine(spec[0], spec[1], spec[2], spec[3]))
    const craft = glowDot()
    scene.add(orbits)
    scene.add(craft.points)
    const earth = band(0.42, 0.42, 0xe7f2f2)
    scene.add(earth)
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        const spec = specs[0]
        const p = sampleEllipse(spec[0], spec[1], spec[2], progress * Math.PI * 2 * 0.85 + 0.4)
        craft.points.position.copy(p)
        craft.uniforms.uTime.value = time
        scenes.johnson.camera.position.set(-1.2 + progress * 0.15, 0.25, 4.3 - progress * 0.3)
        scenes.johnson.camera.lookAt(0.7, 0, 0)
      },
      plate,
    }
  })

  addScene("blackwell", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.71, 0.62, 0.94), new THREE.Vector3(0.33, 0.93, 0.94), 0)
    const field = makePoints(count, [2.4, 3.2, 1.6], true)
    field.points.position.x = 0.35
    scene.add(field.points)
    const tree = buildTree()
    tree.line.position.set(2.05, -0.2, 0.2)
    tree.line.scale.set(0.85, 0.85, 1)
    scene.add(tree.line)
    const path = [
      new THREE.Vector3(-1.4, 0.08, 4.2),
      new THREE.Vector3(-1.05, 0.16, 3.6),
      new THREE.Vector3(-0.75, 0.04, 3.2),
    ]
    return {
      update(progress, time, motion) {
        plate.uniforms.uTime.value = time
        field.uniforms.uTime.value = time
        field.uniforms.uMotion.value = motion
        field.uniforms.uCollapse.value = smoothstep(0.08, 0.62, progress)
        tree.uniforms.uReveal.value = smoothstep(0.02, 0.48, progress)
        cameraPath(scenes.blackwell.camera, path, smoothstep(0, 1, progress), new THREE.Vector3(1.7, 0, 0))
      },
      plate,
    }
  })

  addScene("lawson", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.33, 0.93, 0.94), new THREE.Vector3(0.2, 0.35, 0.55), 0)
    const colors = [new THREE.Color("#55eef0"), new THREE.Color("#7db1f3"), new THREE.Color("#b49df0")]
    const cards = colors.map((color, index) => {
      const mesh = slab(color)
      mesh.position.set(-1.8 + index * 0.35, 0.1 * (index - 1), -index * 0.08)
      scene.add(mesh)
      return mesh
    })
    const frame = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.7, -1.05, 0),
        new THREE.Vector3(1.7, -1.05, 0),
        new THREE.Vector3(1.7, -1.05, 0),
        new THREE.Vector3(1.7, 1.05, 0),
        new THREE.Vector3(1.7, 1.05, 0),
        new THREE.Vector3(0.7, 1.05, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xe7f2f2, transparent: true, opacity: 0.7 }),
    )
    scene.add(frame)
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        const slide = smoothstep(0.08, 0.78, progress) * 2.15
        cards.forEach((mesh, index) => {
          mesh.position.x = -1.9 + index * 0.28 + slide
        })
        scenes.lawson.camera.position.set(-0.7, 0.1, 3.7)
        scenes.lawson.camera.lookAt(0.85, 0, 0)
      },
      plate,
    }
  })

  addScene("dean", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.33, 0.93, 0.94), new THREE.Vector3(0.49, 0.69, 0.95), 1)
    const pts = []
    for (let y = -1.4; y <= 1.4; y += 0.4) {
      pts.push(new THREE.Vector3(-2.6, y, 0), new THREE.Vector3(2.6, y, 0))
    }
    for (let x = -2.4; x <= 2.4; x += 0.8) {
      pts.push(new THREE.Vector3(x, -1.5, 0), new THREE.Vector3(x, 1.5, 0))
    }
    scene.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x7db1f3, transparent: true, opacity: 0.45 }),
      ),
    )
    const packet = glowDot()
    packet.uniforms.uSize.value = 9
    scene.add(packet.points)
    const bars = [0x55eef0, 0x7db1f3, 0xb49df0].map((color, index) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.08, 1.4),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
      )
      mesh.position.set(1.8, -0.2 + index * 0.02, 0.1)
      scene.add(mesh)
      return mesh
    })
    return {
      update(progress, time) {
        plate.uniforms.uTime.value = time
        const stops = [
          [-2.2, -1.2],
          [0.2, -1.2],
          [0.2, 0.8],
          [2.1, 0.8],
        ]
        const span = stops.length - 1
        const x = clamp(progress, 0, 1) * span
        const i = Math.min(span - 1, Math.floor(x))
        const u = x - i
        packet.points.position.set(
          stops[i][0] + (stops[i + 1][0] - stops[i][0]) * u,
          stops[i][1] + (stops[i + 1][1] - stops[i][1]) * u,
          0.2,
        )
        bars.forEach((bar, index) => {
          bar.scale.y = 0.35 + smoothstep(0.2 + index * 0.1, 0.75, progress) * 0.9
        })
        scenes.dean.camera.position.set(-1.1, 0.1, 4.1 - progress * 0.2)
        scenes.dean.camera.lookAt(0.55, 0, 0)
      },
      plate,
    }
  })

  addScene("bridge", (scene) => {
    const plate = makePlate(new THREE.Vector3(0.33, 0.93, 0.94), new THREE.Vector3(0.71, 0.62, 0.94), 0)
    const field = makePoints(Math.floor(count * 0.7), [10, 4, 5], false)
    scene.add(field.points)
    for (let i = 0; i < 7; i += 1) {
      const y = -1.3 + i * 0.42
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-2.8, y, 0.4),
        new THREE.Vector3(2.8, y, 0.4),
      ])
      scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x55eef0, transparent: true, opacity: 0.28 })))
    }
    return {
      update(progress, time, motion) {
        plate.uniforms.uTime.value = time
        field.uniforms.uTime.value = time
        field.uniforms.uMotion.value = motion
        field.points.rotation.z = progress * 0.08
        scenes.bridge.camera.position.set(-1.15, 0.05, 4.0 - progress * 0.3)
        scenes.bridge.camera.lookAt(0.7, 0, 0)
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
    uBloom: { value: 0.42 },
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
    const aspect = cssW / Math.max(1, cssH)
    const capW = software ? 720 : 960
    const capH = software ? 450 : 600
    let w = Math.max(2, Math.round(Math.min(cssW * dpr, capW)))
    let h = Math.max(2, Math.round(w / aspect))
    if (h > capH) {
      h = capH
      w = Math.max(2, Math.round(h * aspect))
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
    const windowVh = 0.36
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
      finalPass.uniforms.uBloom.value = 0.42
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
  resize()
  for (const id of Object.keys(scenes)) renderScene(id, 0.45, 0, 0, rtA)
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 32))
  idle(() => {
    for (const scene of Object.values(scenes)) {
      renderer.compileAsync?.(scene.scene, scene.camera).catch(() => {})
    }
  })

  return {
    render,
    resize,
    disabled,
    rendererName,
    quality: software ? "software" : "hdr",
    dispose() {
      disposeTargets()
      renderer.dispose()
    },
  }
}

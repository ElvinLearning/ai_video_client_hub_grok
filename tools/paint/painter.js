import * as THREE from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"

/**
 * Turns a lit three.js scene into an oil painting.
 *
 * 1. Render the scene into a half-float target (MSAA).
 * 2. Tone map (ACES fit) and encode to display space.
 * 3. Structure tensor of the image, blurred, gives a stroke direction per pixel.
 * 4. Anisotropic Kuwahara with polynomial sector weights flattens areas into strokes
 *    that follow the forms (Kyprianidis et al.).
 * 5. Line integral convolution of noise along the same field paints bristle texture,
 *    then canvas weave, varnish grade, and vignette.
 *
 * Alpha survives every pass so layers can be cut apart for parallax.
 */

const QUAD_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const TONEMAP = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D src;
uniform float exposure;
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec4 c = texture(src, vUv);
  float a = clamp(c.a, 0.0, 1.0);
  vec3 rgb = a > 0.0001 ? c.rgb / a : vec3(0.0);
  rgb = toSRGB(aces(rgb * exposure));
  outColor = vec4(rgb * a, a);
}
`

const TENSOR = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D src;
uniform vec2 texel;
void main() {
  vec3 sx = (
    -1.0 * texture(src, vUv + texel * vec2(-1, -1)).rgb +
    -2.0 * texture(src, vUv + texel * vec2(-1, 0)).rgb +
    -1.0 * texture(src, vUv + texel * vec2(-1, 1)).rgb +
     1.0 * texture(src, vUv + texel * vec2(1, -1)).rgb +
     2.0 * texture(src, vUv + texel * vec2(1, 0)).rgb +
     1.0 * texture(src, vUv + texel * vec2(1, 1)).rgb) / 4.0;
  vec3 sy = (
    -1.0 * texture(src, vUv + texel * vec2(-1, -1)).rgb +
    -2.0 * texture(src, vUv + texel * vec2(0, -1)).rgb +
    -1.0 * texture(src, vUv + texel * vec2(1, -1)).rgb +
     1.0 * texture(src, vUv + texel * vec2(-1, 1)).rgb +
     2.0 * texture(src, vUv + texel * vec2(0, 1)).rgb +
     1.0 * texture(src, vUv + texel * vec2(1, 1)).rgb) / 4.0;
  outColor = vec4(dot(sx, sx), dot(sy, sy), dot(sx, sy), 1.0);
}
`

const BLUR = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D src;
uniform vec2 dir;
uniform float sigma;
void main() {
  int r = int(ceil(sigma * 2.5));
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int i = -r; i <= r; i++) {
    float w = exp(-float(i * i) / (2.0 * sigma * sigma));
    sum += texture(src, vUv + dir * float(i)) * w;
    wsum += w;
  }
  outColor = sum / wsum;
}
`

const KUWAHARA = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D src;
uniform sampler2D tfm;
uniform vec2 texel;
uniform float radius;
uniform float alpha;
uniform float hardness;
uniform float sharpness;
uniform float zeroCross;

void main() {
  vec3 g = texture(tfm, vUv).rgb;
  float disc = sqrt(max(0.0, g.y * g.y - 2.0 * g.x * g.y + g.x * g.x + 4.0 * g.z * g.z));
  float l1 = 0.5 * (g.y + g.x + disc);
  float l2 = 0.5 * (g.y + g.x - disc);
  vec2 v = vec2(l1 - g.x, -g.z);
  vec2 t = length(v) > 0.0 ? normalize(v) : vec2(0.0, 1.0);
  float phi = -atan(t.y, t.x);
  float A = (l1 + l2 > 0.0) ? (l1 - l2) / (l1 + l2) : 0.0;

  float kr = radius;
  float a = kr * clamp((alpha + A) / alpha, 0.1, 2.0);
  float b = kr * clamp(alpha / (alpha + A), 0.1, 2.0);
  float cp = cos(phi);
  float sp = sin(phi);
  mat2 R = mat2(cp, sp, -sp, cp);
  mat2 S = mat2(0.5 / a, 0.0, 0.0, 0.5 / b);
  mat2 SR = S * R;
  int maxX = int(sqrt(a * a * cp * cp + b * b * sp * sp));
  int maxY = int(sqrt(a * a * sp * sp + b * b * cp * cp));

  float zeta = 2.0 / kr;
  float sz = sin(zeroCross);
  float eta = (zeta + cos(zeroCross)) / (sz * sz);

  vec4 m[8];
  vec3 s[8];
  float ma[8];
  for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); ma[k] = 0.0; }

  for (int y = -maxY; y <= maxY; y++) {
    for (int x = -maxX; x <= maxX; x++) {
      vec2 p = SR * vec2(float(x), float(y));
      if (dot(p, p) > 0.25) continue;
      vec4 cs = texture(src, vUv + vec2(float(x), float(y)) * texel);
      vec3 c = cs.rgb;
      float ca = cs.a;
      float w[8];
      float sum = 0.0;
      float vxx = zeta - eta * p.x * p.x;
      float vyy = zeta - eta * p.y * p.y;
      float z;
      z = max(0.0, p.y + vxx); w[0] = z * z; sum += w[0];
      z = max(0.0, -p.x + vyy); w[2] = z * z; sum += w[2];
      z = max(0.0, -p.y + vxx); w[4] = z * z; sum += w[4];
      z = max(0.0, p.x + vyy); w[6] = z * z; sum += w[6];
      vec2 q = 0.70710678 * vec2(p.x - p.y, p.x + p.y);
      vxx = zeta - eta * q.x * q.x;
      vyy = zeta - eta * q.y * q.y;
      z = max(0.0, q.y + vxx); w[1] = z * z; sum += w[1];
      z = max(0.0, -q.x + vyy); w[3] = z * z; sum += w[3];
      z = max(0.0, -q.y + vxx); w[5] = z * z; sum += w[5];
      z = max(0.0, q.x + vyy); w[7] = z * z; sum += w[7];
      float gw = exp(-3.125 * dot(p, p)) / max(sum, 1e-6);
      for (int k = 0; k < 8; k++) {
        float wk = w[k] * gw;
        m[k] += vec4(c * wk, wk);
        s[k] += c * c * wk;
        ma[k] += ca * wk;
      }
    }
  }

  vec4 o = vec4(0.0);
  float oa = 0.0;
  for (int k = 0; k < 8; k++) {
    if (m[k].w <= 0.0) continue;
    vec3 mean = m[k].rgb / m[k].w;
    vec3 var = abs(s[k] / m[k].w - mean * mean);
    float sigma2 = var.r + var.g + var.b;
    float w = 1.0 / (1.0 + pow(hardness * 1000.0 * sigma2, 0.5 * sharpness));
    o += vec4(mean * w, w);
    oa += ma[k] / m[k].w * w;
  }
  // Colour is premultiplied, so averaging rgb and alpha with the same weights keeps them consistent.
  vec4 base = texture(src, vUv);
  outColor = o.w > 0.0 ? vec4(o.rgb / o.w, oa / o.w) : base;
}
`

const LIC = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D tfm;
uniform sampler2D noiseTex;
uniform vec2 texel;
uniform vec2 size;
uniform float grain;
uniform float steps;

// Where the image has no clear edge, strokes follow a broad, slowly turning field instead of noise.
vec2 brushField(vec2 uv) {
  float a = 0.75 + (texture(noiseTex, uv * size / 512.0 * 0.0025).r - 0.5) * 2.2;
  return vec2(cos(a), sin(a));
}
vec2 flow(vec2 uv) {
  vec3 g = texture(tfm, uv).rgb;
  float disc = sqrt(max(0.0, g.y * g.y - 2.0 * g.x * g.y + g.x * g.x + 4.0 * g.z * g.z));
  float l1 = 0.5 * (g.y + g.x + disc);
  float l2 = 0.5 * (g.y + g.x - disc);
  vec2 v = vec2(l1 - g.x, -g.z);
  vec2 t = length(v) > 1e-7 ? normalize(v) : vec2(0.8, 0.6);
  vec2 f = brushField(uv);
  float edge = smoothstep(0.00002, 0.0006, l1) * smoothstep(0.1, 0.6, (l1 - l2) / max(l1 + l2, 1e-7));
  if (dot(t, f) < 0.0) t = -t;
  return normalize(mix(f, t, edge));
}

void main() {
  vec2 ns = size / (512.0 * grain);
  vec2 d = flow(vUv);
  float acc = texture(noiseTex, vUv * ns).r;
  float wsum = 1.0;
  vec2 pf = vUv, pb = vUv, df = d, db = -d;
  int n = int(steps);
  for (int i = 1; i <= 40; i++) {
    if (i > n) break;
    vec2 f1 = flow(pf); if (dot(f1, df) < 0.0) f1 = -f1; df = f1;
    vec2 b1 = flow(pb); if (dot(b1, db) < 0.0) b1 = -b1; db = b1;
    pf += df * texel * 1.5;
    pb += db * texel * 1.5;
    float w = 1.0 - float(i) / (float(n) + 1.0);
    acc += (texture(noiseTex, pf * ns).r + texture(noiseTex, pb * ns).r) * w;
    wsum += 2.0 * w;
  }
  outColor = vec4(acc / wsum, 0.0, 0.0, 1.0);
}
`

const FINISH = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D src;
uniform sampler2D tfm;
uniform sampler2D noiseTex;
uniform sampler2D licTex;
uniform vec2 texel;
uniform vec2 size;
uniform float bristle;
uniform float impasto;
uniform float weave;
uniform float vignette;
uniform float mottle;
uniform float warmth;
uniform float seed;
uniform float opaque;
uniform sampler2D maskTex;
uniform float useMask;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }



void main() {
  vec4 c = texture(src, vUv);
  float a = c.a;
  vec3 rgb = a > 0.0001 ? c.rgb / a : vec3(0.0);

  // Bristle texture from the LIC pass, and an impasto relief lit from the upper left.
  vec2 d = vec2(0.0);
  float lic = texture(licTex, vUv).r - 0.5;
  float hx = texture(licTex, vUv + vec2(texel.x, 0.0)).r - texture(licTex, vUv - vec2(texel.x, 0.0)).r;
  float hy = texture(licTex, vUv + vec2(0.0, texel.y)).r - texture(licTex, vUv - vec2(0.0, texel.y)).r;
  float relief = dot(vec2(hx, hy), normalize(vec2(-0.7, 0.7)));
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb *= 1.0 + lic * bristle * (0.6 + 0.8 * lum);
  rgb += relief * impasto * (0.25 + lum);
  // Each stroke carries a little more or less pigment: low-frequency noise smeared along the field.
  vec2 cp = vUv * size / 512.0 * 0.18;
  float j1 = texture(noiseTex, cp).r - 0.5;
  float j2 = texture(noiseTex, cp * 1.7 + 0.31).r - 0.5;
  rgb *= 1.0 + vec3(j1 * 0.05, (j1 + j2) * 0.03, j2 * 0.05) * (0.5 + lum);

  // Canvas weave, strongest in lights where paint is thin.
  vec2 px = vUv * size;
  float wv = sin(px.x * 1.9) * sin(px.y * 1.9 + sin(px.x * 0.37) * 0.6);
  float grain = hash(floor(px * 0.75)) - 0.5;
  rgb *= 1.0 + (wv * 0.5 + grain * 0.6) * weave * (0.4 + lum);

  // Scumbled ground: big soft blotches show through the darks.
  float mott = texture(noiseTex, vUv * size / 512.0 * 0.012).r * 0.6 + texture(noiseTex, vUv * size / 512.0 * 0.03 + 0.5).r * 0.4 - 0.5;
  rgb += vec3(0.11, 0.075, 0.05) * mott * mottle * (1.0 - smoothstep(0.0, 0.35, lum));
  // Varnish: lift shadows toward umber, warm the mids, ease highlights.
  vec3 umber = vec3(0.075, 0.055, 0.04);
  rgb = mix(umber, rgb, smoothstep(-0.12, 0.35, lum) * 0.22 + 0.78);
  rgb *= mix(vec3(1.0), vec3(1.04, 1.0, 0.92), warmth);
  rgb = mix(vec3(lum), rgb, 0.94);

  if (opaque > 0.5) {
    vec2 q = vUv - 0.5;
    float vg = smoothstep(0.85, 0.2, length(q * vec2(1.05, 1.2)));
    rgb *= mix(1.0 - vignette, 1.0, vg);
  }
  rgb = clamp(rgb, 0.0, 1.0);
  if (useMask > 0.5) a = texture(maskTex, vUv).r;
  outColor = vec4(rgb * a, a);
}
`

function quadScene(material) {
  const scene = new THREE.Scene()
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  mesh.frustumCulled = false
  scene.add(mesh)
  return scene
}

function pass(fragmentShader, uniforms) {
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: QUAD_VERT,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  })
  return { material, scene: quadScene(material) }
}

function target(w, h, type = THREE.HalfFloatType, samples = 0) {
  return new THREE.WebGLRenderTarget(w, h, {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    samples,
    depthBuffer: samples > 0,
    colorSpace: THREE.NoColorSpace,
  })
}

function noiseTexture() {
  const size = 512
  const data = new Uint8Array(size * size * 4)
  let s = 1234567
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(rnd() * 255)
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, size, size)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

export function createPainter() {
  const canvas = document.createElement("canvas")
  document.body.appendChild(canvas)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setClearColor(0x000000, 0)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  const noise = noiseTexture()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const tone = pass(TONEMAP, { src: { value: null }, exposure: { value: 1 } })
  const tensor = pass(TENSOR, { src: { value: null }, texel: { value: new THREE.Vector2() } })
  const blur = pass(BLUR, { src: { value: null }, dir: { value: new THREE.Vector2() }, sigma: { value: 2 } })
  const kuwa = pass(KUWAHARA, {
    src: { value: null },
    tfm: { value: null },
    texel: { value: new THREE.Vector2() },
    radius: { value: 5 },
    alpha: { value: 1 },
    hardness: { value: 8 },
    sharpness: { value: 8 },
    zeroCross: { value: 0.58 },
  })
  const finish = pass(FINISH, {
    src: { value: null },
    tfm: { value: null },
    noiseTex: { value: noise },
    texel: { value: new THREE.Vector2() },
    size: { value: new THREE.Vector2() },
    licTex: { value: null },
    bristle: { value: 0.16 },
    impasto: { value: 0.5 },
    mottle: { value: 1 },
    weave: { value: 0.035 },
    vignette: { value: 0.35 },
    warmth: { value: 0.6 },
    seed: { value: 0 },
    opaque: { value: 1 },
    maskTex: { value: null },
    useMask: { value: 0 },
  })

  const lic = pass(LIC, {
    tfm: { value: null },
    noiseTex: { value: noise },
    texel: { value: new THREE.Vector2() },
    size: { value: new THREE.Vector2() },
    grain: { value: 2.2 },
    steps: { value: 18 },
  })

  function run(p, out) {
    renderer.setRenderTarget(out)
    renderer.render(p.scene, camera)
  }

  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })

  /** Coverage of `objects` in the final frame, occluded by everything else. Softened slightly. */
  function renderMask(shot, objects, w, h, soften = 1.4) {
    const keep = new Set()
    for (const obj of objects) obj.traverse((o) => o.isMesh && keep.add(o))
    const saved = new Map()
    shot.scene.traverse((o) => {
      if (!o.isMesh) return
      saved.set(o, { material: o.material, visible: o.visible })
      const additive = o.material?.blending === THREE.AdditiveBlending
      o.material = keep.has(o) ? white : black
      if (additive) o.visible = false
    })
    const bg = shot.scene.background
    shot.scene.background = null
    const rt = target(w, h, THREE.UnsignedByteType, 4)
    const tmp = target(w, h, THREE.UnsignedByteType)
    renderer.setRenderTarget(rt)
    renderer.setClearColor(0x000000, 1)
    renderer.clear()
    renderer.render(shot.scene, shot.camera)
    for (const [o, st] of saved) {
      o.material = st.material
      o.visible = st.visible
    }
    shot.scene.background = bg
    const out = target(w, h, THREE.UnsignedByteType)
    blur.material.uniforms.sigma.value = soften
    blur.material.uniforms.src.value = rt.texture
    blur.material.uniforms.dir.value.set(1 / w, 0)
    run(blur, tmp)
    blur.material.uniforms.src.value = tmp.texture
    blur.material.uniforms.dir.value.set(0, 1 / h)
    run(blur, out)
    rt.dispose()
    tmp.dispose()
    renderer.setClearColor(0x000000, 0)
    return out
  }

  /**
   * @param {{scene: THREE.Scene, camera: THREE.Camera}} shot
   * @param {{width:number,height:number,exposure?:number,radius?:number,passes?:number,bristle?:number,opaque?:boolean,vignette?:number,seed?:number}} opts
   */
  function paint(shot, opts) {
    const { width: w, height: h } = opts
    renderer.setSize(w, h, false)
    if (!shot.scene.environment) shot.scene.environment = room
    if (shot.envIntensity != null) shot.scene.environmentIntensity = shot.envIntensity

    const maskRT = opts.maskObjects ? renderMask(shot, opts.maskObjects, w, h) : null
    const raw = target(w, h, THREE.HalfFloatType, 4)
    const a = target(w, h)
    const b = target(w, h)
    const t1 = target(w, h)
    const t2 = target(w, h)

    renderer.setRenderTarget(raw)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(shot.scene, shot.camera)

    tone.material.uniforms.src.value = raw.texture
    tone.material.uniforms.exposure.value = opts.exposure ?? 1
    run(tone, a)

    const texel = new THREE.Vector2(1 / w, 1 / h)
    const radii = opts.radii ?? [opts.radius ?? 5, Math.max(2, (opts.radius ?? 5) * 0.5)]
    let src = a
    let dst = b
    for (const radius of radii) {
      tensor.material.uniforms.src.value = src.texture
      tensor.material.uniforms.texel.value.copy(texel)
      run(tensor, t1)
      blur.material.uniforms.sigma.value = opts.sigma ?? 2.2
      blur.material.uniforms.src.value = t1.texture
      blur.material.uniforms.dir.value.set(texel.x, 0)
      run(blur, t2)
      blur.material.uniforms.src.value = t2.texture
      blur.material.uniforms.dir.value.set(0, texel.y)
      run(blur, t1)

      kuwa.material.uniforms.src.value = src.texture
      kuwa.material.uniforms.tfm.value = t1.texture
      kuwa.material.uniforms.texel.value.copy(texel)
      kuwa.material.uniforms.radius.value = radius
      run(kuwa, dst)
      ;[src, dst] = [dst, src]
    }

    lic.material.uniforms.tfm.value = t1.texture
    lic.material.uniforms.texel.value.copy(texel)
    lic.material.uniforms.size.value.set(w, h)
    lic.material.uniforms.grain.value = opts.grain ?? 2.2
    lic.material.uniforms.steps.value = opts.steps ?? 18
    run(lic, t2)

    finish.material.uniforms.licTex.value = t2.texture
    finish.material.uniforms.impasto.value = opts.impasto ?? 0.5
    finish.material.uniforms.mottle.value = opts.mottle ?? 1
    finish.material.uniforms.src.value = src.texture
    finish.material.uniforms.tfm.value = t1.texture
    finish.material.uniforms.texel.value.copy(texel)
    finish.material.uniforms.size.value.set(w, h)
    finish.material.uniforms.bristle.value = opts.bristle ?? 0.16
    finish.material.uniforms.vignette.value = opts.vignette ?? 0.35
    finish.material.uniforms.seed.value = opts.seed ?? 0
    finish.material.uniforms.opaque.value = opts.opaque === false ? 0 : 1
    finish.material.uniforms.useMask.value = maskRT ? 1 : 0
    finish.material.uniforms.maskTex.value = maskRT ? maskRT.texture : null
    renderer.setRenderTarget(null)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(finish.scene, camera)

    for (const rt of [raw, a, b, t1, t2]) rt.dispose()
    if (maskRT) maskRT.dispose()
    return canvas
  }

  return { renderer, paint, room }
}

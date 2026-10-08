/**
 * The landing's chapters in page order. Each one owns a single scene, the name of the painting or
 * treatment behind it, so no two neighbours share a backdrop. Lineage works are chapters too, so
 * `goto("blackwell")` lands on that painting.
 */
export const chapters = [
  { id: "hero", scene: "still-life", nav: null },
  { id: "highlights", scene: "ground", nav: "highlights" },
  { id: "method", scene: "steps", nav: "method" },
  { id: "studio", scene: "easel", nav: "studio" },
  { id: "agent", scene: "orb", nav: "agent" },
  { id: "lineage", scene: "gallery", nav: "lineage" },
  { id: "banneker", scene: "almanac", nav: "lineage" },
  { id: "johnson", scene: "orbit", nav: "lineage" },
  { id: "blackwell", scene: "estimate", nav: "lineage" },
  { id: "lawson", scene: "cartridge", nav: "lineage" },
  { id: "pricing", scene: "ledger", nav: "pricing" },
  { id: "cta", scene: "letter", nav: null },
]

export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v))
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-5), 0, 1)
  return t * t * (3 - 2 * t)
}

/** 0 when the element's top reaches the viewport top, 1 when its bottom reaches the viewport bottom. */
export function pinProgress(rect, vh) {
  return clamp(-rect.top / Math.max(1, rect.height - vh), 0, 1)
}

/** Which of the method's three steps is showing, and how far each later plate has been brushed in. */
export function methodState(progress) {
  const wipe = [1, smoothstep(0.24, 0.4, progress), smoothstep(0.58, 0.74, progress)]
  const step = progress < 0.32 ? 0 : progress < 0.66 ? 1 : 2
  return { step, wipe }
}

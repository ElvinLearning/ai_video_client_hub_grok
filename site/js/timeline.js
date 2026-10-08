/** Every scroll-driven number, in viewport heights. Soft pins ease over SOFT. */

export const SOFT = 0.12

/** Each chapter owns one scene id. Neighbors must differ so the composite can wipe between them. */
export const chapters = [
  { id: "hero", start: 0, span: 1.85, scene: "studio" },
  { id: "lineage", start: 1.85, span: 1.35, scene: "gallery" },
  { id: "banneker", start: 3.2, span: 1.7, scene: "almanac" },
  { id: "johnson", start: 4.9, span: 1.7, scene: "orbit" },
  { id: "blackwell", start: 6.6, span: 2.55, scene: "estimate", settle: 0.62 },
  { id: "lawson", start: 9.15, span: 1.65, scene: "cartridge" },
  { id: "reel", start: 10.8, span: 1.55, scene: "reel" },
  { id: "method", start: 12.35, span: 1.6, scene: "steps" },
  { id: "pricing", start: 13.95, span: 1.7, scene: "ledger" },
  { id: "cta", start: 15.65, span: 1.45, scene: "aperture" },
]

export const end = chapters[chapters.length - 1].start + chapters[chapters.length - 1].span

/** Settled frame: after the soft corner, before the exit. */
export const states = Object.fromEntries(
  chapters.map((chapter) => {
    const settled =
      chapter.settle != null
        ? chapter.start + chapter.span * chapter.settle
        : chapter.start + Math.min(chapter.span * 0.42, SOFT + chapter.span * 0.34)
    return [chapter.id, Number(settled.toFixed(3))]
  }),
)

export function smoothstep(edge0, edge1, x) {
  const denom = edge1 - edge0
  const span = Math.abs(denom) < 1e-5 ? (denom < 0 ? -1e-5 : 1e-5) : denom
  const t = Math.min(1, Math.max(0, (x - edge0) / span))
  return t * t * (3 - 2 * t)
}

export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v))
}

export function pinHold(value, start, stop, soft = SOFT) {
  const fadeIn = start <= 0 ? 1 : smoothstep(start, start + soft, value)
  const fadeOut = 1 - smoothstep(stop - soft, stop, value)
  return fadeIn * fadeOut
}

export function chapterAt(value) {
  let current = chapters[0]
  for (const chapter of chapters) {
    if (value >= chapter.start) current = chapter
  }
  return current
}

/** Every scroll-driven number, in viewport heights. Soft pins ease over SOFT. */

export const SOFT = 0.12

export const chapters = [
  { id: "intro", start: 0, span: 1.15, scene: "field" },
  { id: "hero", start: 1.15, span: 1.9, scene: "field" },
  { id: "lineage", start: 3.05, span: 1.4, scene: "field" },
  { id: "banneker", start: 4.45, span: 1.75, scene: "banneker" },
  { id: "johnson", start: 6.2, span: 1.8, scene: "johnson" },
  { id: "blackwell", start: 8.0, span: 2.6, scene: "blackwell" },
  { id: "lawson", start: 10.6, span: 1.7, scene: "lawson" },
  { id: "dean", start: 12.3, span: 1.7, scene: "dean" },
  { id: "bridge", start: 14.0, span: 1.45, scene: "bridge" },
  { id: "method", start: 15.45, span: 1.45, scene: "bridge" },
  { id: "agent", start: 16.9, span: 1.4, scene: "bridge" },
  { id: "pricing", start: 18.3, span: 1.75, scene: "bridge" },
  { id: "cta", start: 20.05, span: 1.5, scene: "field" },
]

export const end = chapters[chapters.length - 1].start + chapters[chapters.length - 1].span

/** Settled frame: after the soft corner, before the exit. */
export const states = Object.fromEntries(
  chapters.map((chapter) => {
    const settled = chapter.start + Math.min(chapter.span * 0.42, SOFT + chapter.span * 0.34)
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
  const fadeIn = smoothstep(start, start + soft, value)
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

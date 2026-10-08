import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"
import { chapters, methodState } from "../site/js/timeline.js"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")

test("each chapter has its own scene", () => {
  const scenes = chapters.map((chapter) => chapter.scene)
  assert.equal(new Set(scenes).size, scenes.length)
  assert.equal(chapters[0].id, "hero")
  assert.equal(chapters.some((chapter) => chapter.id === "blackwell" && chapter.scene === "estimate"), true)
  const ids = chapters.map((chapter) => chapter.id)
  assert.equal(ids.includes("method"), true)
  assert.equal(ids.indexOf("method") < ids.indexOf("pricing"), true)
})

test("every chapter is on the page, in order", async () => {
  const html = await read("../site/index.html")
  const positions = chapters.map((chapter) => html.indexOf(`data-chapter="${chapter.id}"`))
  for (const [i, at] of positions.entries()) assert.notEqual(at, -1, `${chapters[i].id} is missing`)
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
})

test("the opening line says what the studio sells", async () => {
  const html = await read("../site/index.html")
  assert.equal(html.includes("AI video"), true)
  assert.equal(html.includes("for your business."), true)
  assert.equal(html.includes("Upload your brand."), true)
  assert.equal(html.includes("Cozy Agent shapes the brief."), true)
  assert.equal(html.includes("The studio delivers the videos."), true)
  assert.equal(html.includes("Send the brief."), true)
  assert.equal(html.includes("Measured."), false)
  assert.equal(html.includes("8 social-ready"), false)
  assert.equal(html.includes("$40"), false)
})

test("every picture the landing asks for exists", async () => {
  const html = await read("../site/index.html")
  const css = await read("../site/css/landing.css")
  const refs = new Set([...`${html}\n${css}`.matchAll(/\/media\/[\w.-]+\.(?:webp|png|jpg)/g)].map((m) => m[0]))
  assert.equal(refs.size > 20, true)
  for (const ref of refs) await access(new URL(`../site${ref}`, import.meta.url))
})

test("pictures carry alt text unless they are decoration", async () => {
  const html = await read("../site/index.html")
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(tag, /\balt="/, tag)
    const decorative = /alt=""/.test(tag)
    if (decorative) continue
    assert.match(tag, /alt="[^"]{12,}"/, tag)
  }
})

test("the method brushes each plate in before its step is shown", () => {
  assert.deepEqual(methodState(0), { step: 0, wipe: [1, 0, 0] })
  const middle = methodState(0.5)
  assert.equal(middle.step, 1)
  assert.equal(middle.wipe[1], 1)
  assert.equal(middle.wipe[2], 0)
  const end = methodState(1)
  assert.equal(end.step, 2)
  assert.deepEqual(end.wipe, [1, 1, 1])
})

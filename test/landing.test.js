import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { chapters } from "../site/js/timeline.js"

test("each chapter has its own scene", () => {
  const scenes = chapters.map((chapter) => chapter.scene)
  assert.equal(new Set(scenes).size, scenes.length)
  assert.equal(chapters[0].id, "hero")
  assert.equal(chapters.some((chapter) => chapter.id === "blackwell" && chapter.scene === "estimate"), true)
  assert.equal(chapters.some((chapter) => chapter.id === "method"), true)
  const method = chapters.find((chapter) => chapter.id === "method")
  const pricing = chapters.find((chapter) => chapter.id === "pricing")
  assert.equal(method.start < pricing.start, true)
})

test("the opening line says what the studio sells", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8")
  assert.equal(html.includes("AI video"), true)
  assert.equal(html.includes("for your business."), true)
  assert.equal(html.includes("Upload your brand."), true)
  assert.equal(html.includes("Cozy Agent shapes the brief."), true)
  assert.equal(html.includes("The studio delivers the videos."), true)
  assert.equal(html.includes("Send the brief."), true)
  assert.equal(html.includes("Why AI video"), true)
  assert.equal(html.includes("On the roadmap"), true)
  assert.equal(html.includes("Loopcraft"), false)
  assert.equal(html.includes("Aashish"), false)
  assert.equal(/\$\d/.test(html), false)
  assert.equal(html.includes("Measured."), false)
  assert.equal(html.includes("8 social-ready"), false)
  assert.equal(html.includes("$40"), false)
})

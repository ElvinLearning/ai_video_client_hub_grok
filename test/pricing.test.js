import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { internalOnly, plans, publicPricing } from "../config/pricing.js"

test("public pricing has no decided prices and no hub offer copy", () => {
  const payload = JSON.stringify(publicPricing())
  assert.equal(publicPricing().status, "early-access")
  assert.equal(payload.includes("40"), false)
  assert.equal(payload.includes("8 social-ready"), false)
  assert.equal(payload.includes("campaign reel"), false)
  for (const plan of publicPricing().plans) {
    assert.equal(plan.placeholder, true)
    assert.equal(plan.priceUsd, null)
    assert.equal(plan.videosPerMonth, null)
    assert.equal(plan.credits, null)
  }
  assert.equal(plans.some((plan) => plan.name === "Cozy Agent" && plan.cozyAgent), true)
})

test("internal note keeps the undecided monthly figure off the public payload", () => {
  assert.equal(internalOnly.mustAlignWithHub, true)
  assert.deepEqual(internalOnly.hubPlanNames, ["Growth", "Scale"])
  assert.equal(internalOnly.optionsOnTheTable[1].discussedRoughMonthlyUsd, 40)
  assert.equal(internalOnly.optionsOnTheTable[1].decided, false)
  assert.equal(JSON.stringify(publicPricing()).includes("discussedRoughMonthlyUsd"), false)
})

test("landing does not print the hub plan or a dollar price", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8")
  assert.equal(html.includes("8 social-ready"), false)
  assert.equal(html.includes("$40"), false)
  assert.equal(html.includes("David"), true)
  assert.equal(html.includes("National Academy of Sciences"), true)
})

/** Fills the pricing section from GET /api/pricing. The static markup stays if the request fails. */
export async function mountPricing() {
  const grid = document.getElementById("pricing-grid")
  if (!grid) return
  try {
    const response = await fetch("/api/pricing")
    if (!response.ok) throw new Error("pricing")
    const pricing = await response.json()
    const title = document.getElementById("pricing-title")
    const lede = document.getElementById("pricing-lede")
    const note = document.getElementById("pricing-note")
    if (title) title.textContent = pricing.headline
    if (lede) lede.textContent = pricing.lede
    if (note) note.textContent = pricing.alignment
    grid.replaceChildren()
    for (const plan of pricing.plans) {
      const card = document.createElement("article")
      card.className = plan.cozyAgent ? "plan plan-premium" : "plan"
      const kicker = el("p", "plan-kicker", `${plan.cozyAgent ? "Premium tier" : "Studio"} · placeholder`)
      const name = el("h3", "", plan.name)
      const price = el("p", "plan-price", plan.priceLabel)
      const cadence = el("p", "plan-cadence", `Per ${plan.cadence}. Not a quote.`)
      const list = document.createElement("ul")
      for (const item of plan.includes) list.appendChild(el("li", "", item))
      card.append(kicker, name, price, cadence, list)
      grid.appendChild(card)
    }
    grid.appendChild(el("p", "early-flag", "Early access · pricing coming soon"))
  } catch {
    grid.dataset.state = "fallback"
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.textContent = text
  return node
}

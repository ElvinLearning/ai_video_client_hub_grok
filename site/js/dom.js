import { SOFT, chapterAt, chapters, end, pinHold, smoothstep } from "./timeline.js"

export function placeChapters(film) {
  const spacer = document.getElementById("spacer")
  for (const chapter of chapters) {
    const el = document.querySelector(`[data-chapter="${chapter.id}"]`)
    if (!el) continue
    if (!film) {
      el.style.position = ""
      el.style.top = ""
      el.style.height = ""
      const card = el.querySelector(".pin-card")
      if (card) card.style.transform = ""
      continue
    }
    el.style.position = "absolute"
    el.style.left = "0"
    el.style.right = "0"
    el.style.top = `${chapter.start * 100}vh`
    el.style.height = `${chapter.span * 100}vh`
  }
  const credits = document.querySelector(".credits")
  if (credits) {
    if (film) {
      credits.style.position = "absolute"
      credits.style.top = `${(end + 0.55) * 100}vh`
      credits.style.left = "0"
    } else {
      credits.style.position = ""
      credits.style.top = ""
    }
  }
  if (spacer) spacer.style.height = film ? `${(end + 1.7) * 100}vh` : "0px"
}

export function applyScroll(value, film) {
  const track = document.getElementById("track")
  const vh = window.innerHeight || 1
  if (!film) {
    if (track) track.style.transform = "none"
    return chapterAt(value).id
  }
  track.style.transform = `translate3d(0, ${(-value * vh).toFixed(2)}px, 0)`
  let active = chapters[0].id
  for (const chapter of chapters) {
    const el = document.querySelector(`[data-chapter="${chapter.id}"]`)
    const card = el?.querySelector(".pin-card")
    if (!card) continue
    const start = chapter.start
    const stop = chapter.start + chapter.span
    const hold = pinHold(value, start, stop, SOFT)
    card.style.transform = `translate3d(0, ${((value - start) * vh * hold).toFixed(2)}px, 0)`
    const fadeIn = start <= 0 ? 1 : smoothstep(start, start + SOFT, value)
    const fadeOut = 1 - smoothstep(stop - SOFT, stop, value)
    card.style.opacity = String(Math.min(fadeIn, fadeOut))
    const local = (value - start) / chapter.span
    const rise = (1 - smoothstep(0.04, 0.28, local)) * 36 * hold
    const title = card.querySelector(".rise")
    if (title) title.style.transform = `translate3d(0, ${rise.toFixed(2)}px, 0)`
    if (value >= start + SOFT * 0.4) active = chapter.id
  }
  const bar = document.querySelector(".progress > span")
  if (bar) bar.style.transform = `scaleX(${Math.min(1, value / end)})`
  document.querySelectorAll("[data-goto]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.goto === active)
  })
  return active
}

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
      const includes = plan.includes.map((item) => `<li>${item}</li>`).join("")
      card.innerHTML = `
        <p class="plan-kicker">${plan.cozyAgent ? "Premium tier" : "Studio"} · placeholder</p>
        <h3>${plan.name}</h3>
        <p class="plan-price">${plan.priceLabel}</p>
        <p class="plan-cadence">Per ${plan.cadence}. Not a quote.</p>
        <ul>${includes}</ul>
      `
      grid.appendChild(card)
    }
    const flag = document.createElement("p")
    flag.className = "early-flag"
    flag.textContent = "Early access · pricing coming soon"
    grid.appendChild(flag)
  } catch {
    grid.dataset.state = "fallback"
  }
}

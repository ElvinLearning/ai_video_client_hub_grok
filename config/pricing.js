/**
 * Pricing config for the AI video product.
 *
 * NOTHING IN THIS FILE IS A QUOTE.
 * Every price and allowance is a placeholder. Do not render a dollar figure
 * from here as if it had been decided.
 *
 * Alignment with the Cozy Client Hub (hub.cozydigital.org):
 * The hub already sells live plans named Growth and Scale. Final pricing for
 * THIS product must line up with those plans so a client never gets two
 * different quotes. Do not paste the hub's plan contents onto this landing
 * as this product's offer. When a number is eventually chosen, it has to be
 * the same number the hub would give that client.
 *
 * Options still on the table, neither decided:
 *   1. Credit packs (size and price unset).
 *   2. A monthly plan for a set number of videos.
 *      A rough figure discussed internally was on the order of $40 / month.
 *      That figure is NOT a price. It stays in `internalOnly` and is stripped
 *      from the public pricing payload.
 */

export const pricingMeta = {
  status: "early-access",
  headline: "Pricing, soon.",
  lede: "Early access is open. The plans below show the shape of the offer. The numbers are not decided, and they are not a quote.",
  publicAlignment:
    "When prices are set, they will be the same numbers Cozy Digital quotes in the client hub. You will not be handed two different figures.",
}

/**
 * Internal notes. Never returned by /api/pricing.
 * discussedRoughMonthlyUsd is not a price.
 */
export const internalOnly = {
  hubPlanNames: ["Growth", "Scale"],
  mustAlignWithHub: true,
  optionsOnTheTable: [
    {
      id: "credit-packs",
      label: "Credit packs",
      decided: false,
      priceUsd: null,
      credits: null,
    },
    {
      id: "monthly",
      label: "Monthly set of videos",
      decided: false,
      priceUsd: null,
      videosPerMonth: null,
      discussedRoughMonthlyUsd: 40,
    },
  ],
}

export const plans = [
  {
    id: "studio",
    name: "Studio",
    tier: "standard",
    placeholder: true,
    priceUsd: null,
    priceLabel: "Price to be set",
    cadence: "month",
    videosPerMonth: null,
    credits: null,
    cozyAgent: false,
    includes: [
      "Logo, product photos, and a brief kept on file",
      "A monthly video allowance — the number is not set",
      "Review with the studio before the cut is final",
    ],
  },
  {
    id: "cozy-agent",
    name: "Cozy Agent",
    tier: "premium",
    placeholder: true,
    priceUsd: null,
    priceLabel: "Price to be set",
    cadence: "month",
    videosPerMonth: null,
    credits: null,
    cozyAgent: true,
    includes: [
      "Everything in Studio",
      "A branded assistant that helps write the brief and pick shots",
      "Generations queued from that conversation",
    ],
  },
]

/**
 * Sandbox balance for early-access accounts so the portal can show
 * "remaining allowance" and decrement it. This is not a purchased pack
 * and not the future plan.
 */
export const earlyAccessPreview = {
  label: "Preview allowance",
  credits: 3,
  note: "Complimentary preview credits for this build. Not a purchased balance, and not a plan price.",
}

export function publicPricing() {
  return {
    status: pricingMeta.status,
    headline: pricingMeta.headline,
    lede: pricingMeta.lede,
    alignment: pricingMeta.publicAlignment,
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      tier: plan.tier,
      placeholder: true,
      priceUsd: null,
      priceLabel: plan.priceLabel,
      cadence: plan.cadence,
      videosPerMonth: null,
      credits: null,
      cozyAgent: plan.cozyAgent,
      includes: plan.includes,
    })),
    options: [
      { id: "credit-packs", label: "Credit packs", decided: false },
      { id: "monthly", label: "A monthly set of videos", decided: false },
    ],
  }
}

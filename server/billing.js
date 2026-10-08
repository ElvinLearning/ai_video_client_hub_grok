/**
 * Stripe seam. No live charges.
 * When STRIPE_SECRET_KEY and a price id exist, this is the place a Checkout
 * Session would be created. Until then the route explains that billing is not on.
 */

export function billingStatus() {
  const configured = Boolean(process.env.STRIPE_SECRET_KEY)
  return {
    provider: "stripe",
    ready: false,
    configured,
    mode: "seam",
    message: configured
      ? "Stripe credentials are present, but Checkout is not switched on in this build."
      : "Billing is not connected. Early access does not charge a card.",
  }
}

export function checkoutSeam(planId) {
  return {
    ok: false,
    planId: planId || null,
    ...billingStatus(),
  }
}

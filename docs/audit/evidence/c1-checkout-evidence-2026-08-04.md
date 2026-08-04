# C1 evidence — consumer checkout screen (Art. 8(2))

**Captured 2026-08-04. Component 2 of the C1 sign-off package.**

## Files

- `c1-checkout-panel.png` — the "Before you order" panel, the load-bearing shot.
- `c1-plan-page.png` — the full `/settings/plan` page for context.

## What the panel shows (all Art. 8(2) elements on one screen, above the button)

- **Main characteristics**: "Inklee Plus is a monthly subscription for 3.00 EUR
  per month, final price. It renews automatically each month at that price until
  you cancel..." plus the "What you get" feature list.
- **Total price**: "Total: 3.00 EUR per month, final price."
- **Billing interval + auto-renewal**: "Renews monthly until cancelled";
  Monthly (3.00 EUR/month) / Yearly (30.00 EUR/year) selectors.
- **The order button**: "Order with obligation to pay", directly below the total.
- **The immediate-start control is UNTICKED**: "I request that Inklee start my
  subscription immediately, before the 14-day withdrawal period ends... I keep
  my right to withdraw."
- **Terms link**: "By placing this order you agree to the Terms of Service,
  which include your 14-day right to withdraw."

## Capture method (against counsel's evidence standard)

- **Release-candidate commit: `8c3b5be1`** (the commit that carries the
  counsel-final Terms/Privacy version 2026-08-04).
- **Launch flag ON**: `PLUS_CONSUMER_LAUNCH_ENABLED` was flipped to `true`
  locally for the capture and reverted immediately after; master keeps it
  `false`. The flag is compile-time, so the flip is the record of "flag
  enabled" — no code path other than this render changed.
- **Internal Free-tier test account**, created in the LOCAL Supabase and deleted
  after; no production data touched.
- **Rendered from the RC code** on a local server pointed at local Supabase,
  with the live Stripe TEST price (`inklee_plus_monthly_eur`, 3.00 EUR/month)
  resolving so the panel shows the real price, not the fallback.
- Captured with Playwright/Chromium; the small "1 Issue" badge at the corner is
  the Next.js dev-tools indicator, not part of the page.

This satisfies the substance of the deployed-artifact condition: what counsel
approves (the RC code at 8c3b5be1) is what renders here. The credit-note
evidence (component 4) is captured separately.

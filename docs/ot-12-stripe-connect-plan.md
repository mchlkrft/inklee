# OT-12 Stripe Connect — slice plan

**Why:** locked decision D3 (commerce layer). Goods money routed through Inklee's single platform account makes Inklee merchant/seller of record (VAT, refunds, product liability). Stripe Connect moves each artist's money to their own connected account; Inklee facilitates and never owns the funds.

**Production money gate:**

```
canChargeCheckoutAddons(settings)  ==  per-artist `checkout_addons` flag
                                       AND deployment-wide `CHECKOUT_ADDONS_PROD_READY=true` env var (prod only)
```

Once Connect is fully wired the gate will also require the artist's connected account to be `active`. The env var stays as the deployment-wide kill switch (founder flips it explicitly when OT-12.3 ships).

---

## Account type: Express

Stripe-hosted onboarding + dashboard; Inklee controls the in-app flow and the connection point. The artist's identity / banking / KYC is handled inside Stripe — Inklee never sees the bank account number, ID document, or tax form. Simpler than Custom (which would require Inklee to host all of that), more in-app than Standard (which puts the artist on stripe.com).

## Charge model: Direct charges

When the artist's connected account is active, payment intents are created on the artist's account directly. The artist is the merchant of record. Inklee passes platform identifier via `on_behalf_of` and optional `application_fee_amount` (deferred to billing layer; D6 keeps paywall readiness only).

Existing deposit flow (artist's money, Inklee's platform account) is technically the same shape and will migrate to direct charges in OT-12.2.

## Sub-slices

### OT-12.1 — Foundation (this session)

- Migration `0039_stripe_connect.sql`: `profiles.stripe_account_id`, `stripe_account_status`, `stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_account_country`, `stripe_account_updated_at`.
- `src/lib/stripe-connect.ts`: pure helpers (`deriveConnectStatus(account)` mapping a Stripe `Account` → our `ConnectStatus` union) + thin service-role wrappers around create-account, sync, account-link.
- `src/app/(artist)/settings/payouts/page.tsx` + `actions.ts` + return/refresh routes: artist-facing UI to start onboarding, refresh the AccountLink mid-flow, and see status.
- `src/app/api/stripe/webhook/route.ts`: handle `account.updated` and `account.application.deauthorized`.
- Settings nav gains "Payouts".
- Tests for `deriveConnectStatus`.
- **NOT included:** no change to `requestDeposit`, no change to `prepareCheckoutAction`, no change to `getAddonProducts` gating. Existing money flow is untouched.

### OT-12.2 — Charge integration ✅ shipped

- `requestDeposit` (`src/app/(artist)/bookings/actions.ts`): when the artist's Connect routing returns `routeCharges=true` (status='active' + charges_enabled=true), the PaymentIntent is created with `on_behalf_of: artist.stripe_account_id` + `transfer_data.destination`. The intent itself stays on Inklee's platform account (destination-charge pattern, NOT direct charges), so `prepareCheckoutAction` and the webhook need NO changes — they continue to update + receive events on the platform account exactly as before. The customer-facing statement, fee rules, and refund flow are presented as if the charge were on the artist's account. The audit log gains a `stripe_connect_routed` boolean for traceability.
- `getAddonProducts` (`src/lib/addon-products.ts`): now also gates on `stripe_account_status='active'` + `stripe_charges_enabled=true`. Un-connected, pending, restricted, or disabled artists return an empty addon catalogue, so goods checkout silently disappears from the customer portal without any other code paths needing per-artist branching. Interest signalling (`getInterestEligibleProducts`) is unchanged — public shop still lets clients mark interest regardless of Connect state.
- New helper `deriveConnectRouting({ stripe_account_id, stripe_account_status, stripe_charges_enabled })` in `src/lib/stripe-connect.ts` + 5 vitest cases. `getConnectRoutingForArtist(artistId)` is the server-side wrapper that fetches + decodes in one call.
- `canChargeCheckoutAddons` left as-is (per-artist feature flag + env gate); the artist's Connect readiness is enforced one layer up in `getAddonProducts` instead so the artist-flag check stays cheap (pure settings read) and the connect-readiness check happens only when the caller actually needs the catalogue.

**Future enhancement (deferred):** switch from destination charges + on_behalf_of to true direct charges (PaymentIntent created on the artist's account via `stripeAccount` request option). Direct charges give the cleanest legal "artist is merchant of record" stance but require the frontend Elements integration to know the artist's account context (`loadStripe(pk, { stripeAccount })`). Reserved for after counsel confirms whether destination charges with on_behalf_of satisfy LO-2 in the legal package.

### OT-12.3 — Production cutover (next slice)

After OT-12.1 + OT-12.2 are deployed + the migration applied, OT-12.3 is mostly an operational rollout, not new code:

- Real test artists onboard via `/settings/payouts` in Stripe **test mode** (current state). Verify the round trip: `unset` → `pending` → `active`, deposits route through Connect, customer pays, deposit lands in the artist's Stripe test balance, goods checkout appears on the customer portal once the artist toggles their goods addon flag.
- Counsel signs off on LO-2 (PSD2 / merchant-of-record analysis) — confirms whether destination charges + on_behalf_of are sufficient or if we need to upgrade to direct charges before live mode.
- Founder flips `CHECKOUT_ADDONS_PROD_READY=true` in the prod Vercel env.
- Stripe is moved from test to live keys for at least one onboarded artist; that artist transacts a real deposit + (optionally) a real good.
- First-artist soak (§3.4 in roadmap) starts on the real artist.

## Webhook events

| Event                                | Action                                                                                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account.updated`                    | Re-derive `ConnectStatus` from the account payload and persist to `profiles`. Sets `stripe_charges_enabled`, `stripe_payouts_enabled`, country, updated-at.                      |
| `account.application.deauthorized`   | Artist disconnected the Inklee platform from inside their Stripe dashboard. Clear local fields back to the `unset` state; do not delete the row (booking history references it). |
| `payment_intent.succeeded` (Connect) | Already handled — OT-12.2 will dispatch on the event's `account` field to look up the right artist. No-op in OT-12.1.                                                            |

## Failure modes the implementation must defend against

- **AccountLink expires.** Stripe AccountLinks expire 5 minutes after creation. The settings page has a "Resume onboarding" CTA that creates a fresh link.
- **Onboarding abandoned mid-flow.** Account stays in `pending`. Webhook keeps state in sync; UI shows "Continue onboarding" while pending.
- **Account becomes restricted post-launch.** Webhook flips `stripe_charges_enabled=false`; gating in OT-12.2 disables goods checkout for that artist until cleared.
- **Artist deauthorizes Inklee from their Stripe dashboard.** `account.application.deauthorized` clears local state to `unset`. The artist's existing booking history stays intact but goods checkout for new bookings stops working until they re-connect.
- **Crafted return URL.** Return route does NOT trust query params for status; it re-fetches the account via `stripe.accounts.retrieve(stripe_account_id)` server-side.
- **Cross-artist account hijack.** The Connect helpers only operate on the authenticated artist's `stripe_account_id` from their own profile row. A user cannot specify an arbitrary account id.

## Env vars

- `STRIPE_SECRET_KEY` — already present, must be a platform-account key (not connected).
- `STRIPE_WEBHOOK_SECRET` — already present, covers Connect events when the webhook endpoint is registered for `account.*` in Stripe.
- New: a separate `STRIPE_CONNECT_WEBHOOK_SECRET` is NOT needed for OT-12.1 — Stripe sends Connect events to the same endpoint with the standard secret; the `account` field on the event identifies the connected account.
- `CHECKOUT_ADDONS_PROD_READY` — stays the deployment-wide kill-switch from the audit fix sweep; lifted only at OT-12.3.
- `NEXT_PUBLIC_APP_URL` — already present; used as the base for AccountLink return / refresh URLs.

## Reading order for OT-12.3

When resuming for OT-12.3 (operational rollout):

1. This doc § "Sub-slices → OT-12.3".
2. `docs/codex-audit-goods-feature.md` — confirm the D11 invariants still hold post-rollout.
3. `legal/HANDOFF-TO-CLAUDE-CODE.md` § LO-2 — capture the counsel determination on direct vs destination charges before flipping `CHECKOUT_ADDONS_PROD_READY=true` in prod.

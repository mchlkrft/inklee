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

### OT-12.2 — Charge integration (next session)

- `requestDeposit`: when artist has an active Connect account, create the PaymentIntent with `on_behalf_of: artist.stripe_account_id` and `transfer_data.destination`. Otherwise current platform-account behaviour.
- `prepareCheckoutAction`: same wiring on the update path; carries `metadata.stripe_account_id` so the webhook can dispatch correctly.
- Webhook idempotency stays decoupled (booking-side / order-side); `payment_intent.succeeded` arriving from a connected account is dispatched via the `account` field on the event.
- `canChargeCheckoutAddons` extended to also require `stripe_charges_enabled` on the artist; `getAddonProducts` returns empty for un-connected artists.

### OT-12.3 — Production cutover (next next session)

- Founder flips `CHECKOUT_ADDONS_PROD_READY=true` in prod.
- At least one real artist onboarded as a connected account in prod.
- Test transactions on the real artist's connected account.
- First-artist soak (§3.4 in roadmap) starts.

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

## Reading order for OT-12.2

When resuming for OT-12.2:

1. This doc § "Sub-slices → OT-12.2".
2. `src/lib/stripe-connect.ts` (built in OT-12.1).
3. `src/app/(artist)/bookings/actions.ts` `requestDeposit` — primary integration point.
4. `src/app/request/[token]/actions.ts` `prepareCheckoutAction` — secondary integration point.
5. `src/lib/features.ts` `canChargeCheckoutAddons` — extend to require connect-active.

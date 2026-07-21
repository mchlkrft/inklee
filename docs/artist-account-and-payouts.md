# Artist account, entitlements and payouts

**Written 2026-07-21.** How an artist account is described by the system: what
states it has, what unlocks card deposits, how a founder comps someone, and how
payouts are set up and verified. Written after the first live money test failed
in a way that none of these surfaces made visible.

This is the description doc. The commercial/legal framing lives in
`docs/payment-flow-for-counsel.md`; the tier strategy lives in
`docs/business-model.md`; the live blocker list lives in `docs/launch-gate.md`.

---

## 1. The three independent axes

An artist account is described by three things that are easy to confuse, and
confusing them is what cost a day of debugging. **All three must line up before
a client can pay a deposit by card.**

| Axis | Stored in | Question it answers |
| --- | --- | --- |
| **Account status** | `profiles.account_status` | Is this account active, suspended, or archived? |
| **Entitlement** | `account_overrides` (plan tier + per-feature overrides) | Is this artist *allowed* to collect card deposits? |
| **Payout account** | `profiles.stripe_*` | Can Stripe actually *route a charge* to them? |

An artist can be entitled but unroutable (comped to Plus, Stripe onboarding not
finished) or routable but unentitled (payouts connected, still on Free). Either
way the deposit request quietly becomes a **manual** deposit. That is correct
product behaviour, and the request screen says so before the artist sends it,
but for a long time nothing in the admin UI showed the two halves together, so a
correct comp looked broken. The admin account page now shows payout status
directly beside the entitlement.

---

## 2. Entitlements

The engine is pure and lives in `packages/shared/src/entitlements.ts`; the
service-role read is `apps/web/src/lib/entitlements-server.ts`.

- **Plan tiers** are `free` and `plus`. Free grants **nothing**; Plus grants the
  whole feature set. The only feature enforced today is `deposits` (in-app card
  deposit collection); the rest are placeholders for the paid-billing slice.
- **Per-feature overrides** beat the plan baseline in both directions, so an
  account can be granted `deposits` while on Free, or have it revoked while on
  Plus.
- **Expiry**: a Plus plan with a past `plan_expires_at` falls back to Free
  automatically. An explicit per-feature override has **no expiry of its own**
  and therefore outlives the plan.
- **Default**: an artist with no `account_overrides` row is Free with no
  overrides. That is the state every new artist starts in.

**A failed read is not "Free".** `getAccountOverrides` throws rather than
returning the default when the query itself fails, because silently resolving to
Free would issue a manual deposit to a comped artist's client with no trace of
why.

### How a founder comps a beta artist

`/admin/accounts/<id>` → the "Plan, entitlements & fees" panel. Set the tier to
Plus with source `comp`, optionally with an expiry. The write is a service-role
upsert, audit-logged, and takes effect on the artist's next request — there is
no caching layer in front of it.

**Check the payout line in the same panel.** If it does not say `Connected`, the
grant is real but the artist still cannot take card deposits, and the panel says
so explicitly.

### Expiry is visible, not automatic

Nothing sweeps `plan_expires_at`. There is no cron and no notification, by
deliberate choice: the deployment is on a plan whose schedules are daily-only,
and a silent background job is exactly the kind of moving part that fails
quietly. Instead the state is made visible in two places that share one rule
(`daysUntilPlanExpiry`):

- the **admin roster** has a Plan column showing days remaining, tinted inside a
  fortnight and marked expired once it lapses;
- the **account panel** states it in words.

When a comp lapses the artist's card deposits stop and neither party is told.
That is a known gap; the visibility above is what makes it manageable.

---

## 3. Fee sponsorship

Inklee can waive its own 3% for an artist, optionally with an expiry and a
spending cap. The client still pays exactly the deposit and the artist still
receives it in full; Inklee simply earns nothing and still bears Stripe's
processing cost.

- **The waiver is all-or-nothing per deposit**, because the fee is fixed when
  the PaymentIntent is created and Stripe cannot partially waive it afterwards.
  The decision therefore runs against the **actual fee** of that deposit, not
  against "the budget still has something left in it".
- **Spend is recorded at settlement**, not at request time. Deposits outstanding
  at the same moment are each measured against the same remaining budget, so
  they can collectively overshoot the cap. This is bounded by the fees in flight
  and is **reported** in the admin panel rather than hidden by clamping the
  number, because the money really was foregone and the counter is the
  accounting record.
- **A refund credits the budget back.** Refunds return the application fee, so a
  sponsored deposit that is refunded costs Inklee nothing and must not keep
  consuming the artist's allowance.
- **Resetting usage** starts a new budget period. It is irreversible (the
  previous total survives only in the audit log) so it asks for confirmation,
  and it clears the per-booking stamps so an older booking's refund cannot draw
  against the new period.

> **Engineering rule.** Never release a waiver against the PaymentIntent's
> `sponsored_fee_cents` metadata. That records what Inklee *intended* to waive,
> not proof that the artist's counter was ever charged. The settlement increment
> is skipped on orphaned payments and swallowed errors, and the counter is
> artist-global, so releasing an unbooked waiver erases other bookings' real
> usage. Release only against what settlement actually booked
> (`booking_requests.deposit_fee_sponsorship_booked_cents`, migration `0100`).

---

## 4. The payout account

Inklee uses **Stripe Connect Custom with `requirement_collection: application`**:
the artist never visits Stripe, and Inklee is responsible for collecting
everything Stripe needs. The consequence is that **any requirement Inklee cannot
collect is a dead end for that artist**, which is why the document upload below
exists.

### Status values

`profiles.stripe_account_status`, derived by `deriveConnectStatus`:

| Status | Meaning | Artist sees |
| --- | --- | --- |
| `unset` | No account yet | Not connected |
| `pending` | Onboarding started, details not submitted | Onboarding in progress |
| `active` | Charges and payouts enabled, nothing past due | Connected |
| `restricted` | Stripe needs something, or we found the account unreachable | Action needed |
| `disabled` | Stripe disabled the account | Disabled by Stripe |

Only `active` **plus** `stripe_charges_enabled` routes a charge
(`deriveConnectRouting`).

### The cached status can be wrong

These columns are a snapshot of the last successful sync, not live truth. In
July 2026 two accounts onboarded before the live-key switch remained `active` in
the database while being invisible to the live Stripe key. The system now
downgrades the cached state when Stripe reports the account unreachable, using a
deliberately **narrow** test: the error must name the account, because every
Stripe 403 shares one error type and a platform-level fault (a restricted or
rotated key) would otherwise downgrade every artist at once.

The account id is **not** cleared automatically, because a status downgrade is
undone by the next successful sync whereas erasing ids across the fleet is not.

> **Operational note.** `ensureConnectAccount` reuses a stored account id, so an
> artist whose Connect account is genuinely gone cannot re-onboard until an
> admin clears `stripe_account_id`, `stripe_account_status`,
> `stripe_charges_enabled`, `stripe_payouts_enabled` and
> `stripe_account_country` on their profile. Clearing those is the fix, not a
> workaround.

### Verification documents

Stripe asks some accounts for an identity document, and sometimes a second
document such as proof of address. It can ask an **active** account with a
future deadline, which is the window in which the artist can still fix it
without losing payouts, so the requirement list is fetched for every live
account rather than only for pending or restricted ones.

The artist uploads on `/settings/payouts`. Accepted formats are **JPG, PNG or
PDF** (not WEBP, which Stripe accepts on upload and then refuses at review). The
file goes straight to Stripe from memory and is never stored or logged by
Inklee. When Stripe refuses a document, its own reason is shown so the artist
knows what to fix instead of re-uploading the same unusable photo.

---

## 5. Diagnosing "the client has no pay button"

The symptom is a booking in `deposit_pending` whose portal shows a plain
"deposit requested" card. Work down the three axes:

1. **Does the booking have a client secret?** Query `booking_requests` for
   `deposit_client_secret` and `deposit_payment_intent_id`. Both null means the
   deposit was created as manual.
2. **Was the artist entitled?** Check `account_overrides` for the artist:
   effective tier and any `deposits` override.
3. **Was the artist routable?** Check `profiles.stripe_account_id`,
   `stripe_account_status`, `stripe_charges_enabled` — then confirm against
   Stripe itself, because the cached values can lie. Retrieve the account under
   **both** the live key and the test key; a mode mismatch shows up immediately.

If all three look right and the deposit still came out manual, the Stripe call
failed. That used to be silent; it now surfaces as an error to the artist and is
captured for diagnosis.

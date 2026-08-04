# Runbook: Plus purchase confirmation sent without Terms text (BILL-CONF-001)

**Owner: founder / ops. Status: active.** This runbook is counsel's condition
for carrying BILL-CONF-001 as a disclosed residual (master-package §6.8): the
degraded confirmation-email path is acceptable **only if** it emits a monitoring
event AND a corrective resend is part of a runbook. The event exists; this is
the resend half.

## What the defect is

The Plus purchase confirmation (Art. 8(7) durable medium) normally carries the
accepted Terms text inline. On a degraded path the email still sends but with
**no Terms text**: either the consent row had no `terms_version`
(`reason: no_terms_version`) or the Terms snapshot could not be read
(`reason: snapshot_unreadable`). The email is still marked `delivery_status =
'sent'`. Only the silent failure was fixed (a Sentry warning now fires); the
email still ships Terms-less, so a human must detect and resend it.

Source: `apps/web/src/lib/server/billing/withdrawal.ts` (the degraded branch
around the `recordDurableConfirmation` composition); table
`billing_contract_confirmations` (migration `0106`, §10).

## 1. Trigger

A Sentry event, level **warning**:

> "Plus purchase confirmation sent without inline Terms text"

- tags: `action = billing_durable_confirmation`
- extra: `reason` (`no_terms_version` | `snapshot_unreadable`), `artistId`,
  `termsVersion`

**Founder TODO (one-time):** configure a Sentry **alert rule** on this message.
It is warning-level, so without a rule it is a breadcrumb, not a monitor, and
this runbook never triggers. Route it to the ops channel.

## 2. Detection / scope

The two reasons differ in how findable they are after the fact.

- **`no_terms_version` is queryable.** The row has a null `terms_version` while
  marked sent. Purchase rows carry a Stripe invoice id:

  ```sql
  select id, artist_id, stripe_invoice_id, generated_at, delivered_at
  from billing_contract_confirmations
  where terms_version is null
    and delivery_status = 'sent'
    and stripe_invoice_id is not null
  order by generated_at desc;
  ```

- **`snapshot_unreadable` is NOT DB-detectable.** `terms_version` is stamped
  before the snapshot read is attempted, so the row looks identical to a healthy
  send. The **Sentry event is the only positive record** (hence the alert rule
  above is load-bearing). Forensic fallback: `payload_hash` is a hash of the
  exact subject+body that was sent, so a regenerated body that includes the
  Terms text will not match a stored hash from a Terms-less send. Comparing
  requires reconstructing the dynamic body (amounts, dates); use it only to
  confirm a suspected case, not to discover one.

Identify the affected buyer from the Sentry `artistId` + `termsVersion` and the
matching `billing_contract_confirmations` row.

## 3. Corrective action

1. Confirm the healthy Terms snapshot for that `termsVersion` now reads
   (`content/legal/_versions/{version}/terms.md` exists and
   `verify-legal-artifacts.cjs` passes). If it does not, fix the snapshot first
   (a `snapshot_unreadable` cause is usually a missing/renamed frozen version).
2. Regenerate the confirmation for the affected subscription/invoice WITH the
   inline Terms text, and resend it to the buyer, noting in the email that it
   replaces the earlier confirmation and completes the record.
3. Record the resend: append a new `billing_contract_confirmations` row for the
   corrected send (append-only table; do not mutate the defective row), and note
   the incident + resend against the Sentry issue.

## 4. Why this is the acceptable posture

An Art. 8(7)-defective confirmation that nobody notices is a silent compliance
failure; one that alerts and gets a corrective resend is an incident with a
remedy (counsel §6.8). The residual after this runbook: the buyer received a
Terms-less confirmation for the window between the send and the resend, closed
by the resend and the durable record it leaves.

## Related

- Register: `BILL-CONF-001` (the observability fix, commit `8e75dcc`, is the
  event half; this runbook is the resend half).
- A stale code comment at `withdrawal.ts:234-236` references a "check 11 of the
  legal-artifact validator" that does not exist; it is corrected to point here.

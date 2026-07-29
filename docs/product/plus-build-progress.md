# Plus build: live progress log

**Purpose:** a supervisor-readable status file, updated as work happens, so
progress can be monitored without interrupting implementation. The PLAN lives
in `plus-build-plan.md`; this file is the running state of executing it.

Last updated: 2026-07-29, native parity slice complete, pending commit.

---

## Current objective

**Stage P5, goods tools.** Build the remaining commerce features behind the
Plus package. Everything lands dark or Free-invisible; consumer billing stays
closed throughout (DB-backed launch key untouched).

P5d shipped. Now closing the two NATIVE PARITY GAPS that P5b and P5c opened
(discount editor, drop/preorder fields), because an out-of-date parity row is
a bug by the founder rule and these are the only two open ones.

---

## Completed and pushed

| Stage | Commit | What |
|---|---|---|
| P3a | `e28c62d` | Conditional booking-form questions, web + native (migration 0114) |
| P3b-f | `879ddbb` | Booking-form templates, cover unification, confirmation page, custom slug, scheduled books-open date |
| P4 | `536b067` | Large-project mode: schema, intake, artist UI, native twins (migration 0115) |
| P5a | `4687c19` | Platform fee engine, fee actuals, refund-policy data, dispute handling (migration 0116) |
| P4 follow-up | `54ec5fc` | Project client portal + project emails (migration 0117) |
| P5b | `7e504db` | Discount codes (migration 0118) |
| Audit fixes | `1f8b5e9` | Seven findings from the self-audit of the above |
| P5c | `9ce0b21` | Scheduled drops, preorders, low-stock alerts (migration 0119) |
| P5d | `d890a07` | Product collections (migration 0120) |

Migrations 0114-0120 are applied to production and verified there.

**Live config change:** the Stripe LIVE webhook endpoint
(`we_1TpPmyHkG0exykzFYTq26SyV`) now subscribes to
`charge.dispute.created/updated/closed`, so the P5a dispute handler is
actually reachable. Verified by re-reading the endpoint.

---

## In progress

Nothing mid-flight. The native parity slice is done: both ⬜ rows in the parity
register are now ✅, with no schema work, since both were editors over cores
that already existed. All six acceptance criteria met.

**Both need a fresh EAS build to reach devices** (no OTA).

## Blocked or postponed

| Item | Why |
|---|---|
| Fee schedule v2 activation | Needs accountant approval of fee and tax treatment. No longer blocked by engineering: the goods fee base is correct now that discounts exist. |
| `fee-refund-policy` v1 activation | Same accountant approval, plus Terms review. |
| Bundles | Multi-product pricing with its own stock and refund semantics. Larger than the rest of P5 combined; deliberately after collections, which it would build on. |
| Goods sales analytics | Belongs with the P6 analytics plane rather than duplicating a second reporting path. |
| Shop customization beyond the appearance system | The shared appearance system already covers the visual layer; what remains is unspecified. |
| Variants+ beyond today's basic set | No concrete requirement recorded beyond what exists. |
| Fresh EAS build | The two native editors are on master but not on devices. Batched with whatever native work comes next rather than burning a build per slice. |
| Cover image Free-vs-Plus conflict | Founder decision, logged in `plus-commercial-packages.md` §7. |

---

## Next intended action

Commit and push the native parity slice. Bundles are then the largest unstarted
P5 item, and now have collections to build on.

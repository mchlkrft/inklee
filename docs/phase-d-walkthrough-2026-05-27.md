# Phase D — live walkthrough findings

**Date:** 2026-05-27
**Format:** founder describes flow + observes UI, Claude follows along, catches issues an agent wouldn't notice.
**Goal:** prioritized punch list. Ship the fixes, then announce.

Severity legend:

- **B** Blocker — must fix before launch.
- **H** High — fix before launch if possible; otherwise within first week.
- **M** Medium — fix in first launch sprint.
- **L** Low — nice-to-have, parking-lot.

---

## Surfaces covered

- [ ] Artist flow: signup → onboarding → first slot/trip → public preview → booking received → accept → deposit → cancel → 2FA enable
- [ ] Customer flow: `/start` → demo `/bert-grimm` (or via subdomain `bert-grimm.inkl.ee`) → submit booking → magic-link portal → reschedule → cancel
- [ ] Admin flow: `/admin` → roster → suspend/reactivate → analytics with tester exclusion
- [ ] Mobile pass: all of the above at 375px on the floating-pill chrome
- [ ] Edge cases: books closed → waitlist; cap reached → waitlist; flash booking; trip-scoped booking; honeypot + autofill; `/[slug]/waitlist`; subdomain not-found "claim this name" page (Slice 71)

---

## Findings

_Appended as we go._

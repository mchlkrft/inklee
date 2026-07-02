# GitHub Publishing Strategy

**Status:** Active. Created 2026-07-02. Internal source of truth for what Inklee publishes on GitHub and how.
**Scope:** governs both public GitHub surfaces (see §3). Complements `docs/seo-strategy.md` (inklee.app SEO) and `docs/business-model.md` (positioning). Publishing cadence detail also lives in memory `template-repo-cadence`; this doc is the canonical version and that memory now points here.
**Owner:** Michel Kraeft.

> This document is forward-looking. It does not require rewriting or de-indexing anything already published. It sets the bar for what gets published next.

---

## 1. Purpose of GitHub publishing

GitHub is a supporting surface, not the conversion platform. inklee.app is where artists sign up. GitHub exists to:

- **Build technical credibility and trust** through honest, first-hand product documentation and a visible history of real development.
- **Give away genuinely useful, tool-neutral resources** to tattoo artists (templates, workflow guides) under an open license.
- **Be discoverable and citable** by search engines and AI retrieval systems (GEO), because well-structured, honest, specific docs get quoted.

If a piece of content does not do at least one of those three things, it does not belong on GitHub.

## 2. What GitHub is NOT used for

- Not a marketing blog. Not a place to hit a keyword quota or a posting streak.
- Not a second copy of inklee.app. Product marketing, pricing, and conversion copy live on the website.
- Not a dumping ground for internal strategy. Business model, pricing math, security-audit findings, legal/counsel drafts, and launch-gate operational detail are internal and should not be casually public (see the exposure note in §11).
- Not a changelog of trivial commits. Small fixes ship silently.

## 3. Two public surfaces, two roles

Inklee has **two public GitHub repositories**. They must stay in their lanes to avoid competing with each other and with inklee.app.

| Surface | Role | Primary reader | Publishes |
| --- | --- | --- | --- |
| `mchlkrft/inklee` (product repo, public) | Product transparency, development history, technical credibility | Developers, technical evaluators, AI retrieval | A real README front door, honest release notes tied to shipped milestones, a small set of product-principles / technical-decision docs |
| `mchlkrft/tattoo-booking-form-template` (content repo, public) | Free, tool-neutral resources for tattoo artists + GEO | Tattoo artists, search engines, AI retrieval | Copy-paste templates, tool-neutral workflow guides, worked examples |

**Rule:** product-specific content (how Inklee works, what shipped, architecture) belongs in the product repo. Tool-neutral artist resources belong in the content repo. Commercial and comparison intent belongs on inklee.app (§8).

## 4. Intended audiences

Every document names ONE primary reader and is written for them. Do not try to serve all four in one doc.

1. **Tattoo artists evaluating or using Inklee** (content-repo guides, product-repo README/principles). Plain language, no jargon, demonstrative.
2. **Search engines and AI retrieval systems** (a secondary beneficiary of good structure, never the primary author). Clear headings, honest specifics, one topic per doc.
3. **Developers / technical evaluators** (product-repo README, technical-decision docs). Precise, evidence-based.
4. **Potential contributors** (CONTRIBUTING, translation guidance in the content repo). Concise and practical.

## 5. Publishing categories

A small, non-overlapping set. Every publication is exactly one category.

1. **Tool-neutral workflow guide** (content repo): how to run a tattoo booking workflow with any tool. Never restates the Inklee pitch.
2. **Reusable template / example** (content repo): a copy-paste form, message pack, or worked example.
3. **Product transparency doc** (product repo): what Inklee is and is not, how a core workflow actually works, honest limitations. Demonstrative, not promotional.
4. **Technical-decision note** (product repo): a real architectural or product decision and its trade-offs.
5. **Release note + changelog** (either repo): what shipped and why it matters (§10).
6. **Maintenance update:** accuracy/link/terminology/feature-status fixes to existing docs (§11).

Categories that do NOT fit Inklee's GitHub and are intentionally excluded: marketing/announcement posts, opinion/thought-leadership blogging, and keyword landing pages (those are inklee.app's job).

## 6. Recommended rhythm

**Kill the fixed quota.** The 3-day cadence (set 2026-06-24) is retired: on a niche subject it forces filler, formulaic intros, and topic-stretching, and it exhausts the useful-topic backlog in about two weeks. Publishing is now event-driven and quality-gated, not calendar-driven.

- **Release-driven** (the main trigger). When Inklee ships a meaningful feature, workflow improvement, integration, architectural change, or important fix, that MAY justify a release note + changelog entry, and occasionally a workflow or transparency doc. Cadence = whenever real work ships.
- **Evergreen documentation.** A new tool-neutral guide or product doc is created only when a genuinely new, distinct topic passes the qualification test (§7). Realistic ceiling: **at most about one net-new evergreen doc per month, often fewer.** No floor. Substantially updating an existing doc usually beats adding a new one.
- **Maintenance review.** Every **4 to 6 weeks**, run the maintenance checklist (§11). It produces recommendations; it does NOT automatically produce a post.
- **Minor development activity.** Normal commits and small fixes get no dedicated post. At most a one-line changelog entry when it is user-relevant.

**When nothing qualifies, publish nothing.** A quiet week on GitHub is fine. Real development is the story; manufacturing activity is not.

## 7. Post qualification test

A new document publishes only if it passes ALL of these. If any answer is no, update an existing doc, add a changelog line, publish on inklee.app instead, or do nothing.

- [ ] **New information:** does it say something not already covered in an existing doc?
- [ ] **Grounded:** is it based on a shipped feature or a verified product decision (not a plan, not a hope)?
- [ ] **Distinct intent:** does it serve a search/reader intent no existing doc already owns (§9)?
- [ ] **Better than an update:** would expanding an existing doc serve the reader better? If yes, do that instead.
- [ ] **Demonstrable:** can the claims be shown (a real template, a real screenshot, a real workflow, a real decision)?
- [ ] **Right location:** is GitHub the correct home, versus inklee.app (§8) or a changelog line?
- [ ] **Serves the reader:** does it help someone understand, evaluate, integrate with, or trust Inklee?
- [ ] **One named reader:** is the primary audience identified and the whole doc written for them?

## 8. SEO and GEO principles

- Write for the reader first. Structure (clear headings, tables, checklists, FAQ, honest specifics) is what makes a doc both useful and citable. Never write a paragraph for a crawler that a human would not want to read.
- **No keyword stuffing.** Delete "if you are searching for X, Y, or Z, this is the resource" style sentences. One clear title and honest body text rank fine.
- **Cross-property ownership (prevents SERP self-competition):**
  - **inklee.app owns commercial and comparison intent** ("tattoo booking software", "X vs Y", "X alternative", feature/deposit/waitlist landing pages). See `docs/seo-strategy.md`.
  - **The content repo owns tool-neutral how-to and templates** ("how to write a tattoo booking form", "tattoo deposit policy template"). It must not restate the commercial pitch or become a second comparison page.
  - **The product repo owns product-transparency and technical intent** ("how Inklee handles X", "what Inklee is and is not").
  - If a planned GitHub doc would target the same query as an existing inklee.app page, either reframe it to a genuinely different (tool-neutral or transparency) angle or do not publish it.
- No fabricated statistics, no invented usage numbers, no testimonials. Illustrative figures must be labeled hypothetical.

## 9. Cannibalization safeguards

**One authoritative document per major topic.** Topics to keep single-owner (they may link to each other, but must not repeat the same intro and pitch): tattoo booking requests, booking forms, deposits, guest spots, appointment management, client management, public artist pages, artist shops, Instagram-DM alternatives, waitlists, aftercare and touch-ups, cancellations and no-shows.

Before publishing, decide with this ladder:

1. Does an existing doc already own this intent? → **Expand that doc.**
2. Is it a small correction or a shipped small change? → **Changelog entry** (and a README section only if it changes how the repo is used).
3. Is it a meaningful shipped milestone? → **Release note.**
4. Is it commercial/comparison/conversion intent? → **Publish on inklee.app**, not GitHub.
5. Is it a genuinely new, distinct, tool-neutral or transparency topic that passes §7? → **New document.**

A guide and its template/example are complementary and allowed. Two documents that share a thesis, an intro, and a keyword are not: merge or differentiate them.

## 10. Release-note rules

Release notes exist to explain **value**, not to list diffs.

- Lead with what changed for the reader and why it matters, in one or two sentences.
- Then the specifics (what shipped, what it replaces, any limitations or "still needs X").
- Only publish a release note for a meaningful change. Small fixes get a changelog line or nothing.
- Never describe an unshipped or flag-gated feature as available. If it is behind a flag or test-mode, say so.
- Keep semantic-version tags for the content repo (they are cheap and readable), but do not invent a "release" just to tag activity.

## 11. Maintenance process

Run every 4 to 6 weeks, or after any significant product change. The review produces a short recommendation list; it does **not** oblige a new post.

Checklist:

- [ ] Review recent product changes (roadmap, changelog, shipped slices) for anything worth documenting.
- [ ] Check documentation accuracy: outdated screenshots, broken links, obsolete product claims, wrong terminology, stale pricing/cadence references, inaccurate feature status.
- [ ] Detect overlapping documents targeting the same intent (§9); flag for merge/differentiate.
- [ ] Identify genuine publication opportunities and run each through the §7 test.
- [ ] Recommend updates; publish only what passes the test.

**Standing accuracy fixes already identified (recommendations, not yet applied):**

- Content-repo README FAQ "updated every two weeks, then monthly" is now factually wrong; reword to a flexible, honest cadence.
- Two keyword-stuffing sentences (content-repo README line 9 and the Google Forms doc intro) should be softened to read for humans.
- The guest-spot workflow doc's "Example structure" counts read as data; label them hypothetical.
- The waitlist *template* file carries prose that duplicates the waitlist guide; trim the template to the form and let the guide own the explanation.

**Governance / exposure (HIGH, founder decision required):** the `mchlkrft/inklee` product repo is public and currently exposes internal strategy and security material (business model, security-audit findings, launch-gate operational detail, counsel drafts, and security-incident detail in AGENTS.md). Decide whether the repo should be private, or whether internal docs should be moved out of the public tree, before treating the product repo as an intentional public surface. Do not expand public product-repo content until this is resolved.

## 12. Recommended next publications

Grounded in the actual shipped product state and the audit. None describe unshipped features as available. Each names the evidence required before publishing.

| # | Working title | Reader | Intent | Why it deserves to exist | Type | Must not duplicate | Evidence required | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Product-repo README rewrite: what Inklee is, what ships today, how the core workflow works | Developers + technical evaluators | Product transparency / "what is Inklee" | The public product repo is the transparency surface and currently has a 2-line dev README | Update (README) | inklee.app marketing copy (stay factual, not promotional) | Confirmed shipped feature list (`docs/inklee-feature-scope.md`) | High |
| 2 | Internal-docs exposure review (governance) | Founder | n/a (risk) | Public repo leaks internal strategy/security docs (§11) | Maintenance / decision | n/a | Confirm repo visibility intent | High |
| 3 | Handling tattoo cancellations, no-shows, and reschedules | Tattoo artists | "tattoo cancellation / no-show policy" | Missing standalone topic; rules are currently buried in the deposit doc | New doc (content repo) | `tattoo-deposit-policy-template.md` (link, do not restate) | Cancel/reschedule + refund-on-cancel are shipped | High |
| 4 | Tattoo client messages that sound like you (confirmations, reminders, decline, running-late) | Tattoo artists | "tattoo appointment reminder / confirmation message" | No message library exists; every workflow references declining/reminding with no template | New template (content repo) | Aftercare snippets + the DM-reply snippet | Reminder emails + accept/pass emails are shipped | Medium |
| 5 | Keeping tattoo client notes and history | Tattoo artists | "tattoo client notes / history" (native, not "CRM") | Distinct shipped topic (client records) not yet covered tool-neutrally | New doc (content repo) | `tattoo-booking-form-fields.md` | Clients feature (auto-collected clients, history, private notes) is shipped | Medium |
| 6 | What Inklee is and is not (product principles) | Artists + AI retrieval | Product transparency / scope | Honest scope guardrails build trust and are highly citable; missing on GitHub | New doc (product repo) | inklee.app About (transparency angle, not marketing) | Scope facts from `docs/inklee-feature-scope.md` (request-approval not self-booking; not a marketplace; goods showcase-only; no studio tier yet) | Medium |
| 7 | A varied worked example: a large multi-session project request | Tattoo artists | "tattoo booking request example" | The two existing examples are near-identical small fineline pieces | New example (content repo) | The two existing examples | None (fictional, clearly labeled) | Medium |
| 8 | Books-open / books-closed announcement templates | Tattoo artists | "books open announcement" | The waitlist flow assumes these but none are provided | New template (content repo) | `tattoo-waitlist-guide.md` | Books open/closed toggle is shipped | Low |
| 9 | CONTRIBUTING + translation guidance | Contributors | Community/translation | README invites translations; no path exists | New doc (content repo) | README | None | Low |

Do not publish more than one or two of these per month, and only after each passes §7.

## 13. Ownership and review responsibilities

- **Owner:** the founder decides what publishes and when. No autonomous publishing and no scheduled auto-posting.
- **Trigger:** a publication is triggered by a shipped milestone or a founder request, then qualified by §7. The recurring maintenance review (§11) recommends but never auto-publishes.
- **Gate before any publish:** §7 test passed, style rules (below) met, em-dash scan clean (project copy rule), links verified, no unshipped-feature claims.
- **Cross-reference:** keep this doc, `docs/seo-strategy.md`, and memory `template-repo-cadence` consistent when the strategy changes.

---

## Writing and tone rules

**Voice:** direct, specific, calm, human, technically credible. Useful without being promotional. Understandable to non-developers whenever the doc is product- or artist-facing. Scene-native, but do not force tattoo slang.

**Structure (adapt, do not force):** every doc is written top-down for its one named reader. Use tables, checklists, and copy-paste blocks where they help. Not every doc needs the same skeleton.

**Kill the formula.** The audit found the three newest content-repo docs share a templated intro ("hook → this guide covers X → it pairs with A and B, and it works with any tool") and 7 of 9 guides open with a pain-point cold-open. Future docs must vary their openings and get to the substance faster. Do not reuse the same intro paragraph shape twice in a row.

**Avoid:** "revolutionary", "game-changing", "seamless", "all-in-one solution", generic SaaS language, unsupported superiority claims, keyword stuffing, repeated introductory paragraphs, artificially long explanations, fake usage statistics, fabricated testimonials, and any claim about a feature that is not shipped (or that omits a flag/test-mode caveat).

**Reusable post template (adapt per doc):**

```
# Title (one clear topic)

Intended reader: <one audience>

<Problem or context, in the reader's terms, 1-3 sentences. No stock cold-open reused from another doc.>

## What Inklee does / How the workflow works
<The substance: the workflow, the fields, the decision, the template.>

## Product evidence  (product-facing docs)
<A real template, screenshot, shipped behavior, or decision. Show, do not assert.>

## Limitations / current status
<Honest scope: what is not covered, what is behind a flag or in test mode.>

## Related
<Links to the one authoritative doc per adjacent topic. Do not repeat their intros.>

<Optional single relevant inklee.app link, no hard sell.>
```

## Changelog

- **2026-07-02 (created).** Established this doc as the GitHub publishing source of truth after auditing the `tattoo-booking-form-template` content repo and confirming both repos are public. Key decisions: retire the 3-day cadence for a milestone/evergreen/maintenance hybrid; split the two public surfaces by role; add a cross-property cannibalization rule (inklee.app owns commercial/comparison intent); add a post-qualification test and an anti-formula writing rule; flag the public product repo's internal-docs exposure for a founder decision. No published content was rewritten or de-indexed.

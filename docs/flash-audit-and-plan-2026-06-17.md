# Flash feature: audit, scope, and slice plan

**Created:** 2026-06-17 · **Status:** plan awaiting founder decisions (§5) before implementation.
**How this was produced:** a multi-agent workflow (6 parallel auditors across web backend / web public / mobile app / mobile API / data+RLS / scope-docs → synthesis → target design → slice plan → 3 adversarial critics). All three critics returned `needs-revision`; their blocker fixes are folded into the plan in §6, and the two load-bearing ones were re-verified against the code (see §8).

---

## 1. TL;DR

Flash is **two tables** (`flash_items`, `flash_days`) that are **mature on the web artist backend**, **~55% parity on the app**, and **structurally short of your vision in three ways no current slice covers**:

1. **A design can live in at most ONE day.** `flash_items.flash_day_id` is a single FK. "Attaching" a design to a new day silently **moves it off the old one** (and blanks the old day's public page) with no warning. There is no reuse-across-days. → needs a **`flash_day_items` junction** (many-to-many).
2. **No folders/groups exist anywhere.** Zero schema, zero UI, both surfaces. → needs a **`flash_folders`** concept + a folder-or-singles day builder.
3. **The public flash-day page is a vertical list, not your grid.** It bounces clients to a per-design subpage to book. → needs the **square-tile overview grid with hover + click-to-modal inline booking**, reusing the existing booking pipeline.

Plus real cleanups the audit surfaced: a **public-flash SEO oversight** (the flash pages are fully indexable while the booking page is `noindex`), an **availability count that disagrees between mobile list and detail**, **duplicated formatters** (web vs app), a **stale `db/schema.ts`**, and **doc over-claims** (roadmap E7 reads "shipped" but mobile lacks Instagram + day curation; the 60d doc reads "done" but quietly reduced the grid+modal day page to a list).

The work is planned as **9 slices (FX-0…FX-8)**, DB → shared core → web backend → web public → mobile API → mobile app → QA/docs, with the migration-day breakages and the single-source-of-truth window explicitly closed.

---

## 2. Current state — capability matrix (web vs app)

`working` / `partial` / `broken` / `missing`

| Capability | Web | App | Notes |
|---|---|---|---|
| Create/upload design (manual) | working | working | Web: quick-create image-first modal. App: one-tap draft POST then photo editor (the "create is GET-only" parity-doc claim is stale). |
| Import designs from Instagram | working | **missing** | Web: connect/sync/import. App: no IG screen, no `/api/mobile/flash/instagram`. Largest app gap. |
| Organize into folders/groups | **missing** | **missing** | No table/column/UI anywhere. Vision #4, entirely unbuilt. |
| Edit design metadata | working | working | Shared `FlashItemForm` (modal + subpage), one `updateFlashItemAction`. App covers all but slug + IG url (web-only by design). |
| Quick tile actions (publish / toggle bookable) | working | partial | App folds these into the edit form, no one-tap from the list. |
| Designs overview layout | working | partial | Web: responsive square grid (but **shows archived** — clutter). App: vertical list, not the web grid. Neither has search/sort/filter UI. |
| Create/edit flash day | working | working | App **cannot set `studio_id`** (web-only + sticky). |
| Attach designs to a day | partial | **missing** | Web: multi-select attach, but via the **single FK** (silently moves). App: no day-items UI/endpoint. |
| Public day page — browse | partial | n/a | Web: exists, `is_public`-gated, but a **vertical list**, not a grid. (App is artist-only — not a parity gap.) |
| Public day — grid + hover quick-action | **missing** | n/a | Vision #2, unbuilt. |
| In-day modal booking | **missing** | n/a | Vision #2, unbuilt. Booking always navigates to the subpage. |
| Single-design subpage (shareable + book) | working | n/a | Vision #3, satisfied on web. |
| Booking server action (validation/anti-abuse/availability/persist/notify) | working | n/a | Robust: zod, honeypot, origin allow-list, rate-limit, future-date, availability re-check, 60s dedupe, magic-link, audit_log, emails. |
| Availability engine (shared) | working | working | `computeFlashAvailability` is the single engine. **Caveat:** list route counts 3 statuses, item-detail counts only `approved` → they can disagree (G10). |
| Calendar integration | partial | working | Both render day markers; neither filters by status (cancelled/past days still show). |
| Price/label formatters | working | partial | App **re-implements** them (drift risk, ME-10). "Price on request" (web) vs "On request" (app). |
| Public-pages SEO/noindex | **broken** | n/a | No metadata/robots on the 3 public flash routes; `robots.ts` only disallows the *backend* `/flash`. Public flash is fully indexable while the booking page is `noindex`. |

---

## 3. Data model: current → target

**Current.** `flash_items(… flash_day_id → flash_days SET NULL, folder? NO …)`, `flash_days(… studio_id, is_public …)`. RLS: artist-`FOR ALL` on both; the anon public-SELECT policies were **dropped in migrations 0030/0031**, so every public read goes through `serviceClient` with status/`is_public` gating in `.eq()` clauses (not RLS). No junction, no folders. `db/schema.ts` is **stale** (missing `studio_id` + `is_public`).

**Target (additive, nothing dropped):**
- **`flash_day_items`** junction — `(id, day_id→flash_days CASCADE, item_id→flash_items CASCADE, artist_id→profiles CASCADE [denormalized for single-column RLS + serviceClient artist filter], position int, created_at, UNIQUE(day_id,item_id))`. RLS: artist `FOR ALL`, **no anon policy** (public reads stay on `serviceClient`, matching the 0030/0031 lockdown — re-adding anon would reopen the enumeration leak).
- **`flash_folders`** — `(id, artist_id→profiles CASCADE, name, position int, created_at)` + **`flash_items.folder_id`** nullable FK `SET NULL` (one folder per design, flat). RLS: artist `FOR ALL`.
- **`flash_items.flash_day_id`** — **kept, demoted** to a back-compat / "primary day" hint that the shared writer keeps synced; no longer the membership source. Dropping it is a **separate later migration** once all mobile clients update (dropping a prod column is irreversible).

---

## 4. Gap list (condensed)

| ID | Gap | Sev | Surface |
|---|---|---|---|
| G1 | No item↔day membership; single FK → a design lives in one day, re-attach silently moves it | blocker | schema/web/app |
| G2 | No folders/groups concept anywhere | blocker | schema/web/app |
| G3 | Public day page is a list, not the overview grid + hover | major | web public |
| G4 | No click-to-modal inline booking; always navigates to subpage | major | web public |
| G5 | Mobile lacks the entire Instagram flow | major | app |
| G6 | Mobile lacks day-side attach/detach curation | major | app |
| G7 | Public flash pages indexable while booking page is `noindex` | major | web public |
| G8 | Attaching silently blanks the design's previous day (sub-symptom of G1, separately shippable guard) | major | web/app |
| G9 | Mobile day form can't set/clear `studio_id` | minor | app |
| G10 | Availability "active count" differs: list (3 statuses) vs detail (`approved` only) | minor→**semantic** | api |
| G11 | Archived designs clutter the web grid (no status filter) | minor | web |
| G12 | Duplicated presentation logic (web vs app formatters; public card built twice) — ME-10 | minor | web/app |
| G13 | `db/schema.ts` stale (missing `studio_id` + `is_public`) | minor | schema |
| G14 | No discoverability of public days; no `/flash` landing | minor | web |
| G15 | No delete for days/designs; calendar shows cancelled/past days | minor | web/app |

---

## 5. Decisions (locked 2026-06-17)

All four founder calls are decided. **D4 increased scope** vs the recommendation: native in-app Instagram OAuth, not a web deep-link. D2 (folders) defaulted to one-folder-per-design.

| # | Question | Decision (locked) | Notes |
|---|---|---|---|
| D1 | Design ↔ day relation | **Many-to-many junction** (`flash_day_items`). | Reuse across days; precondition for "add a folder to a day". |
| D2 | Folder model | **One folder per design (flat), v1.** | Smallest model that enables organize + "add a folder to a day". Upgradeable to a join table later. |
| D3 | Public flash SEO | **Noindex, follow:true** (mirror the booking page). | Reversible later as a deliberate SEO play. |
| D4 | Mobile Instagram import | **Native in-app OAuth import** (connect + sync + multi-select). | Scope up: native OAuth (redirect URIs, token handling) + a new mobile IG API surface. The web IG core is **extracted to a shared server module** so web + app share it (ME-10). Raises FX-6/FX-7 scope + risk; the native IG work may split into its own PR. |
| D5 | Pending request on a "unique" flash | **Pending = Booked** (pending consumes the slot). | Resolves G10. Changes the mobile item-detail availability number (was `approved`-only); the artist's separate "confirmed" stat stays `approved`-only — only the availability *gate* unifies. |

---

## 6. Slice plan (FX-0…FX-8) — critic fixes folded in

> Each slice = one reviewable PR. Gates per slice: web `pnpm typecheck && pnpm test && pnpm lint`; mobile `tsc --noEmit` + lucide-icon check + lint; husky `next build`. Migrations: verify `pg_policies`/columns post-`db push` per AGENTS.md (never `migration repair --status applied` for SQL that must run).

### FX-0 — Shared format/status consolidation (no migration)
- Fix `db/schema.ts` drift (add `studio_id` + `is_public` to `flashDays`).
- New `packages/shared/src/flash-format.ts`: `formatPrice`, `formatFlashAvailabilityLabel`, the `FLASH_*` option arrays, and `FLASH_ACTIVE_REQUEST_STATUSES = ['pending','approved','deposit_pending']`. Export Flash enum types from shared.
- Re-point web `lib/flash.ts` **and** `lib/mobile-flash.ts` to re-export from shared; re-point mobile `lib/flash.ts` to import (kills G12/G13).
- **[critic fix]** Import via the **subpath `@inklee/shared/flash-format`, not the barrel** (`export *` would collide with the `Flash*` types already in web `flash.ts` + `mobile-flash.ts`). Add `mobile-flash.ts` to scope — it owns `FLASH_ITEM_STATUSES` used by the route validators.
- **[critic fix]** Keep `flashStatusTone` **platform-specific** (it returns RN theme classes invalid on web); share only the semantic tone enum.
- **[critic fix]** G10 is **not** a literal-dedup: unify the availability **gate** onto the shared 3-status constant everywhere, but **keep the item-detail route's separate `confirmed`(approved) / `pending` display stats**. This is a deliberate behavior change (D5), not a no-op; drop the "no user-visible change" claim. Also: the price string ("Price on request" vs "On request") collapses to one — a deliberate copy choice (sentence case, no em-dash).
- Risk: low.

### FX-1 — DB: `flash_folders` + `flash_items.folder_id` (additive, RLS)
- Migration `0050_flash_folders.sql` (idempotent, no backfill — NULL = Unfiled). Artist-only RLS, **no anon policy**. Add Drizzle models. Risk: medium.

### FX-2 — DB: `flash_day_items` junction + backfill + **embed disambiguation** (RLS)
- Migration `0051_flash_day_items.sql`: junction + artist-only RLS (no anon) + backfill from the single FK. Keep `flash_day_id`.
- **[critic fix — verified blocker]** Backfill `position` deterministically: `ROW_NUMBER() OVER (PARTITION BY flash_day_id ORDER BY created_at) - 1`; public/roster order is `(position, created_at, id)`.
- **[critic fix — verified blocker]** In the **same PR**, disambiguate every PostgREST embed that becomes ambiguous the instant the junction exists: `(artist)/flash/days/page.tsx:45` `flash_items(id)` → `flash_items!flash_day_id(id)`. Add a pre-merge grep for `flash_items(`/`flash_days(` embeds. (The `booking_requests … flash_items(id,…)` embed is safe — no new path. `booking-studio.ts` is `slots.flash_day_id`, unrelated.)
- Risk: high.

### FX-3 — Shared single-writer server modules
- `apps/web/src/lib/server/flash-day-membership.ts`: `attachItemsToDay`, `attachFolderToDay` (snapshot: resolves to published+draft members at attach time), `detachItemFromDay`, `reorderDayItems`, `listDayRoster`, `countDayItems`. **The only writer of `flash_day_items`.**
- `flash-folders.ts`: create/rename/delete/reorder + `setItemFolder`.
- **[critic fix]** Signatures take an **injected `SupabaseClient`** (`attachItemsToDay(supabase, dayId, itemIds, artistId)`) so web (cookie-RLS) and mobile (Bearer-RLS) pass their own client; **never `serviceClient`**. Keep in-module ownership checks (`day.artist_id` + `item.artist_id`) as defense-in-depth on top of RLS.
- **[critic fix]** The module **also keeps `flash_day_id` synced as the "primary day"** (set on first attach, repoint/null on detach of the primary) so legacy readers and the subpage "featured day" stay correct through the transition. Document these modules as **web-server-only**; the app's only path is `/api/mobile/*`.
- Unit-tested (idempotent attach, cross-artist rejected, folder resolution, detach removes one row, reorder positions). Risk: medium.

### FX-4 — Web backend: folder-aware library + day builder on the junction + **route ALL day writers through the module**
- Library `/flash/items`: folder rail (All / Unfiled / each folder, counts, inline new/rename/reorder) + status filter (**Archived hidden by default** — G11) + search; per-tile + bulk "Move to folder" / "Add to day".
- Day builder `/flash/days/[id]`: rewrite `FlashDayItemsManager` onto the junction via the shared module; "Add a whole folder" + multi-select singles; reorderable (writes `position`); a design can be in this day **and** others (kills G1/G8).
- **[critic fix — verified blocker]** Rewrite the day page **data load** (`days/[id]/page.tsx`) to derive `linked` from `listDayRoster` and candidates = all non-archived items **not already in this day** (cross-day designs stay candidates, shown with an "in N days" badge), instead of the `flash_day_id===null` split.
- **[critic fix — verified blocker]** Route **every** `flash_day_id` writer through the membership module so nothing drifts: the web item-form single-select day picker (`flash-item-form.tsx:463` + `items/actions.ts:124/214`), `flash-quick-create-modal.tsx:374`, and `instagram/actions.ts:171`. Cleanest: **remove the single-select day picker from the item form** and make day membership live only in the day builder; create/quick-create/IG-import insert a junction row when a day is chosen. (Mobile mirrors this in FX-7.)
- Public read **not** flipped here (still correct because the module syncs `flash_day_id`). Risk: medium.

### FX-5 — Web public: grid + modal + booking return-result refactor + read cutover + noindex
- **[critic fix]** Refactor `submitFlashBookingAction` to **return a discriminated result** (`{ok:true,bookingId,slug,emailSent}` | `{error,field}`) instead of `redirect()`. Keep ALL guards. Return a **fake-`ok` on the honeypot path** (so it's distinguishable from the initial `null` state). Thread the union through `useActionState`; **ref-guard** the redirect/submit so the still-mounted form can't double-fire. Subpage redirects client-side to `/request/submitted?id=&slug=&email=` (**preserve those exact params**); modal shows an inline success panel.
- Extract one shared `FlashBookingForm` + one shared public flash card (kills the duplicate-card drift, G12).
- Rebuild `/[slug]/flash/days/[dayId]` into the **grid** (square big-image + price tiles, ordered by `position`); new `flash-day-grid.tsx` client component opens the **modal** (full info + the shared form, passing the **day's id** as `flashDayId`); lazy-mount the form. `serviceClient` join `flash_day_items → flash_items WHERE is_public AND status='published'`, gated by `artist_id`; 404 unless `is_public`.
- Flip the remaining readers to the junction: the subpage "featured day" line and the web days-index count.
- **[critic fix]** Add `generateMetadata` `robots:{ index:false, follow:true }` to the 3 public flash routes (**follow:true to match the booking page**, not follow:false). Do **not** touch `robots.ts`.
- **[critic fix]** Fix pre-existing em-dashes in `[flashSlug]/actions.ts` (lines 82/137/173/217/219) while editing it.
- Risk: high. (Can split into "action refactor + form extraction" and "grid + modal" if the PR grows.)

### FX-6 — Mobile API: folders + day-items + folder filter + `studio_id`
- New routes delegating to the FX-3 modules (no logic in handlers): `flash/folders` (+`[id]`), `flash/days/[id]/items` (GET roster / POST attach items-or-folder / DELETE). Add `?folder=` to the items list.
- **[critic fix]** Flip the mobile day **count reads** to the junction (`days/route.ts:30`, `days/[id]/route.ts:35`) via the shared `countDayItems`, so app counts match the public grid.
- **[critic fix]** `studio_id` (G9): extend `normalizeFlashDayInput` in `mobile-flash.ts` with `studioId` **and port the studio/location mutual-exclusion** (`resolveLocationFields`) into the shared validator; load+preserve current `studio_id` so unrelated edits don't null it; verify studio ownership.
- Extend `mobile-api.ts`: `MobileFlashFolder`, `MobileFlashDayItem`, `folderId` + `dayMemberships:string[]` on `MobileFlashItemDetail`, `studioId` on `MobileFlashDay`. Old app builds ignore new fields (read-safe).
- **[D4 — native IG]** Extract the web Instagram core (connect/sync/import) from `(artist)/flash/instagram/actions.ts` into a shared `lib/server/flash-instagram.ts` (injected client, ownership-verified), re-point the web actions to it, and add mobile routes `flash/instagram/{status,sync,import}` + the OAuth connect/callback handling for the native flow (redirect URI for the app scheme, token exchange/storage on the existing `instagram_accounts` table). Add `MobileInstagramAccount` + `MobileInstagramPost` to `mobile-api.ts`. This is the heaviest part of FX-6 and **may split into its own PR (FX-6b)**. Risk: medium→high (native OAuth).

### FX-7 — Mobile app: grid + folders + day-items manager + studio picker + IG deep-link
- Designs → 2-col square grid mirroring web; send `?status=` + `?folder=`; one-tap publish/toggle from the tile.
- Native day-items manager (multi-select add + add-folder + detach) via the new endpoint — replaces the per-item single-select day picker. **[critic fix]** The item editor day field becomes **read-only membership** (links to the day manager) or writes via the day-items endpoint — never the bare `flash_day_id`.
- Day form `studio_id` picker (studios via the travel endpoint).
- **[D4 — native IG]** Native Instagram screen: connect (OAuth via in-app browser → app-scheme redirect → token exchange), sync, and multi-select import, mirroring the web flow against the FX-6 shared IG core + mobile IG routes. Public grid/modal/subpage stay web-only (app is artist-only — not a parity gap). Risk: medium→high (native OAuth; may land as its own PR alongside FX-6b).

### FX-8 — QA + scope-doc update
- Cross-surface QA: identical price/label strings; list vs detail availability agree; **grep the touched files (not just added lines) for em-dashes**; sentence case; Accept/Pass intact; modal lazy-mounts; subpage redirect preserved.
- **[critic fix]** G14 is a real item, not "decide later": add a Days section/link on `/[slug]/flash` so day URLs are discoverable (the whole vision centers on them). Badge draft/client-invisible members in the day roster.
- **[critic fix]** Verify `booking-studio.ts` (it reads `slots.flash_day_id`, unrelated — confirm no coupling).
- Update `docs/roadmap.md` (E7 honesty + the new Flash structure), `SLICES_CONTINUATION.md` (FX-0…FX-8, note `flash_day_id` retained + schedule its drop), `docs/flash-restructure-slice-60d.md` (as-built correction), `docs/mobile-parity-plan-2026-06-11.md` (stale claims), `docs/seo-state.md` (public-flash noindex). Risk: low.

---

## 7. Sequencing — why the single-source window is closed

DB → shared core → web backend → web public → mobile API → mobile app → QA. The two failure modes the critics caught are closed by:
1. **Migration-day breakage** — FX-2 ships the PostgREST embed disambiguation in the **same PR** as the junction, so no read breaks when the table appears.
2. **Dual-source window** — FX-3's membership module is the **single writer** and keeps `flash_day_id` **synced** as the primary day, and FX-4 routes **every** legacy `flash_day_id` writer through it. So even though the public read flips in FX-5, legacy readers stay correct throughout; there is never a window where the artist's edits are invisible on the public page.

Future, separate, irreversible: **drop `flash_items.flash_day_id`** once all mobile clients have updated (own migration).

---

## 8. Risks to watch
- **FX-2 and FX-5 are the high-risk PRs.** FX-2 = a migration that backfills + needs the embed fix atomically. FX-5 = the booking-action contract change + grid + modal + read cutover; split it if it grows.
- **ME-10 trap:** the item-side day field must use ONE model on both surfaces (don't leave web single-select + app multi-membership). FX-4 + FX-7 must land the same model.
- **G10 (D5) is a behavior change**, not cleanup — the mobile item-detail availability number changes. Confirm D5 first.
- **Folder snapshot** semantics (adding a folder is a one-time snapshot; later folder additions don't auto-join past days) must be stated in the attach UI copy and badged for draft members.

---

## 9. Doc updates this produces (FX-8)
`docs/roadmap.md` (E7), `SLICES_CONTINUATION.md` (FX-0…FX-8), `docs/flash-restructure-slice-60d.md` (as-built), `docs/mobile-parity-plan-2026-06-11.md` (stale claims), `docs/seo-state.md` (public-flash noindex), `db/schema.ts` (drift — done in FX-0/FX-1/FX-2).

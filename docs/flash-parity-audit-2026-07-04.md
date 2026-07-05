# Flash feature — web ↔ native parity audit (Instagram focus)

**Date:** 2026-07-04
**Method:** multi-agent audit workflow (5 parallel mappers → parity matrix + native-userflow trace + Instagram deep-dive → adversarial re-verification of every finding). 24 agents, findings anchored to `file:line`.
**Scope:** the whole flash feature (`apps/web` artist + public surfaces, `apps/mobile` flash stack, `/api/mobile/flash/**`, `packages/shared`), with a deep pass on the **Instagram connect + post-import** flow and the **untested native userflow**.

---

## Headline

- **Native flash CORE is at near-total parity and verified clean.** Browse, one-tap create, edit (status/publish/archive, booking mode + max, is_bookable, price/currency/amount, description/size/placement, availability, folder), hero-image upload, folder create/assign, and flash-day create/edit + roster all work, on the shared vocabulary and server-computed availability. A screen-by-screen trace found **no camelCase field strips, no response-shape mismatches, no image race, and correct archive/folder/roster behaviour**. The booking path itself is full parity (public surfaces are web-rendered pages both apps depend on).
- **The one real native userflow bug: creating a flash day dead-ends before its roster** (FLASH-1, medium). Adding designs is the whole point of a day, but right after creating one the artist is bounced to the list and must find + reopen the day to build the roster.
- **Instagram is entirely web-only** — the single biggest parity gap and the user's focus. There is no `/api/mobile/instagram/*` route, no mobile Instagram screen, and no shared sync logic; the native flash empty state literally tells artists to "import from Instagram" on the web.
- **The web Instagram flow itself carries real compliance + security debt** that (a) blocks Meta public access and (b) would carry into any native port: disconnect never deletes/revokes the token, the long-lived token is stored in plaintext, no privacy disclosure or data-deletion callback exists, and sync is capped at 50 posts.

None of this is a launch blocker for the private beta (Instagram public access is already gated in Meta review), but the Instagram cluster needs decisions before it ships to the general public or to mobile.

---

## Parity matrix (34 capabilities audited)

**Full parity (23 capabilities):** flash shell/nav (Designs + Days), library browse, item edit field-set (near-complete), no-hard-delete (archive is the analog on both), archive, publish/status, booking mode + max_bookings, is_bookable pause/resume, price type + currency + amount, manual hero-image upload, descriptive fields, folder create, folder assign, flash-day create/edit, day roster membership (attach item / attach folder / detach), and every public visitor surface (overview, item + booking form, day grid).

**Non-parity (11):**

| Severity | Capability | Gap | Note |
|---|---|---|---|
| **Medium** | Instagram connect / sync / disconnect | native-missing | Entire integration web-only; no mobile route/type/screen. Intentional + documented (empty-state punts to web). |
| **Medium** | Instagram post import (posts → draft designs) | native-missing | The only native IG mention is the empty-state string at `flash/index.tsx:336`. |
| Low | Flash shell — Instagram sub-screen | partial | Native stack has Designs + Days but no Instagram screen. |
| Low | New-design entry | divergent | Web: fork modal (Instagram import vs manual quick-create). Native: one-tap empty draft → editor. Both create a real design. |
| Low | Item edit field-set | partial | Native edits nearly everything except slug, `preview_image_url` paste, `instagram_post_url` (PUT preserves web-set values). |
| Low | Preview image via URL paste | native-missing | Native only uploads a picked file. |
| Low | `instagram_post_url` on a design | native-missing | Mobile wire types omit `instagram_post_url`/`instagram_post_id`; native has zero IG-provenance visibility. |
| Low | Availability window | partial | Native uses free-text `YYYY-MM-DD` fields (no date picker, weaker validation) vs web date inputs. |
| Low | Slug / public-URL edit | native-missing | Native auto-generates + preserves the slug; can't change a design's public URL from mobile. |
| Low | Folder rename | native-missing | `PATCH /api/mobile/flash/folders/[id]` exists but is **dead code** — no native UI calls it. |
| Low | Folder delete | native-missing | `DELETE /api/mobile/flash/folders/[id]` exists but is unreachable from the app. |

---

## Findings (all adversarially verified; the one refuted item is omitted)

### Instagram — compliance / public-access (the blockers)

- **[HIGH] IG-PUBLIC-01 — Meta public access blocked.** Import works for **added testers only**; the general public cannot connect until Meta App Review completes. Two hard requirements are missing in code: (1) a privacy-policy Instagram/Meta data-use disclosure (the privacy doc mentions only the static "Instagram handle" profile field, `content/legal/privacy.md:35,45` — never the Graph API import that stores a token + media + captions + thumbnails), and (2) a Meta **deauthorize / data-deletion request callback** endpoint (none exists; the only deauthorize/data-deletion code is Stripe's). *External blocker: the Meta app is in review since ~2026-07-03; these two code items are the on-our-side prerequisites.*

- **[MEDIUM] IG-01 — Disconnect leaves a live, plaintext token and orphans data.** `disconnectInstagramAction` (`(artist)/flash/instagram/actions.ts:96-99`) only sets `{connected:false}`; it never nulls/deletes `access_token`, never revokes at Instagram, and leaves `instagram_posts` + cached `logos/instagram/*` thumbnails. A ~60-day valid token remains usable after "disconnect." Fails the prior code-prep note ("disconnect must delete the token row") and GDPR/Meta data-deletion expectations. *Fix: on disconnect delete the row via `serviceClient`, best-effort revoke, and purge the artist's posts + cached objects.*

- **[MEDIUM] IG-02 — Long-lived token stored plaintext at rest.** `instagram_accounts.access_token` is `text NOT NULL` (`0019_instagram_integration.sql:8`, encryption deferred in the migration comment); no encrypt/decrypt anywhere in the repo. A DB dump or a leaked service-role key exposes live IG tokens. *Fix: app-layer AES-GCM with a KMS/env key.*

- **[LOW] IG-03 — Token readable via the artist's own RLS SELECT.** The `0019` policy is `FOR ALL USING(artist_id = auth.uid())`, so `access_token` is selectable by the artist's own (anon-key) session — client XSS or a leaked session could exfiltrate it. *Fix: restrict `access_token` reads to service-role (column privilege / a view that omits it).*

- **[LOW] IG-07 — OAuth state secret falls back to `CRON_SECRET`.** `getStateSecret()` reuses the cron bearer secret as the OAuth-state HMAC key (`instagram.ts:49-56`), coupling two trust domains. Session binding still blocks forged states, so exploitability is limited. *Fix: a dedicated `INSTAGRAM_STATE_SECRET`, drop the fallback.*

### Instagram — correctness / efficiency

- **[LOW] IG-05 — Sync never paginates; only the 50 newest posts are importable.** `fetchInstagramMedia` returns `json.data` and never follows `paging.next` (`instagram.ts:194-205`). Artists with >50 posts can't reach older designs. *Fix: follow the cursor up to a cap, or expose "load more."*
- **[LOW] IG-06 — Unbounded parallel thumbnail downloads.** Both the callback and the resync run `Promise.all` over up to 50 media items with no concurrency cap (`callback/route.ts:72-80`, `actions.ts:48-56`) — a transient memory/CPU spike risking OOM/timeout on the 60s function. *Fix: chunk to 5-8.*

### Native parity — Instagram

- **[MEDIUM] PARITY-01 — Native has zero Instagram connect/import.** A mobile-first artist cannot connect Instagram or import posts at all; the app redirects them to the web (`flash/index.tsx:336`). *Fix: a mobile Instagram screen + `/api/mobile/instagram/*` routes sharing the actual sync/import logic (see NATIVE-01), not just copy.*
- **[LOW] NATIVE-01 (architecture) — The web OAuth flow can't be reused as-is from the Expo app.** Three reasons: (1) the callback uses the cookie SSR client and enforces `user.id === state.artistId` (`callback/route.ts:38-44`) — the app is bearer-auth with no cookie; (2) `redirect_uri` is a fixed web HTTPS URL (`instagram.ts:44-47`) with no `inklee://` deep-link handoff; (3) there is no mobile IG API. *Minimal native path: extract the reusable server logic (exchange → long-lived → fetch media → download thumbnails → upsert) into a server-only `lib/instagram-sync.ts`, add a bearer-auth `/api/mobile/instagram/*` layer, and drive connect via `expo-auth-session` with a deep-link callback (or a web callback that deep-links back). This is a feature build, not a bug fix.*

### Native flash — userflow

- **[MEDIUM] FLASH-1 — New flash day dead-ends before the roster.** `save()` on the create branch discards the POST's returned `{id}` and calls `router.back()` to the list (`days/[id].tsx:117-121`), while the roster manager is gated behind `!isNew` (`:211`). So immediately after creating a day the artist can't add designs in the same flow. *Fix: capture the returned id and `router.replace('/flash/days/{newId}')` instead of `router.back()`.*
- **[LOW] FLASH-3 — Empty-state copy is stale.** The list empty state says "Add designs on the web or import from Instagram" (`flash/index.tsx:334-337`) while a working "New design" button sits in the always-rendered header. *Fix: point the copy at the on-device button; keep the Instagram-on-web note.*
- **[LOW] FLASH-4 — Flash hero upload rejects HEIC/non-standard mime.** `ImageUploadField` forwards `asset.mimeType` verbatim; `mobile-image.ts:11` `ALLOWED_TYPES` excludes heic/heif → a 400 on a valid-looking photo. Cross-cutting (not flash-specific), mitigated by `allowsEditing` often re-encoding to JPEG, and iOS is out of scope. *Fix: normalize on-device or broaden ALLOWED_TYPES (sharp+libheif).*

### Verified clean (reassurance for the untested native flow)

Re-reading every cited path confirmed: native **create** works (`POST /flash/items` empty-body draft → `{id}` → editor); PUT/folder/day/day-items validators all read camelCase correctly (no silent field strips); response shapes match what screens render; **no `image_urls` race**; archive, folder assign, and day-roster attach/detach are correct. The refuted item (FLASH-2, a "day venue-edit trap") cannot occur because `flash_days.studio_id` is `ON DELETE SET NULL` (`0033:18`).

---

## Recommendations (priority order)

**Before Instagram goes public (Meta review + these code items):**
1. **IG-01** — make disconnect delete + revoke the token and purge posts/thumbnails. (Also the prior code-prep note; still open.)
2. **IG-PUBLIC-01 / IG-04** — add the privacy-policy Instagram section + a Meta data-deletion/deauthorize callback endpoint. (Required for App Review.)
3. **IG-02 / IG-03** — encrypt the token at rest and restrict its SELECT to service-role.

**Native flash polish (cheap, ship anytime):**
4. **FLASH-1** — fix the day-create → roster dead-end (small, real UX win).
5. **FLASH-3** — refresh the stale empty-state copy.
6. Low-value web-only-field gaps (slug edit, IG-provenance, folder rename/delete UI, availability date picker) — only if mobile-first artists ask.

**Product decision:**
7. **Native Instagram parity (PARITY-01 / NATIVE-01)** is a genuine feature build (shared `instagram-sync.ts` + `/api/mobile/instagram/*` + expo-auth-session deep-link). Web-only is defensible for the private beta; decide before a mobile-first public push.

**Hardening:** IG-05 (pagination), IG-06 (concurrency cap), IG-07 (dedicated state secret) — batch when convenient.

---

*Related: memory `flash-instagram-meta-setup` (Meta review chain + the 2 code-prep items — this audit confirms both are still open and adds the data-deletion callback, token encryption, pagination, concurrency, and key-reuse items). Native flash core was previously untested; this audit verified it clean except FLASH-1.*

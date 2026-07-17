# Inklee 2.0 schema proposal and permission matrix

Status: Phase 0 draft, written 2026-07-17. Builds on the founder-approved working defaults (collision audit section 13, all ten approved 2026-07-17) and the quarry decision (Q12 resolved). This is a reviewable proposal, not migration SQL: final DDL is written at Phase 1 against the then-current head, executed first on a local Supabase with live `pg_policies` verification.

Companion docs: scope (`inklee-2-guestspot-map-scope.md`), build plan, collision audit, open questions.

## 1. Conventions every 2.0 table follows

Inherited from the repo and non-negotiable:

- Hand-written SQL migrations (0016+ convention), idempotent where possible, comment preamble, numbered past the current head at landing time.
- RLS enabled on every table. No anon SELECT policies anywhere (house rule since 0030/0031); public rendering goes through serviceClient with tested pure shapers (the predecessor's `toPublicMapLocation` pattern).
- Sensitive tables use the "RLS enabled + zero policies = service-role only" house pattern (like `account_overrides`, 0045).
- Child tables carry a denormalized parent id so RLS stays a single-column check (the `flash_day_items` and predecessor pattern).
- Every client-callable SECURITY DEFINER RPC gets explicit `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` (the 0060 lesson; default privileges grant anon EXECUTE). Exception, by design: helpers referenced inside RLS policy expressions (`is_studio_owner`, `is_group_member`) execute as the querying role, so they keep `GRANT EXECUTE TO authenticated` and revoke only PUBLIC and anon; without that grant every membership-gated query fails.
- Column-level grants do not auto-extend to new columns (0062 footgun): any migration adding an artist-writable profiles column must extend the grants in `drafts/0074_profiles_column_privileges.draft.sql` (or its landed successor) in the same migration.
- FK style: `ON DELETE CASCADE` for owned children, `SET NULL` for optional cross-references. Reputation and moderation tables deliberately avoid CASCADE from profiles (survival semantics per collision audit section 6, GDPR counsel involved).
- All dates that mean "a day in someone's life" are bare `date` columns compared lexically (the repo-wide date-key convention); timestamps are `timestamptz default now()`.

Naming: everything is namespaced to never collide with the live artist-travel tables (`studios`, `trips`, `trip_legs`). The `studios_v2` paper name from BM-4.1 is retired.

## 2. Entity inventory by domain

### 2.1 Map directory

**`map_locations`** (adapted from the predecessor, the shared map object)

```
id uuid pk
source text          -- inklee_seed | owner_created | claim_converted
category text        -- tattoo_studio | private_studio | piercing_studio | supply_shop | other
                     -- (event reserved for later; needle/ink are shop_profiles subtypes, not location categories)
name text not null
latitude / longitude double precision not null   -- TRUE position (private plane)
display_latitude / display_longitude double precision  -- rendered position; equals true position
                     -- unless the studio is approximate-only, then a coarse offset
address / city / country / postal_code text
google_place_id text                             -- dedupe + join key to artists' private studios rows
website_url / instagram_handle text
studio_profile_id uuid -> studio_profiles SET NULL
shop_profile_id uuid -> shop_profiles SET NULL
claim_status text default 'unclaimed'            -- unclaimed | claim_pending | claimed
moderation_status text not null default 'pending' -- pending | approved | hidden | removed
is_seed boolean default false
seed_region_bucket text                          -- geohash-4-style bucket for the 5-per-300km2 cap
last_confirmed_at timestamptz · created_at / updated_at
```

RLS: no client policies; all reads via serviceClient shapers (public map plane = `moderation_status = 'approved'` only, fail closed on missing status), writes via admin actions and owner server cores. A spatial index (PostGIS or earthdistance GIST) on the display coordinates is part of the same migration; the bbox/filter query API reads only shaped public columns.

Seed cap: enforced in the admin insert path by counting approved seed rows per `seed_region_bucket` (bucket sized so one bucket is about 300 square km); the insert refuses when the bucket holds 5. Not an import-script courtesy, an insert-path rule.

**`location_claims`** (predecessor shape, near as-is)

```
id uuid pk · map_location_id -> map_locations CASCADE
claimant_user_id -> profiles(id) · claimant_role text  -- artist | receptionist | manager | business_owner
social_link text not null · address_confirmation text
status text default 'pending'   -- pending | approved | rejected | revoked
evidence_note text · reviewed_by / reviewed_at · created_at
```

RLS: claimant can insert and read own claims; review is admin (serviceClient) via the founding-artist-applications queue pattern. Approval creates or links the `studio_profiles` row and flips the location's `claim_status`.

**`watched_studios`**

```
id uuid pk · artist_user_id -> profiles CASCADE · map_location_id -> map_locations CASCADE
created_at · unique (artist_user_id, map_location_id)
```

RLS: owner-only, `artist_user_id = auth.uid()` for all operations. Private plane; never exposed to the studio.

**`temporary_map_posts`**

```
id uuid pk · studio_profile_id -> studio_profiles CASCADE
created_by_user_id uuid not null -> profiles(id)
body text not null · starts_on / ends_on date
month_key text not null            -- 'YYYY-MM' of creation
status text default 'active'       -- active | expired | removed
created_at
unique (created_by_user_id, month_key)   -- the locked cap is per OWNER ACCOUNT per month, so the
                                         -- constraint keys on the poster, not the studio (an ownership
                                         -- change mid-month neither blocks the new owner nor doubles the old one)
```

RLS: owner writes via server core (ownership check through studio_profiles); public reads via shaper when active and the studio is approved. Display behavior stays open (Q7); the schema does not prejudge it.

### 2.2 Studio

**`studio_profiles`** (the predecessor's org + location collapsed for v1)

```
id uuid pk
owner_user_id uuid -> profiles(id) UNIQUE            -- one studio per owner, v1 rule as a constraint;
                                                     -- NULLABLE: a detached (ownerless) studio survives its
                                                     -- owner and reads as unclaimed on the map. Postgres
                                                     -- UNIQUE permits multiple NULLs, so the cap still holds.
name text not null · slug text unique                -- slug format + reserved rules from packages/shared/slug.ts
description text · vibe text
logo_path text
address / city / country / postal_code text
address_visibility text not null default 'exact'     -- exact | approximate (private studios: approximate only)
guest_spot_status text not null default 'not_accepting'  -- not_accepting | accepting | invitation_only
publication_status text not null default 'draft'     -- draft | published | suspended
settings jsonb default '{}'                          -- hours, non-filterable presentation prefs only
created_at / updated_at
```

RLS: owner SELECT (`owner_user_id = auth.uid()`); ALL WRITES go through server cores (service role after an explicit ownership check), because RLS cannot gate which columns change and `publication_status` must never be settable directly (the publish transition validates the full locked required-field set: logo, description, address or approximate mode, minimum 3 distinct categories, minimum 3 photos). Public reads via serviceClient shaper (published + approved location only; true address withheld when approximate). Deliberately NOT deleted when the owner account dies: the account-deletion core sets `owner_user_id` to null and flips the linked map location back to `claim_status = 'unclaimed'` (the map entry and its earned reputation survive; photos survive because storage is keyed by studio id).

Migration path note (documented, not built): if multi-location returns, this table becomes the location and grows an org parent; the unique owner constraint moves to the org.

**Category and style taxonomy** (net-new; nothing exists in the schema today)

```
styles: key text pk · label text                       -- canonical style vocabulary (blackwork, fine_line, traditional, ...)
studio_categories: id pk · studio_profile_id CASCADE
  kind text  -- standard | custom
  style_key text -> styles SET NULL   -- set for standard style categories
  standard_key text                    -- for non-style standards (private_studio, walk_in_friendly, vegan_supplies, ...)
  custom_label text                    -- for custom categories
artist_styles: artist_user_id CASCADE · style_key -> styles CASCADE · unique pair
```

Duplicate protection so three identical rows cannot satisfy the minimum: partial unique indexes on `(studio_profile_id, style_key)` and `(studio_profile_id, standard_key)` for standard rows, and the publish core counts DISTINCT categories. Minimum 3 per published studio validated at publish time, not per-insert. Standard categories from the locked list; all 3 may be custom. Map style filters join through `styles` (indexed junctions, never jsonb).

**`studio_photos`**

```
id uuid pk · studio_profile_id CASCADE · storage_path text not null
position int · width / height / file_size int · mime_type text
created_at
```

Storage: new PRIVATE `studio-media` bucket, paths `{studioProfileId}/...`, service-role writes, reads via batch-signed URLs (the bookings-bucket pattern, 3600s) issued only through shapers for published + approved studios. Private rather than public because a public bucket cannot retract anything: photos of draft, suspended, or moderation-hidden studios would stay world-readable at stable URLs, and the map audience is locked-in-only pending Q3. Revisit serving mode only if Q3 makes studio pages public. Explicitly excluded from the per-user account-deletion purge; purged by a studio-deletion path instead. Minimum 3 validated at publish time; the per-studio cap (Q6) is a shared constant checked at upload, with `file_size` recorded so a byte cap can follow.

**`studio_memberships`** (slimmed from the predecessor, kept because date-bounded membership is the group-window mechanism)

```
id uuid pk · studio_profile_id CASCADE · user_id -> profiles CASCADE
role text not null      -- resident_artist | guest_artist   (owner is studio_profiles.owner_user_id, not a row)
source text not null    -- owner_added | stay_window        (stay_window rows are machine-managed)
guest_spot_stay_id -> guest_spot_stays SET NULL
starts_on / ends_on date                                   -- null for open-ended residents
visible_on_profile boolean default false                    -- the public hosted artist list is opt-in per row
status text default 'active' · created_at / updated_at
```

Uniqueness (partial indexes, because a returning guest must not collide with their own expired row): roster rows unique on `(studio_profile_id, user_id, role) where source = 'owner_added' and status = 'active'`; stay-window rows unique on `(guest_spot_stay_id, user_id)`.

RLS: members read their own rows; owner reads and manages the studio's rows (single-column check via `studio_profile_id` + an `is_studio_owner(studio_profile_id)` SECURITY DEFINER helper, locked-down EXECUTE). The predecessor's `is_studio_member(org, min_role)` helper is ported with the role list simplified.

**`studio_blacklists`** (private plane, service-role only)

```
id uuid pk · studio_profile_id CASCADE · artist_user_id -> profiles CASCADE
note text · created_at · unique pair
```

RLS enabled, zero policies. Owner reads/writes through server cores only; the blacklisted artist can never observe it. Behavior (founder decision 2026-07-17): quiet hold. A request from a blacklisted artist lands in a collapsed blocked section of the inbox with no notification; the owner can still open and pass it manually.

**`studio_badges`**

```
id uuid pk · studio_profile_id CASCADE · badge_key text  -- great_for_guest_spots | beginner_friendly | private_room | fast_communication
granted_by text  -- rule | admin
created_at · unique (studio_profile_id, badge_key)
```

RLS: no client policies; grants happen in the reputation cron or admin actions; public read via shaper.

### 2.3 Workspaces

Ported from the predecessor with the approved inversion: **no GiST EXCLUDE constraint, no capacity pin**. Overlap is computed, never enforced.

```
studio_workspaces: id pk · studio_profile_id CASCADE · name not null
  workspace_type text default 'chair'  -- chair | room | private_room | shared_station | piercing_room | content_corner | other
  status active|inactive · capacity int default 1 · position int · custom_fields jsonb · created_at/updated_at
studio_workspace_availability: id pk · studio_workspace_id CASCADE · studio_profile_id (denorm)
  day_of_week smallint · valid_from/valid_until date · status active|paused · created_at
studio_workspace_assignments: id pk · studio_workspace_id CASCADE · studio_profile_id (denorm)
  artist_user_id -> profiles · guest_spot_stay_id -> guest_spot_stays SET NULL
  starts_on/ends_on date · assignment_type resident|guest|hold
  status tentative|confirmed|cancelled
  overbook_acknowledged_at timestamptz · overbook_acknowledged_by -> profiles   -- the manual override, recorded
  created_by · created_at/updated_at
```

The warning calculator is the predecessor's pure `workspace-availability.ts` module (shared package, consumed by web and mobile): given the station's assignments and capacity it returns overlap warnings; the accept path surfaces them and records the acknowledgment. Nothing in the database refuses an overlap, matching the locked warn-never-block rule.

### 2.4 Guest spots

**`guest_spot_requests`** (predecessor shape + locked submission fields; its 14-state FSM kept as a superset)

```
id uuid pk · artist_user_id -> profiles · studio_profile_id -> studio_profiles
requested_start_date / requested_end_date date · date_flexibility exact|flexible|range
social_link text not null          -- NEW, locked submission field
expected_clients text              -- NEW; NOT the predecessor's number_of_artists (that field is dropped in v1)
equipment_needs text               -- maps to the predecessor's requirements
introduction text                  -- the free-text purpose
client_booking_status text         -- will_open | wont_open | unsure (kept; matches "clients still book normally")
status text default 'draft'        -- the ported request FSM
submitted_at · created_at / updated_at
```

RLS: two-party SELECT only (`artist_user_id = auth.uid()` or the owner check via `studio_profile_id`), plus artist INSERT limited to own draft rows. NO client UPDATE/DELETE policies: RLS cannot restrict which columns or FSM transitions a permitted writer performs, so a direct PostgREST write could set `status = 'accepted'` or rewrite submission fields mid-review. Every transition runs in the shared server core (service role after an explicit party check, conditional status-gated UPDATE against races, the bookings.ts pattern hardened). Submission is rate-limited per requesting account (the `makeLimit` pattern). Button copy: Accept / Pass / Suggest dates.

**`guest_spot_proposals`**: predecessor shape as-is (separate rows, supersede logic, `expires_at`, optional workspace reference).

**`guest_spot_stays`** (the confirmed entry; both calendars render it, the passport counts it)

```
id uuid pk · guest_spot_request_id -> requests SET NULL, UNIQUE   -- idempotency, predecessor's slice-8 fix
artist_user_id · studio_profile_id · studio_workspace_id SET NULL
starts_on / ends_on date · status text  -- the ported stay FSM: confirmed | active | completed | cancelled | no_show
confirmation_note text                   -- the lightweight confirmation (no PDF, ever)
terms_snapshot jsonb                     -- frozen private pricing/policy at confirmation (predecessor pattern)
trip_leg_id uuid -> trip_legs SET NULL   -- the materialized artist-calendar entry
confirmed_at / completed_at / cancelled_at · created_at / updated_at
```

RLS: two-party read (artist + studio owner); writes only through the shared server core, which on confirmation transactionally (a) creates the stay, (b) materializes a trip + trip_leg for the artist, (c) links both ways, (d) writes both parties' notifications. The predecessor's best-effort pattern is replaced by an RPC or a compensating rollback so the two calendars can never half-exist.

**Additive `trip_legs` columns** (the only touch on an existing table in all of 2.0):

```
alter table trip_legs add column guest_spot_stay_id uuid references guest_spot_stays(id) on delete set null;
alter table trip_legs add column origin text not null default 'self';  -- self | guest_spot
```

Edit policy, enforced SERVER-SIDE in the trip/leg cores (web actions and the mobile routes both), not just in UI: date edits and deletes on legs with `origin = 'guest_spot'` are rejected and rerouted to the request flow; cancelling the stay through that flow removes the leg and notifies the studio, so a confirmed stay can never silently lose its calendar entry. Notes and icon stay artist-editable. Deleting a whole trip containing a guest spot leg gets the same guard. The columns are nullable/defaulted so every existing consumer keeps working unchanged.

**`guest_spot_private_notes`**: interaction-plane messages (private pricing and policy) from studio to a specific requesting artist; two-party RLS scoped by the request id; document attachments wait for the private bucket (build plan Phase 4 note, FU-20 payoff).

### 2.5 Studio groups

```
studio_groups: id pk · studio_profile_id CASCADE UNIQUE (1:1 in v1) · house_rules text · created_at/updated_at
studio_group_members: id pk · studio_group_id CASCADE · user_id -> profiles CASCADE
  source text  -- roster | stay_window · guest_spot_stay_id SET NULL
  window_starts_on / window_ends_on date   -- stay window minus/plus 14 days, cron-managed
  status active|removed · created_at · unique (studio_group_id, user_id)
studio_group_messages: id pk · studio_group_id CASCADE (denorm studio_profile_id)
  author_user_id -> profiles SET NULL · body text · created_at
studio_group_announcements / studio_group_documents: owner-only-authored rows, member-readable
  (document files wait for the private bucket; metadata rows can land first)
studio_group_votes: id pk · studio_group_id CASCADE · created_by · proposed_by SET NULL
  vote_type text  -- flash_day_date | guest_artist_approval | studio_event | supply_purchase | travel_plans | house_decision | custom
  question text · status open|closed · closes_at · created_at
studio_group_vote_options: id pk · vote_id CASCADE · studio_group_id (denorm) · label text · position int
studio_group_vote_ballots: id pk · vote_id CASCADE · option_id CASCADE · studio_group_id (denorm)
  voter_user_id CASCADE · created_at · unique (vote_id, voter_user_id, option_id)   -- multiple choice = multiple rows
```

(Vote children carry the denormalized `studio_group_id` per the section 1 convention, so their membership RLS stays a single-column check instead of a join through votes.)

RLS: membership-gated via a `is_group_member(group_id)` SECURITY DEFINER helper that honors the date window (`current_date between window_starts_on and window_ends_on` for stay-window rows). Members read and write messages and ballots; only the owner writes announcements, documents, house rules, and creates votes (members propose via a proposed flag). Whether messages flow through Postgres inserts or a hosted chat service is the Q10 decision; the membership, vote, and document tables stand either way. Votes are explicitly non-binding (a communication tool; nothing consumes their outcome mechanically).

The 14-day windows are maintained by a daily cron with at-most-once markers (the lifecycle-marker pattern): stay confirmed -> member row with the window; window end passed -> status removed.

### 2.6 Reputation and reports

**`map_thumbs_up`**

```
id uuid pk · giver_user_id -> profiles SET NULL   -- survival: a departed giver must not deflate earned counters
                                                  -- (retention semantics with counsel, deleted_account_records precedent)
target_type text  -- studio | artist | shop
target_studio_id / target_artist_id / target_shop_id (exactly one set, CHECK)
guest_spot_stay_id -> stays SET NULL   -- required for studio<->artist directions, null for shop thumbs
created_at
-- one thumb per giver-target pair, permanent; a table UNIQUE cannot hold an expression,
-- so this is a unique expression INDEX:
--   create unique index on map_thumbs_up
--     (giver_user_id, target_type, coalesce(target_studio_id, target_artist_id, target_shop_id));
```

Eligibility (completed stay for artist/studio directions; any artist account for shops) is enforced in the server core, with the stay reference recorded for audit. One-thumb-per-pair caps a studio's counter at its distinct-guest count, which interacts with the 1-credit-per-5-thumbs decay; the Phase 0 counter design accounts for that. Public counters are aggregates via shapers.

**`map_reports`** (service-role only; the register the DSA procedure needs in-product)

```
id uuid pk · reporter_user_id -> profiles SET NULL   -- stored for abuse control, NEVER exposed to the target
target_type text  -- studio | artist | shop | location
target_studio_id / target_artist_id / target_shop_id / target_map_location_id (exactly one set, CHECK)
                  -- target_map_location_id covers wrong-location and fake-studio reports against
                  -- unclaimed seeded entries, which have no studio_profiles row (the dominant seed-era case)
reason text  -- wrong_location | fake_studio | spam | scam | behavior | other
detail text · status text default 'new'  -- new | reviewed | actioned | dismissed
statement_of_reasons_id uuid -> moderation_statements SET NULL
created_at · reviewed_by / reviewed_at
```

**`moderation_statements`** (the Art. 17 statement-of-reasons record; service-role only)

```
id uuid pk · target_type / target ids (as map_reports)
action text        -- report_threshold_flag | warning_shown | hidden | suspended | other
grounds text · automated boolean not null   -- the automation disclosure input
delivered_to -> profiles SET NULL · delivered_at
created_at
```

RLS on both tables: enabled, zero policies (reports are written through a rate-limited server action; both are read only in admin). Anonymity is toward the target, not toward the platform; whether these are DSA notices or in-product signals is Q14 (counsel). Retention: report rows 24 months, statements 5 years, wired into the existing retention-purge cron.

**`map_report_scores`** (threshold and decay state; service-role only, NEVER on profiles)

```
target_type / target ids (exactly one set) · report_score int not null
computed_at · unique per target
```

Computed nightly by a cron from first principles each run (active reports minus decay credits: artists earn 1 credit per 3 completed stays without new reports, studios 1 per 5 thumbs up), so the score stays auditable; the row exists only to render cheaply. It lives in its own zero-policy table because anything on the artist-writable profiles row would be self-editable (the exact gap the 0074 draft closes). Threshold effects (artist at 5: shown to the artist and the next requested studio; studio at 10: warning to artists) fire in the cron with a `moderation_statements` record.

### 2.7 Shops

```
shop_profiles: id pk · owner_user_id -> profiles UNIQUE · name · description
  shop_type text  -- supply | needles | ink | piercing
  website_url / webshop_url / google_maps_url / instagram_handle
  advertise_citywide boolean default false
  approval_status text default 'pending'  -- pending | approved | rejected | suspended  (manual admin approval)
  created_at / updated_at
shop_catalog_items: id pk · shop_profile_id CASCADE · name · description · price_label text · image_path · position
  (display only; no checkout, no commission)
shop_blocks: id pk · studio_profile_id CASCADE · shop_profile_id CASCADE · created_at · unique pair
  (studio owners block shops after contact; service-role only, like blacklists)
```

Shop accounts ride normal profiles rows (the elevation model), so the proxy's profile-existence gate holds. Shops see no artist personal data beyond public surfaces; shop-to-studio contact goes through the notification system, gated by `shop_blocks`.

### 2.8 Artist-side columns (the only profiles changes)

New real columns on `profiles` (indexed, off by default, presentation-independent):

```
map_visibility text not null default 'off'        -- off | city_only | listed
looking_for_guest_spots boolean not null default false
passport_public boolean not null default false
map_city_label text · map_city_place_id text · map_city_lat / map_city_lng double precision
travel_map_consent boolean not null default false  -- future destinations on the map; distinct from show_on_booking_form
```

Every one of these is artist-writable, so the landing migration extends the column grants from the 0074 draft in the same file. Anonymous area counts aggregate only rows with `map_visibility != 'off'` (city_only contributes to counts but not the list) and render only above the Q13 floor; see section 5 for the deliberate tension with the locked "private artists are counted" line. The passport is a read model over completed stays and trips gated by `passport_public`; no new store.

### 2.9 Account blocking (locked capability, scope 4.12)

**`account_blocks`**

```
id uuid pk · blocker_user_id -> profiles CASCADE · blocked_user_id -> profiles CASCADE
created_at · unique (blocker_user_id, blocked_user_id)
```

RLS: blocker-only (own rows, all operations). Private plane; neither side's public surfaces reveal a block. Enforcement is in the read paths: shapers and server cores filter blocked pairs out of artist lists, group message rendering, request inboxes, and shop contact. Lands in Phase 2 with the other privacy settings.

## 3. Role and permission matrix

Capabilities are additive on the one account; nothing role-like lives on profiles.

| Capability | Artist (base) | Studio owner | Shop owner | Admin |
| --- | --- | --- | --- | --- |
| Browse map, filters, studio/shop pages | yes | yes | yes | yes |
| Opt into map presence, looking status, passport | own | own | no (no artist surface required) | no |
| Watch studios | yes | yes | no | no |
| Submit guest spot requests | yes | yes (as artist) | no | no |
| Thumbs up | per eligibility | per eligibility | no | no |
| File reports | yes | yes | yes | reads queue |
| Create or claim one studio | via elevation | is the elevation | no | creates/edits any |
| Studio page, photos, categories, availability state | no | own studio | no | any (moderation) |
| Guest spot inbox: accept / pass / suggest dates | no | own studio | no | no |
| Private pricing notes to requesters | no | own studio | no | no |
| Workspaces, assignments, overbook override | no | own studio | no | no |
| Group: create, announcements, documents, house rules, votes | member-level only | own group | no | no |
| Group: chat, ballots, propose votes | as member (incl. stay window) | yes | no | no |
| Blacklist artists | no | own studio | no | reads on escalation |
| Temporary map post (1/month) | no | own studio | no | removes |
| Shop profile + catalog + citywide flag | no | no | own shop | approves/suspends |
| Contact studio owners | normal channels | normal channels | yes, until blocked | no |
| Seeding CRUD, claims review, report queue, badges | no | no | no | yes |
| Block another account | yes | yes | yes | n/a |

Enforcement layers, in order: route/server-action guards (owner checks through the server cores), RLS as the second line (two-party policies on request/stay tables, membership helpers for groups, zero-policy service-role tables for private planes), and shapers as the only path to public rendering.

## 4. What lands when

| Build plan phase | Tables landing |
| --- | --- |
| Phase 1 | map_locations (without the profile link columns), location_claims, styles, map_reports + moderation_statements (storage + admin queue), seed-cap bookkeeping |
| Phase 2 | watched_studios, profiles columns (+ grant extension), artist_styles, account_blocks |
| Phase 3 | studio_profiles, studio_categories, studio_photos (+ the private studio-media bucket), studio_memberships, studio_blacklists; `map_locations.studio_profile_id` added by ALTER here; temporary_map_posts in the named follow-on slice |
| Phase 4 | guest_spot_requests, guest_spot_proposals, guest_spot_stays, guest_spot_private_notes, trip_legs additive columns; the general private bucket (pricing notes + group documents + the FU-20 support-attachments payoff) built here |
| Phase 5 | studio_workspaces, availability, assignments |
| Phase 6 | studio_groups and all group tables (message transport per Q10) |
| Phase 7 | map_thumbs_up, studio_badges, map_report_scores + the threshold cron |
| Phase 8 | shop_profiles, shop_catalog_items, shop_blocks; `map_locations.shop_profile_id` added by ALTER here |

`map_locations` ships in Phase 1 without its two profile-link columns; each arrives by ALTER in the phase that creates its target table, so no FK ever points at a table that does not exist yet.

## 5. Open items and their resolutions

Resolved by founder decision 2026-07-17:

- **Anonymous counting is consent-gated.** Only artists with `map_visibility != 'off'` are counted; `city_only` counts without listing; fully-off artists appear nowhere. This consciously narrows the original "private artists are still counted" line (recorded in scope 4.1).
- **Blacklisted requests get a quiet hold.** They land in a collapsed blocked section of the studio inbox with no notification; the owner can still open and pass manually. Nothing observable distinguishes it from a studio that has not answered.
- **One shop per owner account in v1** (`shop_profiles.owner_user_id UNIQUE`), mirroring the studio cap; relaxable later by dropping the constraint.
- **The Studio tier is redefined by 2.0** (recorded in `docs/business-model.md` Phase 4): the studio owner role is the tier's identity, BM-4.x booking multi-tenancy becomes a later expansion. Pricing placement stays open as Q8.

Still open for sign-off:

- Exact bucket function for the seed cap (geohash precision vs a plain grid); Phase 1 picks with a test proving one bucket approximates 300 square km.
- Report reason vocabulary final wording (with the DSA doc update, Q14).
- The Q6 storage cap value and the Q13 count floor (their columns and check points are in place either way).
- Message transport for groups (Q10): the tables above assume messages-in-Postgres; a hosted service would replace `studio_group_messages` with an external reference and keep everything else.
- Thumbs survival semantics on giver account deletion (SET NULL keeps the counter; confirm with GDPR counsel alongside the report retention rules).

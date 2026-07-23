# Account tier feature matrix

**Status:** System definition, 2026-07-23 (roadmap slice BM-2.0). Companion to `docs/product/account-and-entitlement-system.md`. Every current and near-term feature mapped to an entitlement key, a scope, a tier, an enforcement point, platform availability, downgrade behavior, and a business-model role.

Conventions: sentence case, no em-dashes.

Reading the tier columns:

- **Free**: available to everyone today and recommended to stay free.
- **Plus**: the artist-leverage tier (approximately 3 euro per month). "gated (enforced)" means a `canAccess` gate exists today; "gated (unbuilt)" means the tier assignment is recommended but no code enforces it yet.
- **Studio**: the organization tier (approximately 25 euro per month, later, comped during map bootstrap).
- **Add-on**: a candidate transaction fee or paid add-on, not a subscription tier.

Entitlement keys: the six that exist today (`deposits`, `branding`, `custom_templates`, `extra_fields`, `extra_trips`, `analytics`) are real. Keys marked (proposed) do not exist yet; they name the gate a feature would need. Keys must stay stable even if tier names or prices change.

Enforcement authority legend: SVR = server core or API route (the real boundary), DB = database policy or grant, ENV = deployment flag, KILL = capability kill switch, UI = display only, NONE = no gate exists.

---

## 1. Tier and enforcement matrix

| Feature | Entitlement key | Area | Scope | Free | Plus | Studio | Add-on | Role req | Limit | Current enforcement | Required enforcement | Web | Android | iOS | Tablet | Downgrade behavior | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public booking page | (none, core) | public | artist | yes | inc | inc | no | none | none | account_status filter (SVR) | keep | yes | via web | via web | resp | link goes dark if suspended, data intact | high |
| Booking form plus standard-field toggles | (none, core) | public | artist | yes | inc | inc | no | none | 5 images | honeypot, rate limit, origin (SVR) | keep | yes | config | config | resp | n/a | high |
| Custom fields | `extra_fields` | config | artist | yes (cap) | higher cap | inc | no | artist | none today | NONE | SVR limit check | yes | yes | yes | resp | over-cap read-only, not deleted | high |
| Booking requests plus status FSM | (none, core) | workspace | artist | yes | inc | inc | no | artist | none | RLS plus FSM plus ownership (SVR, DB) | keep | yes | yes | yes | iPad | hidden on suspend, data intact | high |
| Calendar plus manual appointment | (none, core) | workspace | artist | yes | inc | inc | no | artist | none | RLS plus ownership (SVR, DB) | keep | yes | yes | yes | iPad | hidden on suspend, data intact | high |
| Manual deposit tracking | (none, core) | money | artist | yes | inc | inc | no | artist | amount 1..100000 | FSM (SVR) | keep (the free floor) | yes | yes | yes | resp | always available | high |
| In-app card deposit (Stripe Connect) | `deposits` | money | artist | no | **gated (enforced)** | inc | no | artist | rate limit | `canAccess` plus kill switch plus Connect (SVR) | keep | yes | yes | yes | resp | future deposits become manual, paid ones untouched | high |
| Client management plus notes | (none, core) | workspace | artist | yes | inc | inc | no | artist | none | RLS (DB) | keep; advanced CRM could be Plus later | yes | yes | yes | resp | hidden on suspend, notes retained, exportable | high |
| Waitlist | (none, core) | public plus workspace | artist | yes | inc (expanded controls) | inc | no | artist | note 280 | RLS plus rate limit (SVR, DB) | keep base; per-trip and priority gate is unbuilt | yes | yes | yes | resp | public form dark on suspend, entries retained | high |
| Books, cap, window, slots | (none, core) | config | artist | yes | inc | inc | no | artist | closed msg 280 | RLS plus atomic slot lock (SVR, DB) | keep | yes | yes | yes | resp | n/a (config) | high |
| Automated reminders and reconfirmation | (none, core) plus `custom_templates` for wording | lifecycle | artist | yes (base) | customization | inc | no | cron | 10 emails/artist/run | CRON_SECRET (SVR) | keep base free; customization gate unbuilt | server | affects both | affects both | n/a | n/a | high |
| Transactional and editable email templates | `custom_templates` | lifecycle | artist | yes (full edit today) | full edit (intended) | inc | no | artist | none | NONE (RLS on the table) | SVR gate for full-edit; emails always send | yes | yes | yes | resp | wording reverts to default, content retained | high |
| Customer magic-link portal | (none, core) | client-facing | booking | yes | inc | inc | no | token bearer | 30 day link | token hash plus rate limit (SVR) | keep | yes (clients) | n/a | n/a | resp | expired links show terminal message | high |
| Goods showcase (public shop) | `goods_module` (feature flag today) | commerce | artist | yes | inc | studio shop later | no | artist | unlimited products | feature flag default-on (SVR) plus RLS | keep free; migrate flag onto entitlement engine | yes | CRUD only | CRUD only | resp | rows persist; shop hidden if module off | high |
| Booking interests (goods signal) | `goods_module` | commerce | booking | yes | inc | inc | no | anon writes, artist confirms | 10 per item | feature flag (SVR) plus RLS | keep free (demand capture) | yes (submit) | artist confirm | artist confirm | resp | no interest UI if module off | high |
| Appointment add-ons (payable goods checkout) | `checkout_addons` plus (proposed) `goods_addons` | commerce | artist | transaction fee | richer (inventory, variants) | studio shop | **take rate add-on** | artist | 10 per item, EUR only | parked: `GOODS_COMMERCE_ENABLED` plus `CHECKOUT_ADDONS_PROD_READY` plus Connect (SVR) | fix 0% take, then transaction fee on all tiers; Plus for inventory and analytics | yes (portal) | no | no | resp | silently deposit-only when parked | high (parked), medium (tier) |
| Studios library (venue bookmarks) | `extra_trips` (shared label) | travel | artist | yes (cap) | higher cap | inc | no | artist | none today | NONE (RLS) | SVR limit check | yes | yes | yes | resp | over-cap read-only | high |
| Trip planner (Guest Spots) | `extra_trips` | travel | artist | yes (cap) | higher cap | inc | no | artist | none today | NONE (RLS, plus trip-leg triggers for 2.0) | SVR limit check | yes | yes | yes | resp | over-cap read-only | high |
| Travel icons | (none, cosmetic) | travel | artist | yes | inc | inc | no | artist | palette | app-side sanitize | keep | yes | yes | yes | resp | n/a | high |
| Studio profile plus guest-spot hosting (2.0) | (proposed) `studio_profile`, `studio_hosting` | studio | studio | comp during bootstrap | n/a | **the Studio tier** | no | studio owner | 1 studio/owner | env flag `NEXT_PUBLIC_TATTOO_MAP` plus ownership (SVR, DB) | studio-scoped entitlement when studios pay (Q8) | yes | browse map only | browse map only | resp | detach on owner deletion; no studio-deletion path yet | high (build), low (price) |
| Studio house rules, welcome pack, timeline | (proposed) `studio_welcome_pack`, `studio_timeline` | studio | studio | comp during bootstrap | n/a | inc in Studio | no | studio owner plus confirmed stay | file caps | ownership plus stay gate (SVR, DB) | add tier check on top of ownership when studios pay | yes | no | no | resp | studio-scoped, survives owner change | high |
| Flash designs | (none, core) | content | artist | yes | inc | inc | no | artist | none | RLS (DB) | keep free | yes | yes | yes | resp | rows persist | high |
| Instagram integration (connect, sync, import) | (none) plus kill switch | content | artist | yes | inc | inc | per-tier cap candidate | artist | 50 posts/sync | `isCapabilityDisabled("instagram_import")` (KILL) plus config (ENV) | keep free; per-tier sync cap if cost bites | yes | yes | yes | resp | disconnect purges IG thumbnails | high |
| Bio / Linklee hub | `bio_page_modules` (feature flag, dead) | content | artist | yes (founder-locked free) | inc | inc | no | artist | 10 blocks/type | feature flag never called (NONE) | keep free | yes | yes | yes | resp | n/a | high |
| Personal analytics | `analytics` | analytics | artist | lightweight | fuller (intended) | studio analytics | no | artist | none | NONE (mobile Insights always on) | SVR gate for the Plus depth | yes | yes | yes | resp | hide paid depth, keep free dashboard | high |
| Map browsing and discovery | (none) | discovery | anon-or-artist | yes (logged-in) | inc | inc | no | authed | pin sampling | env flag plus auth plus RLS plus RPC grants (SVR, DB) | keep free (network supply) | yes | browse | browse | resp | n/a | high |
| Artist map presence (`map_visibility`) | (none, consent axis) | discovery | artist | yes, self-serve | inc | inc | no | artist | 3-artist anon floor | consent column plus account_status (SVR) | keep free and self-serve, never fold into a tier | yes | via settings | via settings | resp | n/a | high |
| Studio claim | (none) | discovery | artist | yes | inc | inc | no | artist | rate limit, 1 studio/owner | rate limit plus admin approval (SVR) | keep free (acquisition funnel) | yes | no | no | resp | n/a | high |
| Featured map placement | (proposed) `featured_placement` | discovery | studio | no | no | maybe | **add-on** | studio owner | n/a | does not exist | greenfield, claimed studios only, disclosed | n/a | n/a | n/a | n/a | n/a | proposal only |
| Fee sponsorship (waive the 3%) | (internal) `fee_sponsored` | money | artist | admin-granted | admin-granted | admin-granted | no | admin | cap cents | `canSponsorFeeCents` plus ledger (SVR, DB) | keep (internal mechanism, template for credits) | yes | via server | via server | n/a | n/a | high |
| Admin console, growth cockpit, support, moderation | (internal role) | internal | platform | n/a | n/a | n/a | no | admin (env plus AAL2) | n/a | `requireAdmin` fail-closed plus service-role tables (SVR, DB) | keep internal, never a customer tier | yes | no | no | n/a | n/a | high |
| Support tickets (artist side) | (none, core) | support | artist | yes | inc | inc | no | artist | none | RLS, internal messages hidden (DB) | keep free (trust and safety) | yes | yes | yes | resp | hidden on suspend, retained | high |

Notes:

- "inc" means included at that tier and above.
- The five entitlement keys `branding`, `custom_templates`, `extra_fields`, `extra_trips`, `analytics` currently enforce nothing. Their "required enforcement" cell names the server layer they must be wired to before Plus is sold.
- `goods_module`, `checkout_addons`, `bio_page_modules` live in the older `profiles.settings.features` system, not the entitlement engine. The migration plan reconciles them.
- Trust-and-safety and booking-safety features (portal, reminders, transactional emails, support, manual deposits) must never be paywalled; they are marked Free and stay Free.

---

## 2. Business-model matrix (same features, commercial columns)

Keyed by the same feature names. Deep treatment and the flow diagram are in `docs/product/account-tier-business-model-map.md`.

| Feature | Customer segment | Business-model role | Paying entity | Revenue mechanism | Pricing metric | Upgrade trigger | Network effect | Cost driver | Commercial rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public booking page | solo artist | acquisition | none | none | n/a | none | none | hosting | the funnel; paywalling it kills adoption |
| Booking form plus custom fields | solo, serious artist | activation to conversion | Plus (fields overflow) | subscription | number of fields | hitting the field cap | none | negligible | a couple of questions is core; unlimited bespoke intake is polish |
| Booking requests plus FSM | solo artist | core retention | none | none | n/a | none | none | compute | the irreducible job; never paywall |
| Calendar plus appointments | solo artist | retention | none | none | n/a | none | none | compute | table stakes |
| Manual deposit tracking | solo artist | activation (free floor) | none | none | n/a | none | none | negligible | keeps Free useful and gives Plus something concrete to add |
| Card deposit | serious, traveling artist | transaction plus conversion | Plus artist | 3% fee plus subscription | per paid deposit plus per account | wanting card collection | none | Stripe ~2 euro/account/mo plus processing | the concrete "I am serious" upgrade and the launch margin |
| Client management plus notes | solo artist | retention | none | none | n/a | none | none | negligible | replace the spreadsheet; advanced CRM could be Plus later |
| Waitlist | busy artist | acquisition plus retention | Plus (expanded only) | subscription | per-trip, priority | wanting per-trip waitlist | none | negligible | basic capture is a no-gap tool; depth is a Plus lever |
| Books, cap, slots | solo artist | activation | none | none | n/a | none | none | compute | control intake volume; the "not drowning in DMs" promise |
| Reminders | both sides | retention plus trust | Plus (customization) | subscription | window and wording depth | wanting custom windows | none | email send cost | missed appointments hurt everyone; keep the send free |
| Email templates | solo artist | retention plus trust | Plus (custom wording) | subscription | full-edit access | wanting bespoke wording | none | email cost | deliverability is trust; wording is polish |
| Customer portal | client | trust and safety plus conversion | none | none | n/a | none | none | compute | client self-service reduces support load |
| Goods showcase | selling artist | acquisition plus retention | none | none | n/a | none | indirect (stickier bio) | storage | a lead magnet; paywalling display kills leverage |
| Booking interests | selling artist, client | conversion primer | none | none | n/a | none | none | negligible | demand capture at the strongest moment |
| Appointment add-ons | selling artist | transaction (primary goods lever) | client pays, artist bears take | platform take on goods GMV | percent of goods GMV | wanting to sell at the appointment | none | Stripe, refunds, VAT and MoR | leverage on an already-converting buyer; fix the 0% take first |
| Studios library | traveling artist | activation | Plus (overflow) | subscription | number of studios | hitting the cap | none | negligible | private data; weak standalone lever |
| Trip planner (Guest Spots) | traveling artist | activation plus retention | Plus (overflow) | subscription | number of trips | hitting the cap | seeds the map when a leg is a guest-spot stay | negligible | the "traveling artist" job; the real Plus lever is deposits, not trips |
| Studio profile plus hosting | studio owner | expansion plus network | studio owner | Studio subscription | per studio | wanting to host guest artists | central (two-sided map) | storage, moderation | a business expense the owner will pay for; the map's monetization channel |
| Studio welcome pack, timeline | studio owner | retention (Studio) | studio owner | Studio subscription | per studio | inc in Studio | accretive to the network | storage | already isolated on studio ownership; the clean Studio boundary |
| Flash designs | all artists | activation plus conversion | none | none | n/a | none | none | storage | feeds the deposit-gated booking path |
| Instagram import | all artists | activation plus acquisition | none, per-tier cap candidate | none, cap add-on | sync or import volume | storage pressure | none | storage plus sharp compute (the one variable cost) | the onboarding accelerant; cap it if cost bites, do not paywall |
| Bio / Linklee hub | all artists | acquisition plus network | none | none | n/a | none | distribution | negligible | replaces Linktree; land-grab, founder-locked free |
| Personal analytics | serious artist | retention plus conversion | Plus | subscription | analytics depth | wanting deeper stats | none | compute | lightweight free, deeper paid |
| Map browsing | traveling artist, studio owner | acquisition plus network | none | none | n/a | none | central | query cost | discovery is the funnel that produces claims; never paywall |
| Artist map presence | opted-in artist | network supply | none | none | n/a | none | central (density) | negligible | consent, not tier; supply that makes the map worth a host paying for |
| Studio claim | studio owner | acquisition (top of funnel) | none | none | n/a | claiming | central | admin review | the conversion path to the paid Studio owner |
| Featured map placement | studio owner | expansion (proposed) | studio owner | paid boost | per featured listing | wanting visibility | could erode trust if abused | ranking | leverage monetization, claimed studios only, disclosed |
| Fee sponsorship | comped artist | trust plus beta | Inklee absorbs | negative (cost) | per waived fee | n/a | none | foregone 3% | beta acquisition and support tool |
| Admin, cockpit, support, moderation | Inklee staff | internal operational | n/a | n/a | n/a | n/a | n/a | founder time | never a customer tier |
| Support tickets | all artists | trust and safety | none | none | n/a | none | none | founder time | protect the product; never a paywall |

---

## 3. Product argument for each tier boundary

The audit refuses to mark a feature paid merely because it looks advanced. Each Plus boundary has a concrete argument:

- **Card deposits are Plus, not Free**, because every Custom Connect account costs Stripe roughly 2 euro per month and is loss-making on small deposits, so gating card collection behind a paying subscriber is what makes the deposit product economically coherent. The manual-deposit floor keeps Free genuinely useful. This is the one boundary that already carries a real cost argument, and it is the only enforced gate today.
- **Branding removal, custom email wording, higher caps, deeper analytics, and reminder customization are Plus**, because they are polish and leverage on top of a complete free workflow, not survival. A free artist can run their entire booking business without any of them. They are clean, low-risk conversion levers that do not cripple the free tier.
- **Studio profile and hosting are Studio**, because they deliver organization-level value (a public studio presence, a guest-spot inbox, shared studio content) that a solo artist does not need, and because the paying entity is a business (the studio owner) with a higher willingness to pay. Studio must represent organization value, not Plus at a higher price.
- **Goods add-ons are a transaction feature, not a hard Plus gate**, because the ability to sell to an already-converting buyer is a revenue behavior a free artist would gladly pay a per-transaction fee for; reserving inventory, unlimited variants, and sales analytics as the Plus or Studio entitlement is the right split. The 0% goods take must be fixed first.

Features that must stay Free and why: the public page, the form, the request FSM, calendar, waitlist, books and slots, manual deposits, client notes, the customer portal, transactional emails and reminders, flash, the bio hub, map browsing, and support. They are acquisition, activation, core retention, trust and safety, and network supply. Paywalling any of them suppresses the top of the funnel or breaks booking safety.

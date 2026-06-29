# Onboarding redesign inventory (ME-12)

**Created:** 2026-06-16 · **Scope:** the artist onboarding wizard on **both** surfaces (web + mobile). This is the working reference for the ME-12 redesign pass (graphics / illustrations, step functionality, copy, layout). Founder is driving the visual direction.

Every string below is **verbatim** from the current code. File paths are the source of truth. If you change copy, hold the [copy rules](#copy-rules-to-honor) at the bottom.

---

## Files

| Surface | Intro / story | Wizard steps | Progress |
| --- | --- | --- | --- |
| **Web** | `apps/web/src/app/(artist)/onboarding/welcome/welcome-slides.tsx` | `claim-slug/` `booking/` `availability/` `form/` `done/` (each a `page.tsx`) | `apps/web/src/components/onboarding-progress.tsx` |
| **Mobile** | `apps/mobile/src/components/onboarding/OnboardingIntro.tsx` | `apps/mobile/app/onboarding/` `index` `claim` `booking` `done` | (none — story segments only) |

Layouts: web `onboarding/layout.tsx` (owns full viewport, hides app shell, `max-w-md`); mobile `onboarding/_layout.tsx` (charcoal stack, headerless, `slide_from_right`).

Mobile API the wizard posts to: `apps/web/src/app/api/mobile/onboarding/{profile,booking,complete,slug-check}/route.ts`.

---

## Brand palette

| Token | Hex | Used as |
| --- | --- | --- |
| mustard | `#e9b22b` | slide 1 bg, primary CTA fill (text = charcoal) |
| rosa | `#db88b9` | slide 2 bg, "New" chip |
| green | `#105f2d` | slide 3 bg, success states (`brand-green` / `success`) |
| charcoal | `#1e1e1e` | text/fg, mobile shell bg, link pill |
| bone | `#e5e1d5` | faux-UI panels, mobile fg |

Source: `apps/web/src/app/globals.css` (`--color-brand-*`), `apps/mobile/src/lib/tokens.ts`.

---

## 1. Intro story slides

Both surfaces: 3-slide Instagram-story format (auto-advance, press-and-hold to pause, tap left third = back / right two-thirds = forward). Card is **aspect 4:5**, corner radius **28px**, on a solid brand-color background. Web auto-advance **6500ms**; mobile **5000ms** (and mobile disables auto-advance under a screen reader).

**Graphics today:** Web has hand-built **faux-UI illustrations** (divs styled as mini app screens). Mobile now ships the **founder's three brand illustrations** (`apps/mobile/src/components/onboarding/onboarding-art.ts`, rendered via `react-native-svg` `SvgXml`); the brand-colour background card is baked into each illustration (FU-13 — done for mobile; web still on faux-UI). The web faux-UI is exported as PNG in `docs/onboarding-assets/` (see [Assets](#assets)) as a visual starting point.

### Copy (identical structure both surfaces, minor word drift noted)

| # | BG | Eyebrow | Title | Body |
| --- | --- | --- | --- | --- |
| 1 | mustard | `Your booking link` | **One link. Every booking.** | Drop a single Inklee link in your Instagram bio. Clients tap it to start a request. No more booking chaos buried in your DMs. |
| 2 | rosa | `Your inbox` | **Requests, already sorted.** | Every client tells you placement, style, size and a reference up front. Each request lands in one tidy **dashboard** *(mobile: "inbox")*, ready to review. |
| 3 | green *(mobile illustration uses a bone card)* | `Your calendar` *(mobile: `Your studio`)* | **Review, approve, done.** *(mobile: "Run it all in one place.")* | Accept or pass with a tap. Accepted bookings move straight to your calendar, so you stay in control **and organised.** *(mobile, feature-expanded: "Accept or pass requests with a tap, and bookings land on your calendar. Then build your Link Hub, organize guest spots and manage the rest of your studio.")* |

### Graphic detail (web faux-UI, per slide)

- **Slide 1 — `LinkVisual`:** bone card; avatar circle (`Sparkles` icon, charcoal/45) + two skeleton text bars; a charcoal pill with a mustard `Link2` icon and the text **`inklee.app/you`**; one trailing bar.
- **Slide 2 — `RequestVisual`:** bone card; avatar + skeleton bar + rosa **`New`** chip; three labeled rows **`Placement` / `Style` / `Size`** each with a value-skeleton; an upload tile + a square with an `Image` icon.
- **Slide 3 — `ApproveVisual`:** two stacked bone cards. Card 1: avatar + bars, then a mustard **`Accept`** button (`Check`, strokeWidth 3) beside a ghost outline box. Card 2: a 7×3 day grid (21 cells) with one green checked day (`Check`, bone).

### Mobile illustrations (per slide) — shipped

Founder brand illustrations, each baked onto its own full-bleed brand-colour card (rounded corners live in the artwork): slide 1 hamsa hand (mustard), slide 2 face/mask (rosa), slide 3 dinosaur (bone). Source art lives outside the repo (`Branding/illustrations/Onboarding/inklee-onboarding-slides-0{1,2,3}.svg`); `.scratch/gen-onboarding-art.cjs` normalises it into `onboarding-art.ts` — it inlines the CSS-class fills to presentation attributes (SvgXml does not resolve `<style>` selectors), drops invisible `fill:none` duplicate paths, rounds coordinates to 2 dp (keeping the decimal point so adjacent path numbers can't merge), and pixel-verifies each result against the source with `sharp`. Replaced the former single-Ionicon placeholders (`link-outline` / `albums-outline` / `checkmark-circle-outline`).

### Controls

- Web: `Next →` / `Back` (`ChevronLeft`); last slide → **`Start setup →`** (mustard pill) + `Back`; persistent **`Skip intro`** below.
- Mobile: `Next` (secondary); last slide → **`Get started`**; **`Skip intro`** below. (Both Skip and the final CTA route to the claim step.)

---

## 2. Wizard steps

### Web — 5 steps + progress bar

Progress (`onboarding-progress.tsx`): pill row **Link → Booking → Availability → Form → Done**. Done = mustard circle + `Check`; active = mustard ring; future = bordered number. Completed steps are clickable (jump back). Caption: `Step {n} of 5 — {label}`.

> Note: `onboarding/profile/page.tsx` is a dead redirect (`→ /onboarding/booking`) — the profile step was merged into claim-slug. `welcome/` is the intro.

**Step 1 · Link** (`claim-slug/page.tsx`) — H1 **"Your profile"** · sub *"This is what clients see on your booking page."*
- **Artist name\*** — placeholder `e.g. Bert Grimm` · helper "Shown on your public booking page."
- **Booking link\*** — prefix `inklee.app/` + `your-name`. Live hints: `Checking…` / `Available ✓` / `Already taken` / `This is your current link`. Helper "3–30 characters, lowercase letters and dashes only." (Pre-fills from the `/start` landing handle via `inklee_intended_slug`.)
- **Instagram handle** (optional) — `@` + `yourhandle` · helper "Shown as a link on your booking page."
- **Location** (optional) — `e.g. Berlin`
- CTA **`Continue →`** (disabled until slug available).

**Step 2 · Booking** (`booking/page.tsx`) — H1 **"Booking mode"** · sub *"How do you want clients to request appointments?"*
- `CalendarDays` **Preferred date** — "Choose this if you want to review ideas first and propose a date together. Clients suggest a date; you decide each request."
- `Clock` **Fixed slots** — "Choose this if you want clients to pick from exact times you publish. You'll need to post at least one slot before sharing."
- Fixed-slots warning (orange ⚠): **"Your booking page will be closed until you publish slots"** / "After setup, go to **Bookings → Books & Availability** to add your first time slots before sharing your link."
- CTA **`Continue →`**.

**Step 3 · Availability** (`availability/page.tsx`) — H1 **"Availability"** · sub *"Should your booking page be open for requests right away?"*
- `BookOpen` **Open for bookings** — "Clients can submit requests as soon as your link is live."
- `BookX` **Not yet, open later** — "Your page exists but clients cannot submit requests until you open it in settings."
- Optional **Closed message** (shown to visitors) — placeholder `e.g. Books opening soon. Check my Instagram for updates` (max 280).
- CTAs **`Continue →`** + `Skip`.

**Step 4 · Form** (`form/page.tsx`) — H1 **"Booking form"** · sub *"What should clients include in their request? These are your defaults. You can adjust them later in settings."* Three toggles, **all default ON:**
- `Image` **Reference image upload** — "Clients can attach reference photos with their request."
- `AlignLeft` **Require a description** — "Clients must describe their tattoo idea before submitting."
- `Link2` **Reference link field** — "Clients can paste a link to inspiration (Pinterest, etc.)."
- Footnote: "Clients always provide: Instagram handle, tattoo placement, and preferred date. The fields above are additional."
- CTAs **`Looks good →`** + `Skip`.

**Step 5 · Done** (`done/page.tsx`) — `CheckCircle2` (green) + H1 **"You are ready."** / **"Almost ready."** Sub: "Your booking page has the basics in place and can be shared." / "Your public page exists, but clients cannot safely book until the required availability setup is finished."
- **Checklist card** (green `CheckCircle2` each): Profile set up · Booking mode · Availability configured · Booking form ready (details computed from profile/slots).
- **"Your booking link" card** (`Link2`) — mono URL + `Preview your page` (+ `Finish setup` if not ready).
- **Logo upload** (`done/logo-upload.tsx`, `Image` icon) — "Add your logo (optional)", 64px round preview / dashed "None", `Choose image`/`Replace`, helper "PNG, JPG, WebP — max 2 MB". (Client-side validation: rejects HEIC + >2 MB with specific messages.)
- CTA **`Go to dashboard`** / **`Set up availability`**.
- **"Set up when ready"** optional grid: `Zap` Flash items · `Plane` Guest spots · `Mail` Email templates · `CreditCard` Deposit collection. Sub: "These are optional - configure them whenever they actually help your workflow."

### Mobile — 3 steps, dark, no progress bar

Flow `index (intro) → claim → booking → done`. Each step screen has a `ChevronLeft` back. **Availability is folded into the booking step; there is no separate form-fields step** (clients get web defaults).

**Claim** (`claim.tsx`) — H1 **"Claim your booking link"** · sub *"This is where clients land to send you a request."* Eyebrow (`eye-outline`): **"Clients see this"**.
- **Artist / studio name** — `Jane Doe`
- **Your link** — `jane`; right-slot live indicator (`checkmark-circle` / `close-circle`); hint shows the `<slug>.inkl.ee` preview live, "Letters, numbers and dashes, e.g. jane"; errors "That link is taken. Try another." / format error.
- **Instagram (optional)** — `@yourhandle`
- **Location (optional)** — `Berlin, DE`
- CTA **`Continue`** + a disabled-reason line ("Add your name and pick an available link." etc.). Conflict on submit: "That link was just taken. Pick another."

**Booking** (`booking.tsx`) — H1 **"How do clients book?"** · sub *"You can change this any time in Booking settings."*
- **Request a date** — "Clients suggest a date and details. You confirm or negotiate. Best for most artists." *(same mode web calls "Preferred date")*
- **Fixed slots** — "You publish specific time slots. Clients pick one."
- **Booking status** → pills **Open** / **Closed**, helper "Your page accepts new requests right away." / "Your page shows a closed notice. Open it whenever you're ready."
- Optional **Closed message** — `Books reopen in July`
- CTA **`Continue`**.

**Done** (`done.tsx`) — `checkmark-circle` (green, translucent circle) + H1 **"You're live"** / **"Your link is claimed"** (fixed-slots). Sub varies: "Your page is open and ready for requests." / "Publish your slots to start taking bookings." / "Your page is set up. Tap the status pill up top to open your books whenever you're ready."
- **"Your booking link" card** (`link`) — host + status dot ("Open, accepting requests" / "Closed for now").
- Buttons: **`Share your link`**; then **`Send yourself a test request`** (or **`Publish slots`** → `/settings/slots/new` for fixed-slots).
- Tip (`bulb-outline`): "Add a logo and set up deposit collection any time from Settings in the top-bar menu."
- Bottom CTA **`Start using Inklee`** (flips `onboarding_completed`, swaps to tabs).

---

## 3. Icon inventory (for an iconset swap)

- **Web intro (faux-UI):** `Link2`, `Sparkles`, `Image`, `Check` (lucide).
- **Web steps:** `Check`, `CalendarDays`, `Clock`, `BookOpen`, `BookX`, `Image`, `AlignLeft`, `Link2`, `CheckCircle2`, `CreditCard`, `Mail`, `Plane`, `Zap`, `ChevronLeft` (lucide).
- **Mobile:** `link-outline`, `albums-outline`, `checkmark-circle-outline`, `eye-outline`, `checkmark-circle`, `close-circle`, `link`, `bulb-outline` (Ionicons) + `ChevronLeft` (lucide-react-native).

---

## 4. Web ↔ mobile divergences to resolve

Decisions to make during the redesign, since ME-12 covers both surfaces:

1. **Step count.** Web 5 (separate Availability + Form steps) vs mobile 3 (booking absorbs availability; **no form-fields step at all**). Either give mobile the form step or drop it from web.
2. **Progress affordance.** Web has a 5-dot progress bar; mobile has none. Pick one model.
3. **Copy drift.** "dashboard" vs "inbox" (slide 2); "approve" vs "accept" (slide 3); "Preferred date" vs "Request a date" (same mode); web slide 1 ends "organised" (British). Unify.
4. **Graphics gap.** Web = bespoke faux-UI; mobile = single-icon placeholders (FU-13). Target: one illustration set usable on both.
5. **Done-step depth.** Web Done is rich (checklist + logo upload + optional-feature grid); mobile Done is lean (link card + share + tip). Decide the shared shape.

---

## Copy rules to honor

From `AGENTS.md`:
- **No em-dashes (—)** in any user-visible string. Use period / comma / colon / parentheses. (Hyphens in compound modifiers are fine.)
- **Sentence case** for everything.
- **Action verbs are Accept / Pass** (not Approve / Reject). Slide 3's "Review, **approve**, done" + "you decide each request" lean off-rule — flag for the copy pass.
- Brand vocabulary lives in `src/lib/status-labels.ts` + nav config; reuse it.

---

## Assets

`docs/onboarding-assets/` — PNG exports of the three current web faux-UI slide cards (mustard / rosa / green, 4:5, 28px corners), as a visual reference for the redesign:

- `slide-1-link.png` — LinkVisual (booking link)
- `slide-2-requests.png` — RequestVisual (sorted inbox)
- `slide-3-approve.png` — ApproveVisual (review + calendar)

Regenerate: `node .scratch/gen-onboarding-cards.cjs` (untracked generator; faithful px translation of `welcome-slides.tsx`, rendered via `sharp`).

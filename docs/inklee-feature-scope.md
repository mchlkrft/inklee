# Inklee: feature list, scope and goals (store-copy source)

Raw material for App Store and Play Store listings, website copy and pitch decks. Written to the brand copy rules (sentence case, no em-dashes, Accept/Pass verbs) so lines can be lifted verbatim. Everything listed as shipped is live on `feat/mobile-e1` as of 2026-06-12; honesty notes at the bottom mark what is web-only or not yet public.

---

## One-liner

Inklee is the booking app for tattoo artists: a personal booking page, a request inbox with deposits, and the whole client workflow in one place, out of the DMs.

## Elevator pitch

Tattoo bookings live in Instagram DMs: scattered references, lost dates, ghosted deposits, endless back and forth. Inklee replaces that with one link in your bio. Clients send a proper request with placement, size, references and budget through your own booking page. You accept or pass in one tap, collect a deposit if you want one, and the calendar, client history, waitlist and follow-up emails take care of themselves. Your clients never need an account or an app. You run everything from your phone.

## Ultimate goals (the north star)

1. Become the business OS for tattoo artists: every step from "DM me" to a deposit-secured appointment handled in one artist-owned place.
2. Stay artist-first: the artist owns their page, their brand, their client list and their money. Inklee is the tool, never the marketplace.
3. Keep clients friction-free: no client accounts, no client app, ever. A link, a form, a magic link for follow-ups.
4. Make money only when artists do: free to run your books; Inklee earns a small platform fee on optional deposits, with a pro tier for power features later.
5. Grow from solo artists to guest spots, then studios: the same tool scales from one chair to a studio roster (studio features are a later phase).

## Who it is for

- Tattoo artists who book through Instagram and are drowning in DMs.
- Resident artists who want deposits secured before they draw.
- Traveling artists juggling guest spots in multiple cities.
- Flash-focused artists selling designs and walk-in days.

## What Inklee is not (scope guardrails)

- Not a marketplace or discovery platform: clients come from the artist's own audience.
- Not a client-side app: clients use the web page and email only.
- Not a generic scheduler: every field, status and flow is tattoo-native (placement, size, references, flash, guest spots, deposits).
- Not a payment middleman: deposits settle directly into the artist's own Stripe account; the artist is the merchant of record and Inklee never holds funds.

---

## Full feature list

### Your booking page (the link in bio)

- A personal page on your own subdomain (yourname.inkl.ee) with your name, logo, bio, location and Instagram.
- Custom cover image or brand color, light and dark friendly.
- Tattoo-native booking form: placement, size, description, reference images (up to 5), reference links, budget and your own custom fields.
- Photo annotations: clients pin notes directly on their reference images.
- Two booking modes: open requests with a preferred date, or fixed slots the client picks from.
- Books open or closed in one tap, with an optional auto-close date and a request cap.
- Custom closed message so the page never goes dark silently.
- Public flash gallery and flash day pages clients can browse and book from.
- Goods showcase: prints, originals, merch and flash sheets on your page.
- Guest spot dates shown on the booking form so clients book the right city.
- Public waitlist page: when books are closed, demand keeps collecting instead of disappearing.

### The request inbox (Accept / Pass)

- Every request arrives structured: client, placement, size, description, references with annotations, preferred date.
- Accept or pass in one tap; the client gets a polite, customizable email either way.
- Request statuses that match reality: pending, accepted, deposit pending, passed, cancelled.
- Big-number pipeline stats: pending, upcoming, this month.
- Status filters, infinite inbox, pull to refresh.
- Full-screen reference viewer with the client's pinned notes.

### Deposits and money

- Optional deposits on any booking: set the amount, due date and a note.
- In-app card payments through Stripe: the client pays from an email link, the booking confirms automatically when the deposit lands.
- The artist is the merchant of record: money settles straight into your own Stripe account in your currency. Inklee never touches your funds and keeps a small platform fee (3%).
- Stripe onboarding fully inside Inklee, no Stripe dashboard required, multi-currency support.
- Manual mode for artists who take deposits by bank transfer or in person: mark received, done.
- One-tap refunds with a full audit trail; cancelling an accepted booking auto-refunds a paid card deposit.
- Deposit defaults and a written deposit policy shown to clients before they pay.

### Calendar and scheduling

- Month calendar of confirmed appointments with a per-day agenda.
- Create appointments yourself for walk-ins and direct bookings.
- Fixed-slot publishing for artists who book by available windows (web).
- iCal feed: subscribe from Google Calendar, Apple Calendar or anything else.
- Configurable reminder emails before appointments so no-shows drop.

### Clients (a tattoo-native CRM)

- Every client collected automatically from their requests: handle, email, booking count, last activity.
- Full booking history per client with statuses and deposits.
- Private notes only you can see.
- Search by handle or email.

### Waitlist

- Clients join with name, email, city and a note while your books are closed.
- Demand by city: see where your waitlist actually lives, plan guest spots around it.
- One tap converts a waitlist entry into an accepted booking with a magic-link email to the client.

### Flash

- Flash catalog with photos, pricing (fixed, from, on request) and availability (unique, limited, unlimited).
- Repeat-bookable or one-off designs; sold designs close themselves.
- Flash days: publish a walk-in day page with its own designs.
- Instagram import to seed the catalog from your existing grid (web).

### Guest spots and travel

- Plan trips with multiple stops: studio, city and dates per stop.
- Guest spot dates appear on your booking form and bio page automatically.
- Studio address book with your home studio and hosts.
- Waitlist city demand next to your travel planning.

### Goods showcase

- Products on your page: prints, originals, apparel, stickers, zines, flash sheets.
- Photos, price, quantity, pickup note and visibility per product.
- Sold out in one tap from the product grid.

### Emails that sound like you

- Every client email (accepted, passed, deposit request, reminder, cancellation) is editable and can be toggled per type.
- Magic-link client portal: clients confirm details, pay deposits and see their booking without an account.

### Notifications

- In-app notification feed plus push notifications for new requests and paid deposits.
- Notification deep links straight to the request.

### Insights

- Conversion rate, request volume, accept and pass rates over time.
- Unique versus returning clients and client return rate.
- Deposit request and payment rates.
- Monthly request volume trend.

### The artist app (iOS and Android)

- The full workflow above, native: dashboard, requests, deposits, calendar, clients, waitlist, flash, guest spots, goods, insights and settings.
- Sign in with Apple and Google.
- One-tap books open/closed from the top bar, anywhere in the app.
- Photo-first editing flows: shoot, crop and upload flash, products and covers from the phone.
- Dark and light theme following the system.
- Built artist-only: clients never need to install anything.

### Privacy, security and compliance

- Clients need no account: requests via the public form, follow-ups via signed magic links.
- EU-hosted data (Supabase, Frankfurt), GDPR-grade tooling: full data export, in-app account deletion, retention purge.
- Row-level security on every table; deposits processed by Stripe, card data never touches Inklee.
- Legal package live: terms, privacy, DPA, subprocessors, cookie policy, acceptable use, content reporting (DSA).

---

## Differentiators (for comparison copy)

- Versus Instagram DMs: structured requests instead of scattered threads, deposits instead of ghosting, a calendar instead of screenshots.
- Versus Calendly and generic schedulers: tattoo-native fields, reference images with pinned notes, flash and guest spots, deposits with artist-side control, Accept/Pass instead of auto-booking strangers.
- Versus Google Forms: responses become live bookings with statuses, emails, deposits and history, not rows in a sheet.
- Versus marketplaces: your link, your brand, your clients. Inklee never puts another artist next to your work.

## Store-copy ingredients

App Store subtitle candidates (max 30 chars):

- Bookings for tattoo artists
- Tattoo bookings, out of DMs
- Your booking page + deposits

Play short-description candidates (max 80 chars):

- The booking app for tattoo artists: requests, deposits and clients in one place.
- One link in bio. Real requests, secured deposits, no more DM chaos.
- Tattoo booking page, request inbox, deposits and client history. Artist-first.

Keyword pool: tattoo booking, tattoo artist app, booking page, link in bio, tattoo deposits, flash, guest spot, tattoo appointment, client management, waitlist, tattoo business, booking form, art commissions.

Screenshot story (suggested order): 1 dashboard with pipeline numbers, 2 request detail with reference images and annotations, 3 deposit flow, 4 calendar, 5 flash gallery, 6 books open/closed quick toggle, 7 public booking page on a phone.

## Honesty notes (keep store copy true)

- Goods are showcase-only today: no in-app checkout for products (commerce is built but parked behind a flag).
- Fixed-slot publishing and Instagram flash import run on the web; the app displays and books them.
- The platform fee applies only to in-app card deposits; manual deposits are free.
- Studio features (multi-artist) do not exist yet; do not promise them.
- No subscriptions yet: the product is free in its current form. Do not state "free forever".

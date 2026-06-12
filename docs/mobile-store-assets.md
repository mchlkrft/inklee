# Mobile branding + store assets (ME-1 checklist)

**Status 2026-06-12 (end of day):** §A in-app assets GENERATED + wired (bone spiderweb on charcoal, `apps/mobile/assets/`, produced by `apps/mobile/scripts/generate-brand-assets.mjs`). §C1/§C2 (Play icon + feature graphic) GENERATED into `apps/mobile/assets/store/`. §F final listing copy written below, char-limit verified. `supportsTablet` flipped to false, so NO iPad screenshots are required (§B2 dropped). REMAINING: the screenshots (§G capture guide below) and founder sign-off on the copy + name choice.

Master mark: `apps/web/src/app/icon.svg` (vector spiderweb) — the generator recolors it so the mark stays identical between web and app.

Brand palette for reference: charcoal `#1e1e1e`, bone `#e5e1d5`, mustard `#e9b22b`, rosa `#db88b9`.

## A. In-app assets (wired into `apps/mobile/app.json`; required before ANY store build)

| # | Asset | Spec | Notes |
| - | ----- | ---- | ----- |
| A1 | App icon (iOS + base) | 1024×1024 px PNG, sRGB, **no transparency, no rounded corners** (Apple masks it) | Full-bleed; bone spiderweb on charcoal is on-brand. Goes to `expo.icon`. |
| A2 | Android adaptive icon, foreground | 1024×1024 px PNG **with** transparency | Keep the mark inside the central safe circle (~640 px of 1024) — the OS crops to circle/squircle. `expo.android.adaptiveIcon.foregroundImage`. |
| A3 | Android adaptive icon, background | Flat color (charcoal, no asset needed) or 1024×1024 PNG | `backgroundColor: "#1e1e1e"` is the zero-asset option. |
| A4 | Android monochrome icon (optional, recommended) | 1024×1024 px, white shape on transparent | Android 13+ themed icons. `monochromeImage`. |
| A5 | Splash logo | Transparent PNG, ~1024×1024, mark centered with generous padding | Rendered centered on the already-configured charcoal background (`resizeMode: contain`), so one asset covers both themes. expo-splash-screen plugin `image`. |
| A6 | Notification small icon (Android) | 96×96 px, **white silhouette on transparent (alpha only)** | Android tints it; the mustard accent color is already configured. A simplified spiderweb silhouette. expo-notifications plugin `icon`. |

## B. App Store (Apple) listing

| # | Asset | Spec | Status |
| - | ----- | ---- | ------ |
| B1 | iPhone screenshots | 1320×2868 px (6.9") or 1290×2796 (6.7"), portrait, 3 to 10. Shot list + capture guide in §G. | ⏳ needs a device (§G) |
| B2 | iPad screenshots | DROPPED — `supportsTablet` set to false 2026-06-12 (phone-first app; avoids the iPad asset set and bad-fit reviews; reversible later with an iPad layout pass). | ✅ resolved |
| B3 | App name | Final copy in §F. | ✅ written |
| B4 | Subtitle | Final copy in §F. | ✅ written |
| B5 | Description | Final copy in §F. | ✅ written |
| B6 | Keywords | Final copy in §F. | ✅ written |
| B7 | URLs | Support: inklee.app/help · Marketing: inklee.app · Privacy: inklee.app/privacy (all live). | ✅ |

The store icon is pulled from the binary (A1); no separate upload.

## C. Google Play listing

| # | Asset | Spec | Status |
| - | ----- | ---- | ------ |
| C1 | Hi-res icon | 512×512 px PNG. | ✅ `apps/mobile/assets/store/play-icon.png` |
| C2 | Feature graphic | 1024×500 px PNG. | ✅ `apps/mobile/assets/store/feature-graphic.png` (mark + wordmark + tagline; replace with designed art any time) |
| C3 | Phone screenshots | 2 to 8, between 16:9 and 9:16, 320 to 3840 px (any phone capture works as-is). | ⏳ §G |
| C4 | Tablet screenshots (7" + 10") | Only needed for the tablet listing badge; skipped. | ✅ resolved |
| C5 | Short description | Final copy in §F. | ✅ written |
| C6 | Full description | Final copy in §F. | ✅ written |
| C7 | Privacy policy URL | inklee.app/privacy (live). | ✅ |
| C8 | Promo video (optional) | YouTube URL. | skipped |

## D. Account status (ME-2)

- D-U-N-S number for Inklee OÜ: **988010563** (received 2026-06-12).
- Google Play developer account: **ready**.
- Apple Developer Program enrollment: **in progress** (was waiting on the D-U-N-S).
- EAS project already bound: `@inklee/inklee`, projectId `daf44d5c-0134-4815-bc4b-c0524dfcb93f`.

## E. Wiring (engineering)

✅ Done 2026-06-12: `app.json` carries `icon`, `android.adaptiveIcon` (foreground/monochrome/backgroundColor), splash plugin `image` + `imageWidth: 200`, notifications plugin `icon`, and `supportsTablet: false`. Remaining wiring step: one EAS preview build to verify the four in-app assets render natively (Expo Go ignores these keys).

## F. Store listing copy (final, char-limit verified; lift verbatim)

App Store name (max 30) — pick one:

- `Inklee: Tattoo bookings` (23 chars, recommended)
- `Inklee: Tattoo artist bookings` (30 chars, exact fit)
- `Inklee` (6 chars, brand-pure)

App Store subtitle (27/30): `Bookings for tattoo artists`

App Store promotional text (127/170, editable without review):

> Out of the DMs: structured requests, secured deposits and your whole booking flow in one place. Your clients never need an app.

App Store keywords (87/100, no words duplicated from name/subtitle):

> flash,deposit,appointment,client,guest spot,waitlist,intake,studio,ink,calendar,request

Play short description (77/80):

> The booking app for tattoo artists. Requests, deposits, clients. No DM chaos.

Description (both stores; 2034/4000 chars; plain text with simple lists renders fine in both):

> Tattoo bookings live in Instagram DMs: scattered references, lost dates, ghosted deposits. Inklee replaces that with one link in your bio.
>
> Clients send a proper request through your own booking page: placement, size, reference images with pinned notes, budget and preferred dates. You accept or pass in one tap. Deposits, calendar, client history and follow-up emails take care of themselves. Your clients never need an account or an app.
>
> YOUR BOOKING PAGE
> - Your own page at yourname.inkl.ee with logo, bio, cover and Instagram
> - A tattoo-native booking form: placement, size, references, custom fields
> - Books open or closed in one tap, with auto-close dates and request caps
> - Flash gallery, flash days, goods showcase and guest spot dates built in
> - A waitlist that keeps collecting demand while your books are closed
>
> THE REQUEST INBOX
> - Every request arrives structured, references and pinned notes included
> - Accept or pass in one tap; the client gets a polite email either way
> - Big pipeline numbers: pending, upcoming, this month
> - A full activity timeline on every booking
>
> DEPOSITS, DONE PROPERLY
> - Optional deposits with amount, due date and your own policy
> - Card payments through Stripe; the booking confirms itself when paid
> - Money settles straight into your own Stripe account; Inklee never holds funds
> - Manual mode for bank transfer or cash deposits, plus one-tap refunds
>
> RUN THE WHOLE WEEK
> - Month calendar with appointments, guest spots and flash days
> - iCal feed for Google Calendar and Apple Calendar
> - Client history with private notes
> - Waitlist demand by city, perfect for planning guest spots
> - Conversion, volume and return-rate insights
>
> BUILT ARTIST-FIRST
> - You own your page, your brand, your client list and your money
> - No marketplace, no discovery feed, no other artists next to your work
> - Clients book through the web; they never install anything
> - EU-hosted data, full export and in-app account deletion
>
> Free to run your books. Inklee earns a small platform fee only on optional card deposits.

## G. Screenshot capture guide (the one remaining manual step)

The shot list, in display order (capture each in dark theme; light-theme variants optional):

1. Dashboard with the pipeline widgets populated
2. Request detail showing reference images + the activity timeline
3. The deposit request form on a pending booking
4. Calendar with all three marker types (an appointment, a guest spot leg, a flash day in the same month)
5. Flash gallery
6. The books open/closed quick sheet (tap the top-bar pill)
7. Your public booking page in the in-app browser

How to capture:

- **Android (Play):** any physical phone or the Android Studio emulator; capture at native resolution. Play accepts 320 to 3840 px between 16:9 and 9:16, so the raw captures upload as-is.
- **iPhone (App Store):** there is no iOS simulator on Windows, so capture on the physical iPhone running the EAS TestFlight build (or Expo Go for UI-identical shots). App Store Connect only accepts exact sizes; if the device is not a 6.9"/6.7" class, batch-resize the captures to 1290×2796 with sharp (one-liner: `npx sharp-cli resize 1290 2796 --fit cover -i in.png -o out.png`) or any image tool.
- Use a test account with believable data: a few pending requests with reference images, an accepted booking with a paid deposit, one trip with a current leg, one flash day this month. Avoid real client names.
- Status bar hygiene: full battery, no notification icons (emulator demo mode: `adb shell settings put global sysui_demo_allowed 1`).

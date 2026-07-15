# Google Play Console setup — copy-paste walkthrough

Everything needed to create the Inklee app in the Play Console and clear the "Set up your app" dashboard, in the order the console asks for it. Prepared 2026-07-15 alongside the `app.inklee` package rename.

**Golden rule:** the package name binds permanently at the FIRST artifact upload. Upload only the versionCode 3 AAB (built 2026-07-15 with camera/location permissions stripped), never the vc2 one.

---

## 1. Create app (the first form)

| Field | Value |
| ----- | ----- |
| App name | `Inklee: Tattoo artist bookings` (30/30 chars — founder-picked 2026-07-15; "artist" in the title matches the owned keyword families and filters out client-intent installs) |
| Default language | English (United States) — en-US |
| App or game | App |
| Free or paid | Free |
| Declarations | Tick both (Developer Program Policies + US export laws) |

The app name can be changed later; the package cannot.

---

## 2. Set up your app (dashboard checklist)

Work top to bottom. Exact answers per panel:

### 2.1 Privacy policy

`https://inklee.app/privacy`

### 2.2 App access

All functionality requires an artist account, so choose **"All or some functionality is restricted"** and add one instruction set:

- Name: `Demo artist account`
- Username / email: *(create a dedicated demo artist account first — do NOT reuse a real account; seed it with sample data and no real client names)*
- Password: *(set in console only; never write it in this repo — the repo is public)*
- Any other information: `Log in with the email and password above. All features are available after login. Payments (deposits) are processed by Stripe and configured per artist; the demo account has manual deposits enabled so the flow is visible without a card.`

### 2.3 Ads

**No**, the app does not contain ads.

### 2.4 Content rating (IARC questionnaire)

- Contact email: `support@inklee.app`
- Category: **"All other app types"** (it is a business/productivity tool)
- Violence: No · Sexuality: No · Strong language: No · Controlled substances: No · Gambling themes: No
- Does the app allow users to interact or exchange content with each other? **No** (single-account business tool; clients interact through the web, never in-app)
- Does the app share the user's current location with other users? **No**
- Does the app allow users to purchase digital goods? **No** (deposits are payments for real-world services, processed by Stripe outside the app)

Expected result: rated for everyone (PEGI 3 / ESRB E). Note: keep screenshot sample art tame; the rating covers the app as submitted.

### 2.5 Target audience and content

- Target age group: **18 and over** only
- Does the app appeal to children? **No**

### 2.6 News apps

**No**, it is not a news app.

### 2.7 Data safety

Opening questions:

1. Does your app collect or share any of the required user data types? **Yes**
2. Is all of the user data collected by your app encrypted in transit? **Yes** (HTTPS everywhere)
3. Do you provide a way for users to request that their data is deleted? **Yes** — account deletion is available in-app (Settings → Account) and on the web at `https://inklee.app/settings/account` (login required; use this URL where the form asks for a deletion link)

Data types — declare exactly these, nothing else:

| Data type | Collected? | Shared? | Optional or required | Purposes |
| --------- | ---------- | ------- | -------------------- | -------- |
| Personal info → Email address | Yes | No | Required | Account management, App functionality |
| Personal info → Name | Yes | No | Required | App functionality, Account management |
| Personal info → User IDs | Yes | No | Required | Account management, App functionality |
| Photos and videos → Photos | Yes | No | Optional | App functionality (portfolio, flash and reference uploads) |
| Messages → Other in-app messages | Yes | No | Optional | App functionality (support tickets) |
| Device or other IDs | Yes | No | Optional | App functionality (push notification token) |

Everything else (location, financial info, contacts, calendar, browsing history, audio, health, app activity, crash logs): **Not collected.**

Grounding, in case a reviewer asks:

- Location and camera permissions were stripped from the manifest in versionCode 3 (`blockedPermissions` in `app.json`); the app never reads device location or captures with the camera (image uploads use the photo library).
- Payments are processed by Stripe on the client's web checkout; the app only displays payment status, so no financial info is collected by the app.
- No ads SDK, no analytics SDK, no crash-reporting SDK in the app.
- Data is processed by service providers (Supabase hosting, Stripe payments, Resend email); under Play's definitions this is not "sharing".
- Data is EU-hosted; privacy policy at inklee.app/privacy covers GDPR rights including export and deletion.

### 2.8 Government apps

**No.**

### 2.9 Financial features

**"My app doesn't provide any financial features."** (Deposits are real-world service payments processed by Stripe on the web; the app offers no loans, banking, or trading.)

### 2.10 Health apps

**No health features.**

---

## 3. Store settings

- App category: **Business**
- Tags (optional): skip or pick Booking-adjacent tags if offered
- Contact details: email `support@inklee.app` (shown publicly), website `https://inklee.app`, phone: leave empty

### EU DSA trader declaration

Declare **trader** status (the account is the Inklee OÜ organization account; required for EU visibility). Confirm the business address and contact details the org account was verified with; they appear on the listing.

---

## 4. Main store listing

Copy lives in `docs/mobile-store-assets.md` §F — lift verbatim. Quick reference:

- **App name:** `Inklee: Tattoo artist bookings`
- **Short description (77/80):** `The booking app for tattoo artists. Requests, deposits, clients. No DM chaos.`
- **Full description:** the 2,034-char block in §F (starts "Tattoo bookings live in Instagram DMs…")

Assets:

| Asset | File |
| ----- | ---- |
| App icon 512×512 | `apps/mobile/assets/store/play-icon.png` |
| Feature graphic 1024×500 | `apps/mobile/assets/store/feature-graphic.png` |
| Phone screenshots (2–8) | The Highlight mockup **PNG exports** (colored-background variants). Never rasterize the SVGs — their centre-anchored text has broken x-offsets. |
| Promo video | Skip |

---

## 5. First release (Internal testing)

1. Testing → **Internal testing** → Create new release.
2. When asked about app signing, accept **Play App Signing** (default "Let Google manage your app signing key"). The EAS-generated keystore becomes the upload key.
3. Upload `inklee-app.inklee-vc3.aab` (versionCode 3 — the permission-stripped build).
4. Release name: `0.1.0 (3)`.
5. Release notes: `First internal release. Requests, deposits, calendar, clients, flash and guest spots for tattoo artists.`
6. Testers tab: create an email list with your own + tester Gmail addresses, save, copy the opt-in link.
7. Roll out. Testers open the opt-in link, then install from Play. Existing sideload testers must uninstall the old `ee.inkl.app` APK first.

After internal testing is verified: wire `eas submit -p android` with a Google Cloud service-account JSON (Play Console → Setup → API access) and fill `eas.json` → `submit.production`. First upload must stay manual either way.

---

## 6. Founder to-dos surfaced by this checklist

- [ ] Create the demo artist account with believable seeded data (per `docs/mobile-store-assets.md` §G: pending requests with references, an accepted booking with a paid deposit, a trip, a flash day) and enter its credentials under App access.
- [x] App name signed off 2026-07-15: `Inklee: Tattoo artist bookings`.
- [ ] Export the Highlight mockup PNGs for the screenshot slots (2 minimum).
- [ ] Keep the old `ee.inkl.app` Firebase Android app until every sideload tester has migrated (deleting it kills their push).

# App store submission runbook — 0.3.0 (2026-08-04)

The remaining path to Apple + Google review, in order. Grounded in the current
project wiring (`eas.json`, `app.json`, the two setup docs). Legend: **[me]** =
Claude can run it headless; **[you]** = founder console/device action.

**Already done:** phone screenshots · Play Console listing + dashboard checklist
(privacy, app access, content rating, data safety, store settings, listing copy)
· iOS through TestFlight 0.2.0(3) + Sign in with Apple verified. Prod DB at 0156,
code audits clean (IAP + parity), version is 0.3.0.

---

## Step 1 — Cut the fresh 0.3.0 production builds (both platforms) [me or you]

Everything downstream needs these. `eas.json` production profile uses remote
versions with `autoIncrement`, so build numbers manage themselves; it points at
prod (`inklee.app`). Run from `apps/mobile` with `EXPO_TOKEN` set:

```
# Android AAB (permission-stripped via blockedPermissions in app.json)
npx eas-cli build -p android --profile production --no-wait

# iOS IPA (credentials already exist from the first iOS build; headless now)
npx eas-cli build -p ios --profile production --no-wait
```

- iOS is **headless** now — the interactive Apple-login step was done on the
  first build (2026-07-16); credentials live on EAS.
- If iOS prompts to install `expo-updates` (because the profile sets a
  `channel`), answer **No** — OTA is deliberately unused.
- Watch: `npx eas-cli build:list --limit 4`. Each build prints an artifact URL
  (AAB / IPA). ~15–30 min each, in parallel in the cloud.
- **Verify before submitting:** install the Android AAB/APK on a real phone and
  the iOS build via TestFlight, and smoke-test the new surfaces (goods, gallery,
  projects, payments, custom-made switch). This is the one step no audit can
  replace — see Step 5.

---

## Step 2 — Android: upload + submit for review [you]

Play listing is done, so this is just the binary. **First-ever artifact upload
binds `app.inklee` permanently** — upload only the 0.3.0 production AAB.

1. Play Console → **Testing → Internal testing** (safest first) → **Create new
   release**. (Or go straight to **Production** if you want public review now.)
2. App signing prompt → accept **Play App Signing** ("Let Google manage your
   signing key"). The EAS keystore becomes the upload key.
3. **Upload the 0.3.0 AAB** from Step 1.
4. Release name: `0.3.0 (<versionCode>)`. Release notes: short, e.g. *"Goods
   shop, collections, guest spots, gallery, large projects and payment requests
   for tattoo artists."*
5. **Save → Review release → Roll out.** Internal testing is instant; for public
   launch, promote to Production → **Send for review** (Google review is
   typically hours–2 days).
6. Testers tab (if internal): add your + tester Gmail addresses, copy the opt-in
   link. Old `ee.inkl.app` sideload testers must uninstall the old APK first —
   and **keep that old Firebase app alive** until they migrate (deleting it kills
   their push).

*(Optional automation for later: add a Google Cloud service-account JSON under
Play Console → Setup → API access, fill `eas.json` → `submit.production.android`,
then `eas submit -p android`. The FIRST upload stays manual regardless.)*

---

## Step 3 — iOS: finish the App Store listing + submit for review

### 3a. Get the 0.3.0 build to App Store Connect [me]
`submit.production.ios` is fully wired (`ascAppId 6791675160`, team `2T58XNW367`,
`asc-api-key.p8` on disk). Once Step 1's iOS build finishes:

```
npx eas-cli submit -p ios --latest
```

ASC processes it (~5–15 min) → appears under the app's TestFlight + becomes
selectable for the App Store version. No export-compliance prompt
(`ITSAppUsesNonExemptEncryption:false` is set). Note: the local CLI may sit on
"Waiting for submission to complete" and get killed by a timeout **after** it
already succeeded server-side — check the ASC Submissions view before calling it
a failure.

### 3b. Complete the App Store listing — Phase 6, not yet started [you]
In App Store Connect → your app → the **1.0 / 0.3.0** App Store version:

- **Screenshots**: upload the iPhone shots at Apple's **exact** sizes
  (1290×2796 or 1320×2868). If yours are Play-sized, re-export/resize first
  (`npx sharp-cli resize 1290 2796 --fit cover -i in.png -o out.png`).
- **Listing copy** (verbatim from `docs/mobile-store-assets.md §F`):
  - Name: `Inklee: Tattoo artist bookings`
  - Subtitle: `Bookings for tattoo artists`
  - Promotional text + Keywords + Description: the §F blocks (char-verified).
- **URLs**: Support `https://inklee.app/help` · Marketing `https://inklee.app` ·
  Privacy `https://inklee.app/privacy`. Copyright: `Inklee OÜ`.
- **App Privacy labels** (App Store → App Privacy): map the six Play data types
  (email, name, user IDs, photos, in-app messages/support, device push token).
  Apple taxonomy differs: account-bound data (email/name/user ID) is **"Data
  Linked to You"**, and **nothing** is "Data Used to Track You" (no ads/tracking
  SDK). Purposes: App Functionality / Account Management.
- **Age rating**: answer honestly → 17+/18+ is fine; no ads, no public UGC feed,
  no mature content in the app itself.
- **Review information → Sign-in required: Yes** → enter the **demo artist
  account** credentials (reuse the Play App-access account verbatim) + notes:
  *"Log in with the email/password above. All features unlock after login.
  Deposits are processed by Stripe per artist; the demo account uses manual
  deposits so the flow is visible without a card."*
- **Submit for Review.** (Apple review is typically 1–3 days.)

---

## Step 4 — EU DSA trader status (both stores) [you — verify]

Required for EU distribution; publishes the Inklee OÜ contact details.

- **Apple:** ASC → **Business** → EU trader verification. *Likely already
  cleared* — a fresh org account blocks ALL portal writes on two pending
  attestations (Developer Program License Agreement + DSA trader), and iOS
  builds/TestFlight already succeeded, which means both were cleared. Just
  confirm it still shows verified.
- **Google Play:** Store settings → trader declaration (Inklee OÜ). If the
  "Play Console done" pass already covered this, confirm it's set.

---

## Step 5 — Before public release: real-iPhone sweep [you — strongly recommended]

Not a hard submit gate, but the **largest untested surface**: the app has only
run on iPad in TestFlight compatibility mode (iPhone-sized window, no notch/safe
-area validation). Do one pass on a real iPhone from the TestFlight 0.3.0 build:
launch, dashboard, a request detail, the deposit form, calendar, flash, the goods
shop, the plan screen, Sign in with Apple + Google. Watch for safe-area/notch
clipping and any crash on the new surfaces.

---

## Quick status ledger

| Item | State |
|---|---|
| Phone screenshots | ✅ done |
| Play Console listing + checklist | ✅ done |
| Demo/review account (seeded) | ⚠️ confirm it has believable data (§G) + is entered in Play App access; reuse for Apple |
| 0.3.0 Android build | ⬜ Step 1 |
| 0.3.0 iOS build | ⬜ Step 1 |
| Android AAB upload + review | ⬜ Step 2 |
| iOS → ASC (`eas submit`) | ⬜ Step 3a |
| App Store listing (Phase 6) + submit | ⬜ Step 3b |
| DSA trader (Apple + Play) | ⬜ Step 4 (likely done, verify) |
| Real-iPhone sweep | ⬜ Step 5 (recommended pre-release) |

**Critical path to "in review":** Step 1 (builds) → Step 2 (Android upload) +
Step 3 (iOS submit + listing). Steps 4–5 in parallel.

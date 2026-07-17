# App Store / iOS setup walkthrough (ME-2 + ME-7 Apple half, E12 iOS side)

Written 2026-07-16, the day the Apple Developer Program enrollment was **accepted** (it had been stuck on Apple enrollment/support since June). This is the iOS counterpart to `docs/play-console-setup.md` and the SoT for the remaining iOS steps. Work through the phases in order; record decisions and gotchas inline as we go (the Play doc pattern).

State when this doc was written:

- `app.json`: `ios.bundleIdentifier = app.inklee`, `usesAppleSignIn: true`, `supportsTablet: false`, `expo-apple-authentication` plugin present, `ITSAppUsesNonExemptEncryption: false` set (app uses only standard HTTPS/TLS, so it is exempt from the per-upload export-compliance questionnaire).
- `eas.json`: production profile ready (remote versions + `autoIncrement`, prod env pointing at `https://inklee.app`). `submit.production` is empty — filled in Phase 2/4.
- No Apple credentials exist anywhere yet (EAS, vault, or repo). The Android keystore family is separate and unaffected.
- App version 0.2.0; build must come from master ≥ `af53d8b` (the app-config capability plane).
- UI language note: developer.apple.com is English-only; App Store Connect localizes (may show German, like the Play Console did — record any label surprises here).

---

## Phase 0 — Verify the membership (founder, ~5 min)

✅ DONE 2026-07-16 (membership screenshot verified):

- Entity name: **Inklee OU** — the **Organization** enrollment went through (D-U-N-S path), so the App Store seller name is the company. Address on file: Tartu mnt 67/1-13b, Tallinn, Harjumaa 10115, Estonia; phone 372-53870029.
- **Team ID: `2T58XNW367`** (needed for the Supabase Apple-provider secret in Phase 5)
- Account Holder: Michel Kräft (role: Account Holder)
- Renewal: **June 6, 2027**, US$99/yr (so the membership was activated ~June 6, 2026 — the acceptance confirmation just arrived late)
- Still to confirm: https://appstoreconnect.apple.com opens with the same Apple ID (org enrollments sometimes take a few hours to propagate to ASC).

## Phase 1 — First iOS build (founder terminal, interactive; ~10 min of prompts + ~30 min cloud build)

✅ DONE 2026-07-16: build `5e40fac7-f180-4292-be9d-6c46a11c35ee` FINISHED (the first iOS build of Inklee, succeeded first try; version 0.2.0, buildNumber 1). Distribution cert + provisioning profile + APNs push key all created on EAS during the run; bundle ID `app.inklee` registered. .ipa: https://expo.dev/artifacts/eas/gVnuJz59oBDx5qEhEuBhvgliYqcknMnUFogMf6yVBlY.ipa — goes to TestFlight via Phase 4, never sideloaded.

The one step that cannot run headless: EAS needs an interactive Apple login once to create the iOS credentials. After Phase 2, everything runs non-interactively.

1. Open a terminal at `A:\WORK\inklee\apps\mobile` (working tree on master ≥ `af53d8b`; uncommitted changes are fine — EAS packs the working dir).
2. Run:

   ```
   npx eas-cli build -p ios --profile production
   ```

   Do NOT pass `--non-interactive`. `EXPO_TOKEN` in the env handles the Expo side; the Apple prompts are separate.
3. Expected prompts (wording varies by eas-cli version — default answers are correct throughout):
   - **Log in to your Apple account?** → yes → Apple ID + password + 2FA code.
   - Bundle identifier **`app.inklee`** registration on the developer portal → automatic (confirm if asked).
   - **Generate a new Apple Distribution Certificate?** → yes (lives on EAS servers, same model as the Android cloud keystore).
   - **Generate a new Apple Provisioning Profile?** → yes.
   - **Set up Push Notifications (APNs key)?** → **YES** — required for expo-notifications on iOS; EAS generates and stores the key. (Apple allows max 2 APNs keys per team; we have 0.)
   - iOS buildNumber initialization (remote version source) → accept the default.
4. The build queues in the cloud; the terminal prints a dashboard URL. Status check from any session: `npx eas-cli build:view <id>` (Application Archive URL = the .ipa). Log-reading trick (brotli NDJSON) is in memory `eas-build-state`.
5. Expected side effects to verify afterwards: `app.inklee` appears under developer.apple.com → Identifiers, with the **Sign In with Apple** capability enabled (EAS syncs it from `usesAppleSignIn` — if it did not, enable it manually; needed for Phase 5).

Why production and not preview: iOS internal distribution (preview profile) needs every test device's UDID registered in an ad-hoc provisioning profile. TestFlight has no such requirement, so on iOS we go straight production → TestFlight even for beta testing.

## Phase 2 — App Store Connect API key (founder creates, Claude wires; unlocks headless builds + submit)

✅ DONE 2026-07-16: Team key `inklee-eas` (role App Manager) created; .p8 stored in the Control Tower vault as **`asc-api-key-inklee`** (byte-verified round-trip; the vault copy is the recovery path — Apple never re-offers the download). Key ID + Issuer ID live in the vault registry entry's note. Submissions use the env-var route: `EXPO_ASC_API_KEY_PATH` (materialized from the vault) + `EXPO_ASC_KEY_ID` + `EXPO_ASC_ISSUER_ID`.

1. App Store Connect → **Users and Access** → **Integrations** tab → **App Store Connect API** → Team Keys → **+**.
2. Name: `inklee-eas`. Role: **App Manager** (sufficient for builds, submissions, and TestFlight; Admin also works).
3. **Download the .p8 file — Apple offers the download exactly once.** Record the **Key ID** and the **Issuer ID** (shown at the top of the Team Keys page).
4. Hand the .p8 + Key ID + Issuer ID to Claude →
   - vault: `ct set asc-api-key-inklee` (plus issuer/key IDs in the entry notes),
   - EAS: attach as the submission key via `npx eas-cli credentials` (iOS → App Store Connect API Key), and fill `eas.json` `submit.production.ios` (`ascApiKeyPath`/`ascApiKeyId`/`ascApiKeyIssuerId` or EAS-stored key + `ascAppId` after Phase 3).

## Phase 3 — Create the app record in App Store Connect (founder, ~10 min)

App Store Connect → **My Apps** → **+** → **New App**:

- Platform: **iOS**
- Name: **Inklee: Tattoo artist bookings** (30/30 chars — same name as Play; Apple's limit is also 30)
- Primary language: **English (U.S.)** (matches the Play listing; German can be added as a localization later)
- Bundle ID: select **app.inklee** from the dropdown (exists after Phase 1; if it is missing, register it manually under developer.apple.com → Identifiers → App IDs first)
- SKU: `inklee-app` (internal identifier, never shown publicly)
- User access: Full access

## Phase 4 — TestFlight internal testing

◑ Steps 1–2 DONE 2026-07-17: submission `e1913b4e-3746-4e32-b27c-602bf07a33b1` ran headless via `eas submit -p ios --latest --non-interactive`; Apple processed the binary to **VALID** the same hour. TestFlight build = **0.2.0 (2)** at https://appstoreconnect.apple.com/apps/6791675160/testflight/ios . Remaining: internal group + tester, iPad install, on-device sweep.

Prerequisite: a physical iOS device (no iOS simulator exists on Windows). The founder's **iPad** works — see the gotcha log (iPhone-only apps install in compatibility mode).

1. Submit the Phase 1 build: `npx eas-cli submit -p ios --latest` (uses the Phase 2 API key; add `ascAppId` from Phase 3 to `eas.json` so it runs fully non-interactively).
2. ASC processes the binary (~5–15 min), then it appears under the app's **TestFlight** tab. No export-compliance question should appear (`ITSAppUsesNonExemptEncryption` is set).
3. Create an **Internal Testing** group. Internal testers must first exist as team members under **Users and Access** (role Developer or App Manager is fine) — up to 100, **no Beta App Review needed**, builds appear instantly.
4. On the iPhone: install **TestFlight** from the App Store, accept the email invite, install Inklee.
5. Run the on-device sweep (same launch-gate list as Android) + the ME-7 sign-in passes (Phase 5).

External testing groups (later, for beta artists with iPhones) DO require a one-time Beta App Review: needs the demo artist account + review notes — same material as the Play App-access section.

## Phase 5 — Sign in with Apple (ME-7 Apple half)

✅ NATIVE FLOW WORKS — verified on-device 2026-07-17 (founder, TestFlight 0.2.0(2) on the iPad). What it took: NOTHING on the Apple portal beyond what Phase 1 auto-created — the failure ("Provider (issuer https://appleid.apple.com) is not enabled") was purely the disabled Supabase provider. Fixed headless via the Supabase **Management API** with the vaulted PAT: `PATCH https://api.supabase.com/v1/projects/llmzzsmppaqwecbrowlp/config/auth` body `{"external_apple_enabled":true,"external_apple_client_id":"app.inklee"}` (native `signInWithIdToken` validates the token audience against the bundle ID; no Services ID or secret needed for native-only). The web login has NO Apple button, so steps 2–4 below (Services ID + key + secret JWT, expiring ≤6 months) are needed ONLY if/when web Apple login is added — do not create them before then. Still open from the list below: the optional nonce hardening (step 7).

Context: the app code already ships the full native flow (`expo-apple-authentication` → `signInWithIdToken`); only Apple-side + Supabase-side config was missing. Guideline 4.8 makes this **mandatory for App Store review** because the app offers Google login. The web login can gain an Apple button from the same config later.

1. **Capability**: developer.apple.com → Identifiers → `app.inklee` → confirm **Sign In with Apple** is enabled (Phase 1 should have done it via EAS capability sync).
2. **Services ID** (used by the web/OAuth flow, and required by Supabase's provider config): Identifiers → **+** → Services IDs → identifier `app.inklee.web`, description "Inklee web sign-in". Enable Sign In with Apple → Configure:
   - Primary App ID: `app.inklee`
   - Domains: `llmzzsmppaqwecbrowlp.supabase.co`
   - Return URL: `https://llmzzsmppaqwecbrowlp.supabase.co/auth/v1/callback`
3. **Key**: Keys → **+** → check "Sign in with Apple" → configure with primary App ID `app.inklee`. **Download the .p8 (one-time download)**, record the Key ID. → vault: `ct set apple-signin-key-inklee`.
4. **Supabase dashboard** → Authentication → Providers → **Apple** → enable:
   - Client IDs: `app.inklee,app.inklee.web` (the native flow's identity token carries the **bundle ID** as audience; the web flow uses the Services ID — Supabase accepts a comma-separated list)
   - Secret Key: a client-secret **JWT generated from** Team ID + Key ID + the .p8 (Claude generates it from the vault). ⚠️ Apple caps this JWT's lifetime at **6 months** — record the expiry date here and set a renewal reminder: expires ________.
5. Verify redirect allowlist still contains `inklee://auth-callback` (done 2026-07-07) — the native Apple flow itself doesn't redirect (it's `signInWithIdToken`), but the web flow does.
6. On-device pass on the TestFlight build: Apple sign-in does NOT work in Expo Go, only in real builds. Also run the Google pass on iOS while at it (ME-7 wants both, on both platforms).
7. Optional hardening after it works: add a nonce to the native Apple flow (Supabase-recommended replay protection; noted in roadmap ME-7).

## Phase 6 — Toward the App Store listing (later; not needed for internal TestFlight)

- **App Privacy labels**: map from the Play data-safety table in `docs/play-console-setup.md` §2.7 — same six data types (email, name, user IDs, photos, in-app messages/support, device push token), purpose App Functionality / Account Management, nothing shared, no tracking. ⚠️ Apple's taxonomy differs from Play's: account-bound data (email/name/user ID) must be declared **"Data Linked to You"** (it is tied to an account) — but NOT "Data Used to Track You" (no cross-app tracking, no ads SDK).
- **Age rating questionnaire**: answer honestly (no ads, no UGC feed visible to others without moderation questions — the booking form uploads go only to the artist; no mature content in the app itself).
- **Screenshots**: Apple requires exact pixel sizes (6.9" class, e.g. 1320×2868, plus optional smaller classes) — the Highlight mockup PNGs need re-exports at Apple dimensions. Same never-rasterize-the-SVGs rule as Play.
- **Demo account + review notes**: reuse the Play App-access demo artist verbatim.
- **Copyright**: Inklee OÜ. Support URL: `https://inklee.app/help`. Marketing URL: `https://inklee.app`.
- Listing copy: reuse `docs/mobile-store-assets.md` §F (already char-verified for Apple's limits: subtitle ≤30, promotional text ≤170, description ≤4000).
- Trader status / DSA: Apple also requires EU trader verification for EU distribution (Business section in ASC) — same Inklee OÜ details as Play.

## Gotchas / decisions record (append as they happen)

- 2026-07-16: doc created; `ITSAppUsesNonExemptEncryption: false` added to `app.json` the same day.
- 2026-07-16: the first `eas build -p ios` prompts to install `expo-updates` (because the profiles set a `channel`). Answer **No** — OTA is deliberately not used (the capability plane exists because of that); the channel key is inert without expo-updates.
- 2026-07-16: first bundle-ID registration FAILED with "App Store Connect has agreement updates that must be resolved" — a fresh org account has two pending attestations that block ALL developer-portal writes: (1) the Apple Developer Program License Agreement (Account Holder accepts via the banner on developer.apple.com/account), (2) the EU DSA trader-status declaration (App Store Connect → Business; same trader attestation as Play, publishes the Inklee OU contact details on the EU App Store). Clear both, rerun the build; the EAS Apple session is cached so login is skipped.
- Note: iOS `buildNumber` was initialized at **1** (remote version source); Android `versionCode` continues separately (vc3 was the Play upload).
- 2026-07-17: app-record creation is genuinely UI-only — `POST /v1/apps` returns 403 "The resource 'apps' does not allow 'CREATE'. Allowed operations are: GET_COLLECTION, GET_INSTANCE, UPDATE". Everything else (querying apps, wiring submit, TestFlight ops) works headless with the `asc-api-key-inklee` key (verified live).
- 2026-07-17: `eas submit` does NOT read the fastlane-style `EXPO_ASC_API_KEY_PATH`/`EXPO_ASC_KEY_ID`/`EXPO_ASC_ISSUER_ID` env vars — non-interactive submit fails with "App Store Connect API Keys cannot be set up in --non-interactive mode". The working headless setup: `eas.json` `submit.production.ios` = `ascAppId` + `appleTeamId` + `ascApiKeyPath: "./asc-api-key.p8"` + `ascApiKeyId` + `ascApiKeyIssuerId`, with the .p8 as a **gitignored** file at `apps/mobile/asc-api-key.p8` (restore from vault `asc-api-key-inklee` on a fresh clone — the google-services.json pattern).
- 2026-07-17: the local `eas submit` CLI sits in "Waiting for submission to complete" and may get killed by a shell timeout AFTER the submission already succeeded server-side — read the log/submissions dashboard before calling it a failure; the scheduled submission completes on EAS regardless of the local process.
- 2026-07-17: iOS buildNumber quirk: EAS printed "Initialized buildNumber with 1" but the produced build (and the TestFlight entry) is build **2** — remote autoIncrement bumps at build time. Version string shown in TestFlight: 0.2.0 (2).
- 2026-07-17: first TestFlight feedback: all app functionality works; two flaws. (1) Apple login → the disabled Supabase provider (see Phase 5, fixed server-side, no rebuild). (2) **iOS icon too small**: `assets/icon.png` keeps an Android-safe margin (web ≈ 66% of the tile) that iOS shows as-is. Fix = iOS-only icon `assets/ios-icon.png` (web at **76%**, founder pick "B" of A=72/B=76) generated from the vector source by `.scratch/gen-ios-icon.cjs` (bone web on charcoal, rendered from `apps/web/src/app/icon.svg` with the plate rect stripped), wired via `app.json` `ios.icon`. Android adaptive icon untouched. Shipped in build `8632dd19` (0.2.0(3)).
- 2026-07-17: test device = the founder's **iPad**. Works: TestFlight installs iPhone-only apps on iPad in compatibility mode (iPhone-sized window); push + Apple sign-in + the on-device sweep are all testable there. NOT a faithful iPhone rendering test (no notch/safe-area) — do one real-iPhone pass before the public App Store release.

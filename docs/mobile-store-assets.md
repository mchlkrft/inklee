# Mobile branding + store assets (ME-1 checklist)

**Status 2026-06-12:** none of these exist yet (`apps/mobile` has no `assets/` directory). The first EAS build ships Expo's placeholder icon and would be rejected at store submission. Master mark to export from: `apps/web/src/app/icon.svg` (vector spiderweb) + `apps/web/src/app/apple-icon.png` — use these so the mark stays identical between web and app.

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

| # | Asset | Spec |
| - | ----- | ---- |
| B1 | iPhone screenshots | 1320×2868 px (6.9") or 1290×2796 (6.7"), portrait, 3 to 10. Suggested set: dashboard, request detail with attachments, calendar, flash, profile/share. |
| B2 | iPad screenshots | 2064×2752 px (13"), at least one set — required while `supportsTablet: true` in app.json (alternative: flip it to false and skip these). |
| B3 | App name | Max 30 chars ("Inklee"). |
| B4 | Subtitle | Max 30 chars (e.g. "Bookings for tattoo artists"). |
| B5 | Description | Max 4000 chars. |
| B6 | Keywords | Max 100 chars total, comma-separated. |
| B7 | URLs | Support URL, marketing URL (inklee.app), privacy policy URL (inklee.app/privacy — live). |

The store icon is pulled from the binary (A1); no separate upload.

## C. Google Play listing

| # | Asset | Spec |
| - | ----- | ---- |
| C1 | Hi-res icon | 512×512 px PNG, 32-bit with alpha. |
| C2 | Feature graphic | 1024×500 px PNG/JPG, no transparency. |
| C3 | Phone screenshots | 2 to 8, between 16:9 and 9:16, 320 to 3840 px (the iPhone set re-exported works). |
| C4 | Tablet screenshots (7" + 10") | Only needed for the tablet listing badge; optional otherwise. |
| C5 | Short description | Max 80 chars. |
| C6 | Full description | Max 4000 chars. |
| C7 | Privacy policy URL | inklee.app/privacy (live). |
| C8 | Promo video (optional) | YouTube URL. |

## D. Account status (ME-2)

- D-U-N-S number for Inklee OÜ: **988010563** (received 2026-06-12).
- Google Play developer account: **ready**.
- Apple Developer Program enrollment: **in progress** (was waiting on the D-U-N-S).
- EAS project already bound: `@inklee/inklee`, projectId `daf44d5c-0134-4815-bc4b-c0524dfcb93f`.

## E. Wiring (engineering, once assets land in `apps/mobile/assets/`)

`app.json` additions: top-level `icon`, `android.adaptiveIcon` (foreground/background/monochrome), splash plugin `image`, notifications plugin `icon`. Then an EAS preview build to verify all four render (Expo Go ignores these keys, so they can land any time without affecting the founder's current testing).

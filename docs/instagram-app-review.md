# Instagram App Review — submission kit (`instagram_business_basic` Advanced Access)

**Status 2026-07-06:** Meta business verification for the inklee.app portfolio (Inklee OÜ) APPROVED (founder confirmation). This doc is everything needed to finish the chain: remaining dashboard steps, the app-settings values, and paste-ready App Review materials.

App: **Inklee** (Meta App ID `1545482990360870`), Instagram product App ID `1307437751330425` (the OAuth `client_id`). Scope requested: `instagram_business_basic` only.

---

## 1. Remaining founder dashboard steps (in order)

1. **Check the Business Account restriction.** Business Support Center → inklee.app portfolio → "Aktuelle Kontoprobleme". The earlier warning ("Remove the restrictions on your Business Account") may have cleared together with the verification. If it still shows: Request review (typically ID upload + 2FA).
2. **Zugriffsverifizierung (tech-provider access verification).** App dashboard → the app's Verification page. The button unlocks once (1) is clean. Meta quotes ~5 business days. Per Meta's docs this gate is INDEPENDENT of App Review (both must pass); it asks the business admin to categorize and describe how Inklee uses other businesses' data to provide a service for those businesses. (Source: developers.facebook.com/docs/development/release/access-verification/)

   Paste-ready answer for "How will your business use Platform Data to provide a product or service to your customers" (approved 2026-07-06):

   > Inklee (https://inklee.app) is a booking service for tattoo artists. Our customers are tattoo artists who use Inklee to run their own booking page, where their clients can request appointments and browse the artist's pre-drawn tattoo designs ("flash").
   >
   > Many artists already showcase their available designs on their own Instagram profile. With Instagram login, an artist can connect their own Instagram professional account to Inklee. We then read only that artist's own profile (username) and their own posts (image, caption, link to the post) and show these posts to the artist inside Inklee. The artist picks which of their posts to import, and each imported post becomes a design on their Inklee booking page that clients can book.
   >
   > Access is read-only and used only at the artist's request. We never post to Instagram, never read messages, and never access other people's accounts. The artist can disconnect at any time, which immediately deletes the stored access data. Platform data is never used for advertising and never sold or shared.
3. **Enter the app settings + Instagram product settings** from §2 below (can be done now, before (2) returns).
4. **Submit App Review** for `instagram_business_basic` Advanced Access (App Review → Berechtigungen und Funktionen) with the materials in §3–§5.
5. **Switch the app to Live mode** (sidebar currently "Unveröffentlicht") once review is approved. At the switch: disconnect + reconnect the existing tester Instagram accounts. Their rows predate migration 0061, so `app_scoped_user_id` is empty until reconnect, and a Meta deletion callback could miss them (it would log `no matching account`). Then run the removal test from the §2 note and confirm the Vercel function logs show `1 account(s) torn down`.
6. **Verify public connect** with a non-tester Instagram account, then (and only then) prune: delete the 3 empty shell apps (`2086521578964264`, `1041015492132851`, `1032861485872135`) and review the second portfolio "MCHLKRFT" (check its assets first). Move the Inklee app into the verified portfolio if it is still personal-owned.

---

## 2. App settings values

### App settings → Basic (Meta app 1545482990360870)

| Field | Value |
| --- | --- |
| Privacy Policy URL | `https://inklee.app/privacy` |
| Terms of Service URL | `https://inklee.app/terms` |
| User data deletion | The dropdown accepts either a callback or an instructions URL. Choose **Data deletion callback URL**: `https://inklee.app/api/instagram/data-deletion` (implemented; see §6). If an instructions URL is asked for instead, use `https://inklee.app/privacy` (§3.4 contains the human-readable instructions). |
| Category | Business and pages (or "Productivity"; pick the closest, this field is informational) |
| App icon (1024×1024) | Spiderweb logo export — generate via `.scratch/make-spiderweb-gif.cjs` at 1024 px, PNG |
| Business Email | founder email |

### Instagram product → API setup with Instagram login → 3. Set up Instagram business login → Business login settings

All three URL fields are expected before the dialog saves:

| Field | Value |
| --- | --- |
| OAuth Redirect URI | `https://inklee.app/api/instagram/callback` (already configured; do not change) |
| Deauthorize callback URL | `https://inklee.app/api/instagram/deauthorize` |
| Data deletion request URL | `https://inklee.app/api/instagram/data-deletion` |

Note: Meta's callbacks are signed with an app secret, but the docs never state whether Instagram-Login apps sign with the Instagram app secret (from this Business login settings dialog; this is our `INSTAGRAM_APP_SECRET`) or the parent Meta app secret (App settings → Basic). The endpoints verify against `INSTAGRAM_APP_SECRET` and, if ever configured in Vercel, `META_APP_SECRET` as fallback (a warning is logged when the fallback matches). After going Live, test by removing Inklee from the test Instagram account and checking the function logs; if only the Meta secret matches, add `META_APP_SECRET` to Vercel. Reminder: the Meta app secret leaked into a local transcript on 2026-07-03 and should be REGENERATED before it is ever put in Vercel.

Use `inklee.app` URLs everywhere, never `inkl.ee` (the apex 308-redirects and Meta will not follow it for POST callbacks).

---

## 3. Use case description (paste-ready)

> Inklee (https://inklee.app) is a booking platform for tattoo artists. An artist creates a public booking page and maintains a library of "flash designs" (pre-drawn tattoo designs) that clients can browse and book.
>
> How we use instagram_business_basic: a tattoo artist connects their own Instagram professional account to Inklee through Instagram login. We read the artist's basic profile (user id, username) to show which account is connected, and the artist's own recent media (image, caption, permalink, timestamp) so the artist can select posts and import them into their Inklee flash library. Importing copies the image and stores a link back to the original Instagram post. The artist can re-sync their recent posts on demand, and can disconnect at any time from within the app, which immediately deletes the stored access token and all synced Instagram data.
>
> We only read the authenticated artist's own profile and media, initiated by the artist. We do not publish content, send messages, or access any other account's data. Instagram data is never used for advertising and never shared with or sold to third parties. Data deletion is available in-app (disconnect), through account deletion, and through the data deletion callback registered with Meta.

## 4. Screencast script (record at 1080p, show the full browser window incl. the URL bar)

1. Open `https://inklee.app/login`, sign in with the provided test artist account.
2. Navigate to Flash → Instagram (`https://inklee.app/flash/instagram`).
3. Click "Connect Instagram". The Instagram OAuth screen appears; sign in with the provided Instagram test account and grant access. Show the permission screen clearly.
4. Back on inklee.app: the page shows the connected username and a grid of the account's recent posts.
5. Select 2–3 posts and click "Add to Flash" (the button shows the selected count). Show the created flash designs in the flash library.
6. Return to Flash → Instagram and click "Resync" to show on-demand refresh.
7. Click Disconnect (no confirmation step follows). Show the page back in its disconnected state (no posts, no account).
8. (Optional but strong) Show `https://inklee.app/privacy` scrolled to §3.4 "Instagram connection".

Keep it under ~3 minutes, no cuts during the OAuth step. Meta's screencast rules: the app UI must be in English, add captions or tool-tips where a step is not self-explanatory, and record the real product (generic or stock walkthrough videos are rejected).

## 5. Test credentials for reviewers

Fill these directly in the Meta review form. Do NOT store real passwords in the repo.

| Item | Value |
| --- | --- |
| Inklee test artist | create a dedicated artist account, e.g. `meta-review@inklee.app` (comped, onboarded, with the flash feature visible) |
| Instagram account | a dedicated Instagram professional (Creator or Business) test account with a few posted images; add it as an Instagram Tester on the app so the flow works while the app is still in development mode |
| Instructions field | "Log in at https://inklee.app/login with the credentials above, go to Flash → Instagram, click Connect Instagram and authorize with the Instagram test account. Recent posts appear; select posts and click Add to Flash to create flash designs. Disconnect from the same page deletes all Instagram data." |

## 6. What is implemented in code (for reference in the form)

- OAuth connect: `/api/instagram/callback` (HMAC state + session binding), long-lived token exchange, server-side token storage only. The token is never sent to the browser or the mobile app.
- Sync/import: read-only `GET /me` and `GET /me/media`, thumbnails cached in EU storage (Supabase), 50-post window.
- Disconnect (in-app, web + native): deletes the token row, synced posts, and cached thumbnails immediately. Imported designs keep an independent image copy.
- Deauthorize callback: `POST /api/instagram/deauthorize` verifies Meta's `signed_request` (HMAC-SHA256 over the encoded payload, constant-time) and runs the same full teardown.
- Data deletion callback: `POST /api/instagram/data-deletion` verifies the `signed_request`, runs the teardown, and responds with the required JSON (`url` + `confirmation_code`). Status page: `https://inklee.app/instagram/data-deletion`. Both callbacks are idempotent because Meta fires the deletion callback right after a deauthorization too.
- The callback lookup matches both the app-scoped user id (captured from the token exchange, migration 0061) and the professional-account IGID, so whichever id Meta sends resolves to the right artist.
- Token refresh cron keeps long-lived tokens fresh; tokens expire ~60 days if unused.

## 7. Common rejection traps (avoid)

- The screencast must show the ACTUAL permission usage (posts appearing in the app after OAuth), not just the login.
- The privacy policy URL must load without login and must mention Instagram data (done: §3.4).
- The data deletion URL must respond (Meta probes it). The callback returns the required JSON shape.
- The app must stay in the SAME portfolio that passed business verification; do not move or recreate apps mid-review.
- Reply to any reviewer question within the review window; silence auto-rejects.

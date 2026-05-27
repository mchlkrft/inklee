# Artist subdomains in local dev

The middleware from Slice 71b also handles `*.localhost` hosts, so you can develop and test the subdomain flow locally without editing `/etc/hosts` or running a custom DNS resolver. Every modern browser (Chrome, Firefox, Safari, Edge) routes `*.localhost` to `127.0.0.1` automatically.

## The basic dev loop

```powershell
pnpm dev
```

Then in a browser:

- `http://localhost:3000/` — marketing app, exactly as before
- `http://bert-grimm.localhost:3000/` — Bert Grimm's public booking page rendered through the subdomain rewrite
- `http://bert-grimm.localhost:3000/waitlist` — the waitlist sub-route
- `http://unknown-name.localhost:3000/` — the "Claim this name" subdomain not-found page

The middleware treats `bert-grimm.localhost:3000` as kind `local` with `slug: "bert-grimm"` and rewrites internally to `/bert-grimm`. The URL bar stays on the subdomain form.

## Switching the helper into subdomain mode locally

`publicArtistUrl()` in `src/lib/public-url.ts` reads `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN`. In `.env.local`, set:

```
NEXT_PUBLIC_PUBLIC_BIO_DOMAIN=localhost:3000
```

Then dashboard / settings / onboarding-done / canonical metadata will all emit URLs of the form `https://<slug>.localhost:3000` (the helper always emits `https://`, but the browser accepts `http://` for `*.localhost` regardless — clicking the rendered link still works in dev).

Leave it unset to keep path-mode URLs (`http://localhost:3000/<slug>`) locally — same default as Production until the founder flips the env in Vercel.

## Caveats

- The middleware doesn't do anything special for Vercel preview hosts (`*.vercel.app`). Subdomain rendering is not currently exercised on preview deploys — the preview origin isn't `*.inkl.ee`, so previews always serve path-mode URLs. Test subdomain flows locally or on Production.
- Reserved names on localhost work the same way as on `inkl.ee`: `app.localhost:3000` resolves to `local` with `slug: null`, which falls through to the auth-gate pass branch, which then routes normally (so `app.localhost:3000/dashboard` works for a logged-in user, useful for testing).
- Browser dev-tools "disable cache" is your friend when toggling the env var. Next.js's dev server picks up `.env.local` changes on restart, not on hot-reload — stop the dev server and `pnpm dev` again after editing it.

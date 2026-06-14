# Artist subdomain deployment runbook

How to take the Slice 71 code (already on master) from "ready in app" to "live on `*.inkl.ee`". The app-level work was finished in Slice 71a–71c; everything below is DNS + Vercel domain attachment + env flag flip. The actual end-to-end rollout was done 2026-05-27; this doc reflects what worked, not the original assumptions.

**The constraint that drives the whole design.** Wildcard SSL certificates can only be issued through Let's Encrypt's **DNS-01 ACME challenge** — HTTP-01 isn't allowed by Let's Encrypt for wildcards. DNS-01 means the cert issuer must set a `_acme-challenge.inkl.ee` TXT record at issuance and again at every ~60-day renewal. As long as a third-party DNS provider (Cloudflare in our case before Slice 71) owns the `inkl.ee` zone, Vercel can't do this automatically and the cert never gets issued. The sustainable answer is: **move the inkl.ee zone's nameservers to Vercel**. (inklee.app stays untouched on its own DNS — it doesn't need wildcard SSL.)

Read sections 0–8 in order. They are the rollout path.

---

## 0. Verify the Vercel plan supports wildcard subdomains

Before changing anything, confirm the Inklee Vercel project can take `*.inkl.ee` as a single domain entry. Vercel dashboard → Project settings → Domains → "Add domain". If the UI accepts a `*.inkl.ee` entry without a paywall, you're fine. Otherwise upgrade the project's plan first.

---

## 1. Pre-flight checklist

- [ ] Slice 71a–71c code is on master and deployed to Production (`pnpm test` green, `pnpm build` green, middleware shows `Proxy (Middleware)` in the build output).
- [ ] `vercel` CLI is authenticated to `mchlkrfts-projects`. Confirm with `vercel project ls`.
- [ ] You can edit Vercel env vars (Production scope minimum).
- [ ] You have admin access to the **domain registrar** (Zone.ee, in our setup), not just the Cloudflare account. Nameserver changes happen at the registrar, not at Cloudflare.
- [ ] At least one real artist slug exists in Production for smoke testing — `bert-grimm` is the conventional demo.

---

## 2. Attach `*.inkl.ee` and `www.inkl.ee` to the project

From inside the repo (so the CLI's linked-project shorthand applies):

```bash
vercel domains add "*.inkl.ee"
vercel domains add "www.inkl.ee"
```

These two commands pre-create the right Vercel DNS records (wildcard ALIAS, apex ALIAS, CAAs for Let's Encrypt / Sectigo / Google) so the moment NS migrates, every record resolves cleanly.

Verify:

```bash
vercel dns ls inkl.ee
```

Expected output includes the wildcard ALIAS and apex ALIAS pointing at a Vercel-managed `vercel-dns-*.com` target plus three CAA records.

The Vercel domains panel will show `*.inkl.ee` as "Invalid Configuration" at this stage — that's expected and doesn't block the next steps.

---

## 3. Migrate `inkl.ee` nameservers to Vercel — at the registrar

Log in to **Zone.ee** (or whichever registrar holds `inkl.ee`). Find the inkl.ee domain's nameserver settings and replace the current Cloudflare nameservers with:

```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

Save. The registrar pushes the change to the `.ee` TLD registry almost instantly.

Observed timings from the 2026-05-27 rollout, useful for setting expectations:

| Event                                            | Elapsed                                 |
| ------------------------------------------------ | --------------------------------------- |
| NS change saved at Zone.ee                       | T+0                                     |
| `.ee` TLD root reflects Vercel NS                | within seconds                          |
| Google 8.8.8.8 sees Vercel NS                    | within minutes                          |
| Cloudflare 1.1.1.1 still cached on Cloudflare NS | took ~45 minutes (its own resolver TTL) |
| Vercel control plane confirms NS ownership       | T+~45 min                               |
| Let's Encrypt wildcard cert issued and served    | T+49 min                                |

The slowest part is third-party resolver caches catching up. Vercel itself is fast once it can see the new NS.

---

## 4. Pre-stage the env var

Add the bio-domain env to Production. The activation only happens at the next deploy, so this is safe to do at any point before step 7:

```bash
printf "%s" "inkl.ee" | vercel env add NEXT_PUBLIC_PUBLIC_BIO_DOMAIN production
```

Why `printf "%s"` instead of `echo`: PowerShell's pipe and `echo` both add a trailing `\r\n` which Vercel stores as part of the value. The helper in `src/lib/public-url.ts` does `.trim()` so it survives, but cleaner to store a clean value. Verify byte-by-byte:

```bash
vercel env pull .env.tmp --environment production --yes
grep "NEXT_PUBLIC_PUBLIC_BIO_DOMAIN" .env.tmp | od -c | head -3
rm .env.tmp
```

Expected: the value reads exactly `inkl.ee` with no leading BOM (`\357\273\277`) and no trailing whitespace.

**Preview scope was skipped in our rollout** because the Claude-wrapped Vercel CLI on Windows refused the all-preview-branches form (`--value <v> --yes`) regardless of flag ordering. This doesn't matter operationally — preview deploys run on `*.vercel.app` hosts which don't intersect with subdomain routing. If you ever need the Preview scope, add via the Vercel dashboard manually.

---

## 5. Wait for SSL "Issued"

Probe the wildcard TLS handshake every 30s on a throwaway subdomain that doesn't correspond to any real artist slug:

```bash
while true; do
  if curl -sI --max-time 8 "https://probe.inkl.ee/" 2>&1 | grep -qE "^HTTP/"; then
    echo "SSL READY"
    break
  fi
  date +%H:%M:%S
  sleep 30
done
```

Empty curl output (with `schannel: failed to receive handshake` on Windows or `SSL_ERROR_*` on Linux) means cert hasn't issued yet. An HTTP response (any status code, even 404 for the claim page) means SSL is live.

Final verification — inspect the actual cert subject + issuer:

```bash
echo Q | openssl s_client -servername probe.inkl.ee -connect probe.inkl.ee:443 2>&1 \
  | grep -E "subject=|issuer="
```

Expected:

```
subject=CN=*.inkl.ee
issuer=C=US, O=Let's Encrypt, CN=R12
```

Once both lines appear, the cert is real and trusted.

---

## 6. Smoke test routing (before redeploy)

The middleware is already live on master and doesn't depend on the env var. These four cases should work the moment SSL is up:

| Test                                                   | Expected                                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://<existing-slug>.inkl.ee/`                     | 200, artist's public booking page renders                                                                                                                   |
| `https://<existing-slug>.inkl.ee/waitlist`             | 200, waitlist signup form                                                                                                                                   |
| `https://probe-nonexistent-slug.inkl.ee/`              | 404, "This name is still free, Claim {slug}" subdomain claim page (look for `x-host-routing: subdomain` request handling in `src/app/[slug]/not-found.tsx`) |
| `https://app.inkl.ee/`                                 | 308 → `https://inklee.app/`                                                                                                                                 |
| `https://ab.inkl.ee/` (slug too short, invalid format) | 308 → `https://inklee.app/`                                                                                                                                 |
| `https://inkl.ee/` (apex)                              | 308 → `https://inklee.app/` (Slice 54 vercel.json rule, unchanged)                                                                                          |

A failure here points to a middleware bug — the env var isn't involved yet. Most likely a `parseHost` regression or a missing reserved-slug entry.

---

## 7. Trigger the activation redeploy

This is the one-click flip. The redeploy uses the same git commit on master but builds with the new env var so all share-link / canonical / OG / dashboard surfaces switch to emitting `<slug>.inkl.ee` URLs.

```bash
PROD_URL=$(vercel ls 2>&1 | grep "https://" | grep "Production" | head -1 | grep -oE "https://[^ ]+vercel\.app")
echo "Redeploying: $PROD_URL"
vercel redeploy "$PROD_URL" --target production
```

Build + alias swap takes ~2 minutes. The CLI prints `Aliased: https://inkl.ee` (and `https://inklee.app`) when the new build is live.

---

## 8. Post-deploy verification

Quickest visual check — canonical metadata should now point at the subdomain form:

```bash
curl -s --max-time 8 "https://inklee.app/<your-slug>" | grep -oE '<link rel="canonical"[^>]*>'
```

Expected: `<link rel="canonical" href="https://<your-slug>.inkl.ee"/>`

The same canonical appears whether you fetch the path form (`inklee.app/<slug>`) or the subdomain form (`<slug>.inkl.ee/`) — that's the point. Search engines consolidate ranking signals on the subdomain.

Then walk the 33-row matrix in `docs/subdomain-qa-checklist.md` for the dashboard / settings / email surfaces that require a logged-in browser to inspect.

---

## 9. Rollback

Single knob: unset the env var, redeploy. Path-mode URLs return everywhere; the wildcard SSL and middleware routing stay live and harmless.

```bash
vercel env rm NEXT_PUBLIC_PUBLIC_BIO_DOMAIN production --yes
PROD_URL=$(vercel ls 2>&1 | grep "https://" | grep "Production" | head -1 | grep -oE "https://[^ ]+vercel\.app")
vercel redeploy "$PROD_URL" --target production
```

For a deeper rollback (also kill the middleware path): revert the Slice 71b commit. Slices 71a + 71c are passive when the env var is unset; they can stay shipped indefinitely.

---

## Failure modes seen in practice

### 9.1 The Cloudflare-A-record dead end (what we tried first)

Our first attempt followed Vercel CLI's "recommended" output from `vercel domains add "*.inkl.ee"`:

> Set the following record on your DNS provider to continue: `A *.inkl.ee 76.76.21.21` [recommended]

We added that A record in Cloudflare with DNS-only proxy (grey cloud). Routing worked immediately — `test.inkl.ee` resolved and reached Vercel's anycast. **But SSL never issued.** After 30 minutes the Vercel dashboard still showed `*.inkl.ee` as "Invalid Configuration" with the only remediation being a nameserver change.

The reason: the A record satisfies routing only. Wildcard SSL needs DNS-01 challenge which needs ongoing TXT-record write access. Vercel's CLI message understates this — the A record alone is sufficient for `inkl.ee` apex (HTTP-01 challenge works for non-wildcard hosts) but **not for `*.inkl.ee` wildcards**. Vercel's dashboard hides the manual-TXT alternative because cert renewal every 60 days without DNS automation is a footgun.

The only sustainable path is NS migration. This runbook reflects that path; don't bother with the A record / grey-cloud variant.

### 9.2 SSL still pending after 30 minutes

Check NS from multiple resolvers — propagation isn't uniform:

```bash
nslookup -type=NS inkl.ee 1.1.1.1                # Cloudflare resolver
nslookup -type=NS inkl.ee 8.8.8.8                # Google resolver
nslookup -type=NS inkl.ee ns.tld.ee              # .ee TLD authoritative
```

If `.ee` TLD already shows Vercel NS but `1.1.1.1` is still on Cloudflare NS, that's just resolver TTL — wait. Vercel uses its own resolution path and usually completes cert issuance within ~5 minutes after detecting NS ownership, regardless of slow public resolvers.

If `.ee` TLD itself still shows the old NS, the registrar didn't push the change. Re-save at Zone.ee.

### 9.3 Subdomain renders apex 404 instead of "Claim this name" page

The middleware rewrote correctly, `/[slug]/page.tsx` called `notFound()`, but the root `not-found.tsx` fired instead of the `[slug]/not-found.tsx`. Confirm `src/app/[slug]/not-found.tsx` exists in the build output. Then check that the middleware set the `x-host-routing: subdomain` header on the rewritten request — that's the signal `not-found.tsx` reads to choose the subdomain rendering.

### 9.4 Customer magic-link email shows `<slug>.inkl.ee/request/...`

Should never happen. Customer portal links are intentionally `${NEXT_PUBLIC_APP_URL}/request/${token}` and were not migrated to `publicArtistUrl` in Slice 71c. If you find a subdomain in such an email, an email template was changed in error — grep for `publicArtistUrl` usage under `src/lib/email/` and revert anything that doesn't belong.

### 9.5 Need to back out the entire migration

You can return inkl.ee NS to Cloudflare at Zone.ee, which immediately reverts authoritative DNS. The Vercel wildcard cert will silently fail to renew (no DNS-01 path back), and after the current cert expires (~60-90 days) `*.inkl.ee` traffic loses TLS. Long before that point, manually unset `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN` and redeploy to switch all UI surfaces back to path-mode `inklee.app/<slug>` URLs.

---

## 10. Link Hub sub-subdomain `*.l.inkl.ee` ("Linklee") — ME-11

The Inklee Hub's pretty URL is `<slug>.l.inkl.ee` (e.g. `ouch370.l.inkl.ee`). This is a **second-level wildcard** on the `inkl.ee` zone, NOT covered by the existing `*.inkl.ee` cert (wildcards match one label only). It needs its own `*.l.inkl.ee` wildcard.

**Why this is easy now (vs §1–8):** the `inkl.ee` zone's nameservers already live on Vercel (done 2026-05-27), so Vercel can issue the `*.l.inkl.ee` wildcard cert automatically via DNS-01 — **no NS change, no registrar step, no new env var** (the code reuses `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN=inkl.ee` and builds `<slug>.l.inkl.ee` itself).

The app code is already shipped and dormant: `parseHost` rewrites `<slug>.l.inkl.ee` → `/<slug>/hub`; `publicHubUrl()` emits the pretty URL. Until the wildcard is attached, the Hub is fully reachable at the path form `inklee.app/<slug>/hub`.

### Founder steps

1. **(Optional) confirm the plan allows another wildcard.** Vercel dashboard → Project → Settings → Domains. You already have `*.inkl.ee`; a second wildcard `*.l.inkl.ee` is the same domain class.
2. **Attach the wildcard** (from inside the repo so the linked-project shorthand applies):
   ```bash
   vercel domains add "*.l.inkl.ee"
   ```
   Because Vercel owns the `inkl.ee` zone, this creates the `*.l.inkl.ee` DNS record and kicks off DNS-01 cert issuance automatically. No A record, no manual TXT.
3. **Wait for SSL "Issued"** (usually a few minutes since NS is already on Vercel). Probe a throwaway label that maps to no real slug:
   ```bash
   while true; do
     if curl -sI --max-time 8 "https://probe.l.inkl.ee/" 2>&1 | grep -qE "^HTTP/"; then
       echo "SSL READY"; break
     fi
     date +%H:%M:%S; sleep 30
   done
   ```
   Then verify the cert subject:
   ```bash
   echo Q | openssl s_client -servername probe.l.inkl.ee -connect probe.l.inkl.ee:443 2>&1 | grep -E "subject=|issuer="
   ```
   Expect `subject=CN=*.l.inkl.ee` issued by Let's Encrypt.
4. **Smoke test** (no redeploy needed — routing is already live in middleware):
   | Test | Expected |
   | --- | --- |
   | `https://<real-slug>.l.inkl.ee/` | 200, the artist's Link Hub renders |
   | `https://<real-slug>.l.inkl.ee/` link buttons | open the artist's links + "Book a tattoo" → their booking page |
   | `https://ab.l.inkl.ee/` (too short) | 308 → `https://inklee.app/` |
   | `https://admin.l.inkl.ee/` (reserved) | 308 → `https://inklee.app/` |

No env flip and no redeploy are required: `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN` is already `inkl.ee`, so `publicHubUrl()` is already emitting `<slug>.l.inkl.ee` — those links just 404 at the TLS layer until step 2 completes. **Production is currently frozen** (see roadmap deploy-freeze callout); do steps 2–4 only once prod deploys are unfrozen, or against a preview as applicable.

### Rollback

`vercel domains rm "*.l.inkl.ee"`. The Hub stays reachable at the path form `inklee.app/<slug>/hub`; only the pretty subdomain stops resolving.

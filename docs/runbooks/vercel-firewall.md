# Vercel firewall / WAF

Edge protection for the `inklee` Vercel project (team `mchlkrfts-projects`). This
config lives in **Vercel, not in git**, so this file is its in-repo record.

## Live custom rule

**`Block CMS/PHP exploit probes`** (`rule_block_cms_php_exploit_probes_8pYTqN`) —
action **deny**, enabled, published to production 2026-08-06.

Denies vulnerability-scanner probes for CMS/PHP scripts and sensitive dotfiles
this app does not serve, before any Function runs (Vercel does not bill for
WAF-blocked traffic). Two OR'd `path` regex conditions:

- `\.(php|phtml|php3|php5|php7|asp|aspx|jsp|cgi|pl)($|/)`
- `^/\.(env|git)($|/|\.)`

Verified live: 403 on `/index.php?option=com_sppagebuilder`, `/wp-login.php`,
`/.env`, `/.git/config`, `/xmlrpc.php`; 200 on `/` and `/pricing`; 404 (not 403)
on `/.well-known/apple-app-site-association` (correctly not matched).

Origin: a Joomla SP Page Builder scan tripped Next's Server Action resolver into
an unhandled 500 and a false high-priority alert. Audit finding **OBS-NOISE-001**
in `docs/audit/findings.yaml`.

## Code backstop (in git)

`apps/web/src/lib/edge-probe.ts` (`isBlockedProbePath`, unit-tested) is wired
into `apps/web/src/proxy.ts` as an early 404 and returns the same result for the
same paths. **Keep the two in sync**: if you change the blocked extensions or
dotfiles in `edge-probe.ts`, update this WAF rule too, and vice versa. The Sentry
side is filtered in `apps/web/src/lib/sentry-noise.ts`.

## Managing it (CLI)

Auth is non-interactive: `VERCEL_TOKEN` is a machine env var from the Control
Tower vault (`vercel-mchlkrft` entry; do NOT use `vercel-invest`, a different
client account). The repo is already linked (`.vercel/`, gitignored).

```bash
vercel firewall rules list                       # see live rules
vercel firewall rules inspect "Block CMS/PHP exploit probes" --expand
vercel firewall rules disable "Block CMS/PHP exploit probes"   # then publish
vercel firewall rules edit "Block CMS/PHP exploit probes" --action log --yes
vercel firewall publish --yes                    # rules changes stage as drafts; this makes them live
```

If the rule ever over-blocks a real path, soften to `--action log` (or `disable`)
and publish, then widen the exclusions.

## Plan notes (Hobby)

Custom rules and automatic DDoS mitigation work on Hobby. `vercel firewall
overview` errors ("IP Bypass is unavailable for this plan") but `vercel firewall
rules *` works. `--duration` (persistent actions), token-bucket rate limiting,
JA3, and header rate-limit keys are Pro/Enterprise only.

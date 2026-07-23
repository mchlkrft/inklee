# Capability registry

The single human-readable ledger for the app-config plane
(docs/architecture/remote-config-plan.md). **Must stay in lockstep with
`CAPABILITIES` in `packages/shared/src/app-config.ts`** — same rule as the
metric-definitions lockstep in the growth cockpit.

How a kill is flipped: set `DISABLED_CAPABILITIES` (comma-separated) in Vercel
Production and redeploy (~2-3 min to effect; the mobile config response is CDN
cached ≤60s on top). Unset = nothing disabled. The server cores enforce; the
mobile client (0.2.0+) additionally hides entry points via
`GET /api/mobile/config`.

Adding a new capability requires (same PR): a written operational scenario
(what incident flips it, who flips it, what users see), the coherent-fallback
proof, server-side enforcement, and a row here. "We might want to toggle it"
is an automatic rejection.

## Capabilities

| Field | `deposits` | `instagram_import` |
| --- | --- | --- |
| Owner | Founder (flip decision); Claude (wiring) | Founder (flip decision); Claude (wiring) |
| Purpose | Pause in-app CARD deposit collection platform-wide without touching Stripe keys (which would also break refunds + webhook) or account rows | Kill Instagram connect/sync/import during a Meta API incident or an import bug |
| Created | 2026-07-16 | 2026-07-16 |
| Default | Enabled (not listed) | Enabled (not listed) |
| Safe disabled behavior | `requestDepositCore` takes the manual-deposit branch (the same degradation un-entitled artists already get); mobile deposit form shows the manual copy; refunds/mark-received stay available | Server refuses sync/import (`capability_disabled`, 503) and web actions redirect with `error=unavailable`; OAuth callback completes but skips the media pull; disconnect stays available; mobile screen shows the unavailable card; imported designs untouched |
| Platforms | Web + Android (iOS when it ships) — enforcement is server-side, so ALL clients including pre-0.2.0 builds obey | Same |
| Min compatible version | Server enforcement: all versions. Client entry-point hiding: 0.2.0+ | Server: all. Client hiding: 0.2.0+ |
| Review date | 2026-10-16 (quarterly) | 2026-10-16 (quarterly) |
| Removal condition | Never while card deposits exist (permanent operational kill-switch); re-verify wiring at each review | If the Instagram integration is ever removed |
| Docs | docs/architecture/remote-config-plan.md §8; enforcement: `apps/web/src/lib/server/bookings.ts` (requestDepositCore), `apps/web/src/lib/server/app-config.ts` | remote-config-plan.md §8; enforcement: `/api/mobile/instagram/{sync,import}`, `apps/web/src/app/(artist)/flash/instagram/actions.ts`, IG OAuth callback |

### BM-2.0 entitlement enforcement (dark-launched 2026-07-23)

Added with enforcement wired but **parked in `DISABLED_CAPABILITIES` in prod** so
the slice ships inert; remove a name to turn that gate on. Owner: Founder (flip);
Claude (wiring). Enforcement composition (one truth for web + mobile):
`apps/web/src/lib/server/entitlement-gates.ts`. Server enforces on all clients;
mobile 0.2.0+ additionally hides entry points.

| Name | Purpose | Safe disabled (paused) behaviour | Enforcement |
| --- | --- | --- | --- |
| `branding` | Remove the public "made with Inklee" footer for Plus | Footer stays for **everyone** (today's behaviour); removal is a Plus perk | `brandingRemoved`; the 5 `app/[slug]/**` public pages |
| `custom_templates` | Restrict editing email-template bodies to Plus | Every tier can **edit** (today's behaviour); existing bodies always keep SENDING regardless | `canEditTemplates`; `settings/emails` save action + mobile email-templates route |
| `analytics` | Gate advanced analytics to Plus (for all, no grandfather) | Advanced analytics visible to **everyone** | `canSeeAdvancedAnalytics`; the artist analytics view |
| `entitlement_caps` | Enforce the custom-field / active-trip / studio-library caps (block-new, keep-existing) | Caps **not enforced** (unlimited); existing items never touched | `capState`; the field/trip/studio create paths (web + mobile) |

Removal condition: never while the tiers exist (permanent entitlement enforcement); re-verify wiring each review.

## Config keys (GET /api/mobile/config)

| Key | Source env | Semantics | Fail direction |
| --- | --- | --- | --- |
| `minVersion` / `updateRequired` / `updateUrl` | `MOBILE_MIN_VERSION[_ANDROID\|_IOS]`, `MOBILE_UPDATE_URL` | Hard update floor (whole-app recall). Identical to the legacy `/api/mobile/min-version`, which pre-0.2.0 builds keep calling; both are built by `buildMobileAppConfig` | Fail-open (unset = 0.0.0, nobody blocked) |
| `recommendedVersion` | `MOBILE_RECOMMENDED_VERSION` | Soft update nudge (dismissible home banner in 0.2.0+) | Fail-open (unset = no banner) |
| `disabledCapabilities` | `DISABLED_CAPABILITIES` | The grouped capability kill list (names above) | Fail-open (unset/malformed = nothing disabled) |

## Quarterly cleanup checklist

- Any capability never flipped since the last review? Fine — kill-switches are
  supposed to idle. Re-verify the wiring still exists (grep
  `isCapabilityDisabled`).
- Any config key unreferenced in code? Delete it.
- Any behavior controlled by TWO mechanisms (env gate + capability, flag +
  entitlement)? Consolidate to one owner.
- Any `clientAtLeast` emission floor below the fleet minimum? Delete the
  branch.
- Anything in config that has become permanent product state? Move it to the
  database / entitlements.

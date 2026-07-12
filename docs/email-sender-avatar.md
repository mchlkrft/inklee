# Sender avatar for Resend mail (noreply@inklee.app)

Goal: emails sent through Resend from `inklee <noreply@inklee.app>` should show the spiderweb
avatar in recipients' inboxes, like mail from the founder's Google inklee account does.

Status 2026-07-12: everything on the sending side is already in place; the missing piece is a
Google-side identity for the `noreply@` address. That is a founder action in the Google Admin
console (steps below). No code or DNS change is required for the primary path.

## How inbox avatars actually work

- **Gmail** shows a sender photo when the From address resolves to a Google profile with a
  photo AND the mail authenticates (SPF/DKIM/DMARC). It does not read any avatar from the
  email itself.
- **BIMI** is the cross-provider standard (Gmail, Yahoo, Apple): a DNS record pointing to an
  SVG logo. Gmail and Apple additionally require a paid Verified Mark Certificate (VMC) or
  Common Mark Certificate (roughly USD 1,000+/year, trademark or prior-use evidence needed)
  and DMARC at enforcement (`p=quarantine` or `p=reject`). Deferred; see below.
- **Animated GIF profile photos DO render animated in the Gmail inbox.** Founder-verified
  2026-07-13 with the spiderweb GIF on the existing Google inklee account (an earlier note
  claiming avatars render static was wrong). The animation only reaches clients that resolve
  Google profiles (Gmail web and apps); Apple Mail and Outlook show no avatar at all without
  BIMI, and BIMI logos are static SVG by spec.

## Verified sending-side state (2026-07-12)

- `inklee.app` MX -> Google (`aspmx.l.google.com` et al.): the domain is on Google Workspace.
- Resend DKIM key present at `resend._domainkey.inklee.app`, signing `d=inklee.app`
  (DMARC-aligned).
- Return-Path domain `send.inklee.app` with `v=spf1 include:amazonses.com ~all` and the SES
  feedback MX: SPF passes on the Resend path.
- DMARC: `v=DMARC1; p=none; rua=mailto:support@inklee.app` (monitoring only).
- No BIMI record exists (`default._bimi.inklee.app` is unset). DNS is hosted on Cloudflare.

Because DKIM already aligns, Gmail will display a profile photo for `noreply@inklee.app` as
soon as that address maps to a Google profile.

## Founder runbook

Option A, free, try first (alias on the account that already has the avatar):

1. Open admin.google.com -> Directory -> Users -> the account whose avatar is already the
   spiderweb.
2. User information -> Alternate email addresses (email alias) -> add `noreply`.
3. Wait for propagation (up to 24-48 hours; Gmail also caches avatars per recipient).
4. Trigger any Inklee email to a Gmail test address and check the avatar.

Option B, guaranteed (dedicated identity, costs one Workspace seat):

1. Admin console -> Directory -> Users -> Add new user `noreply@inklee.app`.
2. Sign in as that user once, upload the spiderweb GIF as the profile photo
   (`C:\Users\miche\Desktop\inklee-spiderweb-avatar.gif`), the same way it was set on the
   existing account so the animation survives, and set photo visibility to Anyone. The
   generator `.scratch/make-spiderweb-gif.cjs` can re-emit the GIF at any size.
3. Same propagation wait, same test.

If Option A does not surface the photo after 48 hours, fall back to Option B: alias photo
inheritance works in most Workspace setups but is the less deterministic of the two.

Note: the engine's From address is `EMAIL_FROM` (falls back to
`inklee <noreply@inklee.app>`, `src/lib/email-campaigns/lifecycle/engine.ts`). If the From
address ever changes, the Google-profile mapping must follow it.

## Deferred: BIMI

Revisit post-launch if avatar coverage beyond Gmail matters (Yahoo, Apple Mail). Requires, in
order: DMARC moved to enforcement after a monitoring period (its own change, watch the `rua`
reports first), an SVG Tiny PS version of the spiderweb logo hosted on inklee.app, a
`default._bimi.inklee.app` TXT record on Cloudflare, and the paid VMC/CMC for Gmail/Apple to
actually display it. BIMI logos are static SVG by spec; it does not add motion either.

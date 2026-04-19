# Inklee — Claude Code Working Rules

This file is your primary context. Read it at the start of every session. If anything here conflicts with a user instruction, ask before proceeding.

## Product

Inklee is a lightweight booking request tool for freelance and traveling tattoo artists. It replaces chaotic Instagram DMs with a structured form, an approval flow, and a simple dashboard. Single-artist scope only. No studios, no multi-user accounts.

- **Primary user:** solo freelance or traveling tattoo artist who currently handles bookings via Instagram DMs.
- **Secondary user:** the tattoo customer submitting a request.

## Stack (locked)

- **Framework:** Next.js 15 (App Router), TypeScript strict, React Server Components by default
- **Styling:** Tailwind CSS + shadcn/ui. No CSS-in-JS, no inline styles outside shadcn primitives
- **DB + Auth + Storage:** Supabase, EU region (Frankfurt)
- **ORM:** Drizzle
- **Email:** Resend
- **Validation:** Zod on every input boundary (form, API, query params)
- **Forms:** React Hook Form + Zod resolver
- **Calendar UI:** react-big-calendar (evaluate FullCalendar only if it fails)
- **Analytics:** Plausible (EU, cookie-free)
- **i18n:** next-intl scaffolded but English only at launch
- **Deployment:** Vercel, EU region
- **Node version:** latest LTS
- **Package manager:** pnpm

Do not propose alternatives to these without flagging in your response and waiting for approval.

## Hard rules — never do these

- No payment integration. No Stripe, no PayPal, no deposit collection. `deposit_pending` is a manual flag only.
- No chat system. Planned for v2, not MVP.
- No Instagram API integration. Never.
- No multi-artist studios, no team accounts, no role-based access.
- No mobile app. Responsive web only.
- No scheduling optimization, no AI suggestions, no ML features.
- No new features outside SLICES.md without explicit user approval in chat.
- No new npm dependencies without listing them in the response with a one-line justification.
- No secrets in code. No `.env` committed. Public repo — assume any leaked secret is exploited within an hour.
- No auto-commits. Never run `git commit` or `git push` without being asked.
- No custom per-artist branding on public pages. MVP uses Inklee brand only. Custom branding is post-MVP paid tier.

## Code conventions

- TypeScript strict. No `any` without an inline comment explaining why.
- Server components by default. Client components only when interactivity is required.
- Zod schemas live next to the feature that uses them.
- One component per file. File name matches default export.
- Prefer function components. No class components.
- No barrel exports (`index.ts` re-export files) — they break tree-shaking and add indirection.
- Error handling: throw in server code, catch at route boundary, never swallow silently.
- No speculative abstractions. Build the dumbest working version first. Refactor when duplication appears three times.
- Tests: Vitest for unit, Playwright for the three critical E2E paths (defined in SLICES.md slice 10).
- If a file exceeds 200 lines, flag it in the response and propose a split.
- Comments explain *why*, not *what*. No commented-out code in commits.

## Design system

### Colors

Defined as CSS variables in `globals.css`. Never hardcode hex values in components — always use CSS variables or Tailwind tokens that reference them.

```css
/* dark mode — default */
--bg: #0E0E10;           /* background */
--surface: #1A1A1D;      /* elevated surfaces, cards, inputs */
--fg: #E8E1D4;           /* bone — primary text and warm accent */
--fg-muted: rgba(232, 225, 212, 0.6);  /* secondary text */
--border: rgba(232, 225, 212, 0.1);
--danger: #E5484D;       /* error, rejection, destructive only */

/* light mode */
--bg-light: #F5F0E8;
--surface-light: #EDE6D8;
--fg-light: #0E0E10;
--fg-muted-light: rgba(14, 14, 16, 0.6);
--border-light: rgba(14, 14, 16, 0.1);
```

Dark mode is default. Light mode via `html.light` class.

### Typography

- **Sans:** Inter (fallback to system-ui). Use `next/font/google`.
- **Mono:** JetBrains Mono (for timestamps, IDs, technical data).
- Base size 15px. Scale 1.25 (major third).
- Line height: 1.5 body, 1.2 headings.
- No weight above 600.

### Spacing

- 4px base unit. Tailwind defaults (`space-1` = 4px, `space-2` = 8px, etc.).
- Generous whitespace. Cal.com as reference.

### Voice

- Lowercase microcopy where natural.
- No emoji in UI.
- No exclamation marks.
- Dry, conversational, confident.
- Reference line: "got it — we'll get back to you soon"
- Error messages describe the problem + next step. Never blame the user.

Examples:
- ✅ "got it — we'll get back to you soon"
- ✅ "this date isn't available — pick another?"
- ✅ "something went wrong on our end. try again?"
- ❌ "Oops! Something went wrong 😅"
- ❌ "Your request has been successfully submitted!"
- ❌ "Please ensure all required fields are filled in correctly."

### Layout

- **Artist dashboard:** desktop-first, responsive down to tablet. Basic mobile readability only; no mobile-specific flows for MVP.
- **Customer-facing pages** (`/[slug]`, `/request/[token]`): mobile-first. 95% of traffic comes from Instagram on phones.

## Working agreement

- Before writing code for any non-trivial task, explain the approach in 2-4 sentences and wait for approval.
- When making a tradeoff, surface it: "I can do X (faster) or Y (more robust). Picking X — say if you want Y."
- If the request is ambiguous, ask one sharp clarifying question. Don't guess.
- If a request is outside SLICES.md, say so and ask whether to add it or defer.
- When proposing a library, name the alternative you rejected and why.
- After completing a slice, run the smoke test listed in SLICES.md and report the result before moving on.
- Keep `DECISIONS.md` updated. When a TBD gets resolved, move it to the resolved section with the date.
- If you find yourself copy-pasting across 3+ files, stop and propose an abstraction.

## Security (public repo)

- All secrets in environment variables. `.env.example` committed with placeholder values only.
- Supabase Row Level Security enabled on every table. No exceptions.
- Rate limiting on every public endpoint (Upstash free tier or Vercel KV).
- Honeypot field + server-side validation on the public booking form.
- No PII in logs. No PII in URLs.
- Magic link tokens: single-use for edits, cryptographically random (32 bytes), stored hashed (Argon2), 30-day expiry.
- CSRF protection on all state-changing routes.
- Content Security Policy headers configured.
- Before adding a dependency, check npm advisory and OSSF scorecard.

## Out of scope for MVP (repeat for safety)

Payments. Chat. Instagram API. Multi-artist studios. Mobile app. Scheduling AI. Team accounts. Custom per-artist branding. Recurring slot templates. SMS notifications. Multi-language launch. Custom domains per artist.

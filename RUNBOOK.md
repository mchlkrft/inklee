# Inklee Runbook

Operational recovery procedures. Keep this file up to date when infrastructure changes.

---

## 1. Restore a deleted booking from Supabase PITR

**When to use:** A booking_request row was accidentally deleted or corrupted.

**PITR window:** 7 days (free plan) · 30 days (Pro plan).

**Steps:**

1. Go to [Supabase Dashboard → Database → Backups](https://supabase.com/dashboard/project/llmzzsmppaqwecbrowlp/database/backups)
2. Use "Point in Time Recovery" to restore to a timestamp before the deletion
3. PITR restores the **entire database** — it is destructive. If you only need one row, either:
   - Restore to a separate project, export the row, then re-insert it manually
   - Or query the Supabase support team for row-level recovery assistance
4. After restore, re-apply any migrations that ran after the target timestamp

**Alternative (if the booking ID is known):** Re-insert the row manually via the Supabase SQL editor using data from the `audit_log` (`details` JSONB on `booking_created` entry).

---

## 2. Resend a customer magic link

**When to use:** A customer lost their magic link email and needs a new one.

**Steps:**

Option A — via artist dashboard:

1. Log in as the artist
2. Go to Bookings → Requests → open the booking
3. Use the "Send reconfirmation" button (available for approved bookings)
   — this refreshes the token and emails the customer

Option B — via Supabase SQL editor (if the booking is in a status that doesn't allow reconfirmation):

```sql
-- Generate a new token and update the hash
-- Replace {booking_id} and {new_hash} with real values
UPDATE booking_requests
SET customer_token_hash = '{new_hash}', updated_at = now()
WHERE id = '{booking_id}';
```

Then send the magic link manually: `https://inklee.app/request/{raw_token}`

**Note:** The token is 32 random bytes hex-encoded. The hash is SHA-256 of the raw token.

---

## 3. Recover an artist account after lockout

### 3a. Password locked out (forgot password)

1. Go to `https://inklee.app/forgot-password`
2. Enter the artist's email — a reset link will be sent
3. If the email is not arriving, check Resend logs at [resend.com/emails](https://resend.com/emails)
4. If the email domain is bouncing, fix in Resend → Domains and retry

### 3b. 2FA locked out (lost authenticator)

1. If the artist has a recovery code: go to `https://inklee.app/login`, then `/auth/mfa`, then "Use a recovery code"
2. If all recovery codes are lost: go to [Supabase Dashboard → Authentication → Users](https://supabase.com/dashboard/project/llmzzsmppaqwecbrowlp/auth/users), find the user, and use the admin panel to disable MFA (unenroll the TOTP factor)
3. After regaining access, the artist should re-enable 2FA from Settings → Account

### 3c. Account deleted by mistake

1. User accounts cannot be restored via the dashboard once deleted
2. If detected within 7 days: use PITR to restore the auth.users row and the profiles row
3. Advise the artist to re-sign-up with the same email if PITR is not feasible — bookings are linked by artist_id so historical data cannot be reconnected automatically

---

## 4. Check for unreconciled deposits

Unreconciled deposits (deposit_pending, due date >7 days past, not paid) are flagged automatically in:

- **Admin dashboard** (`/admin`) → Booking integrity section
- **audit_log** — rows with `action = 'deposit_unreconciled'` written by the daily cleanup cron

**Manual action:**

1. Open the booking in the dashboard
2. Contact the customer to confirm payment status
3. If paid outside Stripe: click "Mark deposit received" manually
4. If abandoned: reject the booking to free the slot

---

## 5. Stripe test-mode / live-mode mismatch

If the server log shows:

```
[stripe] WARNING: test-mode key detected in production environment
```

1. Log into [Stripe Dashboard](https://dashboard.stripe.com)
2. Switch to Live mode
3. Get the live-mode `sk_live_*` secret key and `pk_live_*` publishable key
4. Update in Vercel: Project Settings → Environment Variables
   - `STRIPE_SECRET_KEY` → `sk_live_*`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → `pk_live_*`
5. Create a new webhook endpoint in Stripe Live mode pointing to `https://inklee.app/api/stripe/webhook`
6. Update `STRIPE_WEBHOOK_SECRET` in Vercel with the live-mode webhook signing secret
7. Redeploy

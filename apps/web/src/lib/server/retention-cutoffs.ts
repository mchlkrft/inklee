/**
 * Shared date-cutoff arithmetic for retention purges (docs/legal/
 * counsel-accountant-handoff-2026-08.md PART 4, C1.4 and the pre-existing
 * account-deletion retention cron). Every purge job that needs "N years/
 * months/days ago" computes it here, once, so a completed order's 7-year
 * financial-record cutoff and a cancelled order's 30-day cutoff can never
 * quietly diverge in arithmetic even though they are expressed in different
 * units and were added at different times.
 *
 * No DB, no service client: every function here is pure so the arithmetic
 * itself can be unit-tested without Docker/Supabase.
 */

/**
 * "N years from the END of the financial year", never "N years from the row's
 * own date". Financial year = calendar year (founder decision 2026-06-10,
 * restated in the pre-existing retention-purge cron). A row whose financial
 * year is Y is retained through 31 Dec (Y + retainYears); it becomes
 * purgeable once the clock reaches 1 Jan (Y + retainYears + 1).
 *
 * Equivalently: a row is purgeable once its own year is <= now's year -
 * retainYears - 1, i.e. once its timestamp is before 1 Jan (now's year -
 * retainYears). Returning THAT instant as "the cutoff" lets every caller do
 * a single `row.timestamp < cutoff` comparison, the same shape as the other
 * two helpers below.
 *
 * The naive-but-wrong version subtracts `retainYears` from the row's own
 * date, which under-retains everything except a row dated exactly 1 January:
 * an order placed 2019-06-15 would look purgeable on 2026-06-15 rather than
 * on the correct 2027-01-01 (retention-cutoffs.test.ts pins this).
 */
export function financialYearRetentionCutoff(
  now: Date,
  retainYears: number,
): Date {
  return new Date(Date.UTC(now.getUTCFullYear() - retainYears, 0, 1));
}

/** `days` × 24h before `now`, exact (not calendar-day truncated). */
export function daysAgoCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** `months` calendar months before `now` (exact, via UTC month arithmetic —
 *  matches the pre-existing 24-month audit cutoff in the retention-purge
 *  cron). */
export function monthsAgoCutoff(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** 1 Jan of `now`'s own year (UTC midnight), same financial-year=calendar-
 *  year convention as `financialYearRetentionCutoff` above. VAT registration
 *  and OSS thresholds (A2, tax-threshold-rollup.ts) are calendar-year
 *  turnover windows, so bucketing "this year so far" off this single helper
 *  is what makes the rollup reset on 1 Jan without separate reset logic. */
export function calendarYearStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

// CRON-RMD-001: two independent backstops on the deposit_overdue branch,
// which is the only one of the three reminder branches with no natural
// terminal condition (appointment_reminder and reconfirmation each match a
// single exact days-out date, so they fire at most once per booking;
// deposit_overdue fires on every run while the booking stays deposit_pending
// and overdue). Pulled into their own module — rather than declared inline in
// route.ts — so the test suite can assert against the exact values in force
// instead of duplicating magic numbers that could silently drift out of sync.
// (route.ts itself may only export recognized Next.js route-config fields
// alongside its HTTP method handlers, so a plain named constant can't live
// there.)

// One send/day is already enforced by `alreadySentToday`, so this many sends
// means this many distinct days of nudging. That is enough for a customer to
// notice and pay without crossing into the harassment territory production
// hit (46 sends to one address); anything still unresolved after this many
// nudges needs an artist decision, not another automated email.
export const DEPOSIT_OVERDUE_MAX_SENDS = 5;

// Independent of send count, so it still bounds exposure even if the count
// check above were ever bypassed by a bug. Matches the 30-day "stale" cutoff
// this cron's own cleanup sibling already uses for purging abandoned bookings
// (api/cron/cleanup/route.ts) — a deposit this far past due is being treated
// as abandoned everywhere else in the system, so reminders should stop
// nagging about it too rather than being the one place still pretending it
// might convert.
export const DEPOSIT_OVERDUE_STALENESS_FLOOR_DAYS = 30;

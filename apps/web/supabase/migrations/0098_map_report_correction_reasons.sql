-- 0098: correction reasons for map reports
--
-- The seed data is a snapshot and a measured ~1-in-6 of it is materially
-- stale (moved or closed), so artists need a way to flag a wrong pin. The
-- existing report reasons are abuse-oriented (fake/spam/scam/behavior); this
-- adds two data-quality corrections so a report can say "this moved/closed"
-- or "the details are out of date" without pretending it is abuse.
--
-- wrong_location already covers a wrong address / moved studio.

alter table public.map_reports
  drop constraint if exists map_reports_reason_check;

alter table public.map_reports
  add constraint map_reports_reason_check
  check (
    reason = any (
      array[
        'wrong_location',
        'fake_studio',
        'spam',
        'scam',
        'behavior',
        'closed',
        'outdated_details',
        'other'
      ]
    )
  );

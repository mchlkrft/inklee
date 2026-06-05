ALTER TABLE audit_log
  ADD COLUMN event_category TEXT NOT NULL DEFAULT 'booking'
    CHECK (event_category IN ('booking', 'auth', 'settings', 'admin', 'system'));

-- Back-fill existing rows
UPDATE audit_log
SET event_category = 'system'
WHERE action IN ('reminder_sent', 'deposit_paid');

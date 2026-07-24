-- One durable purchase confirmation per invoice (audit finding: the check-then-act
-- guard in recordDurableConfirmation has no backing constraint, so two concurrent
-- invoice.paid deliveries could both send). This unique index makes the second
-- insert 23505, which recordDurableConfirmation treats as "already sending" and
-- stops. Withdrawal acks carry no invoice id (guarded by the one-per-subscription
-- case), so the partial index only covers rows that have a stripe_invoice_id.
create unique index if not exists bcc_one_per_invoice
  on billing_contract_confirmations (stripe_invoice_id)
  where stripe_invoice_id is not null;

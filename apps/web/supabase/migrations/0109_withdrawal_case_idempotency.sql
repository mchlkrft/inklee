-- Withdrawal-case idempotency (P6/P7, docs/legal/eu-consumer-withdrawal-flow.md).
-- One withdrawal case per subscription: a re-submitted withdrawal must resume the
-- SAME case (fixed receipt time, one refund) rather than create a duplicate. The
-- Stripe refund is already idempotency-keyed per subscription; this guards the
-- case row so the proration is computed once and reused on retry.
--
-- withdrawal_cases already exists (migration 0106) with RLS enabled and zero
-- policies (service-role only); this only adds the uniqueness guard.
create unique index if not exists withdrawal_cases_one_per_subscription
  on withdrawal_cases (billing_subscription_id)
  where billing_subscription_id is not null;

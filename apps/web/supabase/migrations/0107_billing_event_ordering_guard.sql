-- 0107: monotonic event-ordering guard for subscription reconciliation.
--
-- The billing webhook re-fetches current Stripe truth on every subscription
-- event (so redelivery / out-of-order delivery converge correctly), but two
-- events for the SAME subscription processed concurrently by two instances leave
-- a narrow last-writer-wins window. `last_event_created` stores the Stripe
-- `event.created` of the applied event so reconcile can perform an ATOMIC guarded
-- write (apply only when the incoming event is not older than the stored one),
-- closing that residual race.
--
-- Additive, reversible, service-role only (both tables already have RLS on;
-- account_overrides is the 0045 zero-policy pattern, billing_subscriptions the
-- 0106 one). Null default = "no event applied yet" (a first event always wins).

alter table billing_subscriptions
  add column if not exists last_event_created bigint;

alter table account_overrides
  add column if not exists last_event_created bigint;

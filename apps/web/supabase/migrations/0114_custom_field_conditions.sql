-- Conditional booking-form questions (Plus build P3).
--
-- A field may declare ONE condition on an earlier field; when the condition is
-- not met the field is not rendered and, critically, is not required. The
-- evaluation is server-side in validateCustomAnswers, so a stale client can
-- neither block a submission with a hidden required field nor smuggle an
-- answer to a question it never showed.
--
-- Nullable with no default: every existing field means "always shown" without
-- a backfill, and the shared parser treats any malformed value as null (fail
-- OPEN to visible), so a bad row can never silently hide an artist's question.
--
-- Shape: { "fieldKey": "<key of an earlier field>", "operator":
-- "equals" | "not_equals" | "answered" | "not_answered", "value": "<string|null>" }
--
-- Deliberately jsonb rather than three columns: the condition is read and
-- written as one unit by one shared parser, and a partially-populated row
-- (operator set, value missing) is exactly the invalid state a single value
-- makes unrepresentable.

ALTER TABLE custom_fields
  ADD COLUMN IF NOT EXISTS condition jsonb;

-- Artist-chosen icons for trips + studios (founder round 10): a semantic key
-- from the shared inklee icon library (packages/shared/src/travel-icons.ts).
-- NULL = no icon chosen (render the default glyph). No CHECK constraint on the
-- values: keys are validated app-side via the shared sanitizer, so extending
-- the library never needs DDL. Artist-side display only — the public page does
-- not render these.
alter table trips add column if not exists icon text;
alter table studios add column if not exists icon text;

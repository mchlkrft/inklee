-- Unique constraint required for upsert in /settings/templates
ALTER TABLE email_templates
  ADD CONSTRAINT email_templates_artist_id_type_unique UNIQUE (artist_id, type);

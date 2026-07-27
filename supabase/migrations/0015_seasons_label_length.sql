-- Defense in depth alongside the API-level validation in
-- src/lib/resolve-season.ts — a length constraint enforced at the
-- database layer too, not only in application code.
alter table seasons add constraint seasons_label_length check (char_length(label) between 3 and 40);
alter table seasons add constraint seasons_normalized_label_length check (char_length(normalized_label) > 0 and char_length(normalized_label) <= 40);

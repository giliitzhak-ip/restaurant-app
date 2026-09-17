-- ===========================================================================
-- 0029 — a category may be created by an admin, not only shipped
--
-- Until now the seven categories were fixed at migration time. An admin
-- reviewing a provider-proposed trade could only file it under one of them,
-- so a trade that genuinely is not plumbing, electrical, HVAC, locksmithing,
-- pest control, cleaning or gardening — moving, painting, carpentry,
-- appliance repair — had nowhere to go. The admin's only options were to
-- reject something real or to file it somewhere wrong, and filing it wrong is
-- worse than it sounds: the category carries the working radius, the default
-- duration and whether a licence and insurance are required before
-- verification, so a mover filed under "plumbing" inherits a plumber's
-- document requirements.
--
-- Two things stood in the way, and this migration removes the first.
--
-- name_en was NOT NULL, for the same reason 0026 relaxed it on services: an
-- admin typing "הובלות" has no English name to record, and inventing a
-- translation or storing the Hebrew string in a column labelled English both
-- put false data in a named field. Nothing reads name_en yet; when an English
-- surface arrives, an absent name is a visible gap rather than a wrong
-- translation nobody notices.
--
-- The second thing was never a schema problem: `categories_admin_write`
-- already allows an admin to insert, and `authenticated` already holds the
-- privilege behind that policy. What was missing was a path through the API,
-- which is application code rather than a migration.
-- ===========================================================================

alter table public.categories alter column name_en drop not null;

comment on column public.categories.name_en is
  'English name where one is known. NULL for admin-created categories — see migration 0029.';

-- A second category with the same Hebrew name is not a new category, it is a
-- split: providers land in one and customers are routed to the other, and
-- neither side can see why. The application looks for an existing name before
-- creating one, and this index makes that agreement enforceable rather than
-- merely intended.
create unique index if not exists categories_unique_active_name
  on public.categories (lower(btrim(name_he)))
  where is_active;

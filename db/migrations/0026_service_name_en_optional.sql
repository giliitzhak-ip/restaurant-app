-- ===========================================================================
-- 0026 — services.name_en may be unknown
--
-- The 23 curated services have real English names. A service created from a
-- provider-proposed trade does not: the provider wrote "תיקון מכונות כביסה"
-- and there is no English name to record. The three options were to invent a
-- translation, to store the Hebrew string in an English column, or to admit
-- the value is absent. The first two put false data in a labelled field.
--
-- Nothing in the application reads name_en — it is there for a future
-- English surface, and when that arrives an absent name is a visible gap to
-- fill rather than a wrong translation nobody notices.
-- ===========================================================================

alter table public.services alter column name_en drop not null;

comment on column public.services.name_en is
  'English name where one is known. NULL for provider-proposed trades — see migration 0026.';

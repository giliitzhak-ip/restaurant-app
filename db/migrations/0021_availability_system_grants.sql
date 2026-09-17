-- ===========================================================================
-- 0021 — service_role grants for the availability tables
--
-- 0017 granted the new schedule tables to `authenticated` only. Everything a
-- provider does to their own hours therefore worked, and every SYSTEM read of
-- them failed with 42501 — which the API correctly turns into a 403, so the
-- symptom was "no permission" on a screen where permission was never the
-- issue. Two paths were affected: the provider's own availability summary and
-- the customer-facing provider profile.
--
-- Why service_role needs them at all: the summary is computed as the system
-- precisely so a customer can be told "available until 18:00" WITHOUT being
-- able to read the provider's schedule. The privacy boundary is the shape of
-- the response, not the absence of a grant (spec §56).
-- ===========================================================================

grant select, insert, update, delete on public.provider_availability_rules     to service_role;
grant select, insert, update, delete on public.provider_availability_overrides to service_role;

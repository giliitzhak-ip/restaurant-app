-- ===========================================================================
-- 0014 — Grant the PUBLIC catalog to the anon role
--
-- The service catalog is genuinely public: the home page and the
-- classification endpoint read it before anyone signs in. 0011 granted SELECT
-- to `authenticated` only, so those reads failed with 42501 for a visitor —
-- and because the home page swallowed the error, it rendered successfully
-- with an empty category list rather than failing loudly.
--
-- The RLS policies on these tables already say `using (true)` for SELECT;
-- this adds the table privilege that RLS filters on top of. Nothing else is
-- exposed to anon: jobs, profiles, offers, settings and telemetry all remain
-- unreachable without a session.
-- ===========================================================================

grant select on public.categories to anon;
grant select on public.services to anon;
grant select on public.job_transitions to anon;

-- Login needs to look a user up before a session exists. That path runs as
-- the system role, not as anon, so anon deliberately gets nothing here.

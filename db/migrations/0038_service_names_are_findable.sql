-- ===========================================================================
-- 0038 — a service's own name must find that service
--
-- Caught by the browse grid, but not caused by it. `/services` opens a
-- request carrying the service's display name as the description, and two of
-- the 62 did not come back:
--
--   "פתיחת סתימה בביוב ראשי"  → blocked_drain   (the wrong, cheaper service)
--   "התקנת נקודת חשמל"        → nothing
--
-- The grid only made it visible. The same thing happens to a customer who
-- types the name they read on the site, which is the most likely thing they
-- will type: main_drain_clearing declares "סתימה בביוב הראשי" with the
-- definite article and its own name without it, and new_outlet declares
-- "נקודת חשמל חדשה" but not the plain "נקודת חשמל" its own title uses.
--
-- The catalogue invariant was "every declared phrase routes to its service"
-- (0021), which both of these satisfied. The missing half is the other
-- direction: every service's NAME routes to it too. A name that does not is
-- a service the customer can read and cannot reach.
--
-- Only the two that fail are touched. A blanket "add every name as a phrase"
-- would quietly reshuffle scoring across all 62, and the test added with this
-- migration catches the next one honestly instead.
-- ===========================================================================

update public.services
   set strong_phrases = array_append(strong_phrases, 'פתיחת סתימה בביוב ראשי')
 where slug = 'main_drain_clearing'
   and not ('פתיחת סתימה בביוב ראשי' = any (strong_phrases));

update public.services
   set strong_phrases = array_append(strong_phrases, 'התקנת נקודת חשמל')
 where slug = 'new_outlet'
   and not ('התקנת נקודת חשמל' = any (strong_phrases));

-- ── Prove it landed ────────────────────────────────────────────────────────
do $$
declare
  missing text;
begin
  select string_agg(slug, ', ') into missing
    from public.services
   where slug in ('main_drain_clearing', 'new_outlet')
     and not (name_he = any (strong_phrases));

  if missing is not null then
    raise exception 'SERVICE_NAME_NOT_A_PHRASE: % still does not declare its own name', missing;
  end if;
end $$;

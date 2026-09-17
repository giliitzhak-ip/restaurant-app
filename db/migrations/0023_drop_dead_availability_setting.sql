-- ===========================================================================
-- 0023 — Remove a setting that described a behaviour nothing implemented
--
-- availability.rules carried "noRulesMeansAlwaysPlanned": true, and its own
-- description said it "keeps a provider who never set hours matchable via
-- their realtime switch". Nothing ever read the key. A comment in migration
-- 0022 then cited it as though it were load-bearing, which made a dead flag
-- look like the explanation for real behaviour — worse than not having it.
--
-- The actual rule, which is the right one, is simpler and needs no flag:
--
--   No declared weekly hours  →  matchable NOW, through the realtime switch,
--                                because the switch is a live statement.
--                             →  NEVER matchable for a future slot, because
--                                we have nothing to base that on.
--
-- Implementing the flag instead would mean dispatching a 03:00 Tuesday job to
-- someone who never said they work then, and who cannot be asked, because the
-- switch says nothing about Tuesday. The customer would collect declines and
-- we would have manufactured availability out of an absence of data.
--
-- Customer-facing copy distinguishes the two cases: a provider with no hours
-- reads "לא פרסם שעות קבועות" (we do not know), never "no availability in the
-- next two weeks" (a claim about their calendar).
-- ===========================================================================

update public.settings
   set value = value - 'noRulesMeansAlwaysPlanned',
       description =
         'Availability evaluation parameters. A provider with no weekly rules '
         'is matchable NOW through the realtime switch and never for a future '
         'slot — see migration 0023.'
 where key = 'availability.rules';

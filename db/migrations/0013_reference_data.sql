-- ===========================================================================
-- 0013 — Reference data and runtime configuration
--
-- These rows are configuration, not seed fixtures: the MVP categories
-- (spec §5) and the matching weights / dispatch waves / fee model
-- (spec §14, §16, §28). They ship with the schema so no behaviour is
-- hard-coded in application code.
-- ===========================================================================

insert into public.categories (
  slug, name_he, name_en, icon, sort_order,
  pricing_model, supports_now, supports_schedule, supports_compare,
  requires_license, requires_insurance, requires_documents, requires_before_after,
  default_duration_min, default_radius_km, required_skills
) values
  ('plumbing','אינסטלציה','Plumbing','droplet',10,
   'FIXED_PRICE', true, true, true,   true,  true,  true,  true,  60, 12, '{"plumbing"}'),
  ('electrical','חשמל','Electrical','zap',20,
   'FIXED_PRICE', true, true, true,   true,  true,  true,  true,  60, 12, '{"electrical"}'),
  ('air_conditioning','מיזוג אוויר','Air Conditioning','wind',30,
   'FIXED_PRICE', true, true, true,   true,  false, true,  true,  90, 15, '{"hvac"}'),
  ('locksmith','מנעולנות','Locksmith','key-round',40,
   'FIXED_PRICE', true, false, false, false, false, true,  false, 30,  8, '{"locksmith"}'),
  ('pest_control','הדברה','Pest Control','bug',50,
   'FIXED_PRICE', true, true, false,  true,  true,  true,  false, 60, 20, '{"pest_control"}'),
  ('cleaning','ניקיון','Cleaning','sparkles',60,
   'QUOTE',       false, true, true,  false, false, false, false, 180, 20, '{"cleaning"}'),
  ('gardening','גינון','Gardening','leaf',70,
   'QUOTE',       false, true, true,  false, false, false, true,  120, 25, '{"gardening"}')
on conflict (slug) do nothing;

-- ── Services ──────────────────────────────────────────────────────────────
insert into public.services (category_id, slug, name_he, name_en, base_price_ils, min_price_ils, max_price_ils, duration_min, default_urgency, required_skills)
select c.id, v.slug, v.name_he, v.name_en, v.base, v.min_p, v.max_p, v.dur, v.urgency::urgency_level, v.skills::text[]
from (values
  -- plumbing
  ('plumbing','sink_leak','נזילה מתחת לכיור','Sink leak',290,220,420,60,'high','{"plumbing"}'),
  ('plumbing','blocked_drain','סתימה בצינור','Blocked drain',320,250,480,60,'high','{"plumbing"}'),
  ('plumbing','toilet_repair','תיקון אסלה','Toilet repair',280,200,400,60,'normal','{"plumbing"}'),
  ('plumbing','burst_pipe','פיצוץ צינור','Burst pipe',480,350,900,90,'emergency','{"plumbing"}'),
  ('plumbing','boiler_issue','בעיה בדוד','Boiler issue',390,300,650,90,'normal','{"plumbing"}'),
  -- electrical
  ('electrical','power_outage','הפסקת חשמל בדירה','Power outage',320,250,500,60,'emergency','{"electrical"}'),
  ('electrical','short_circuit','קצר חשמלי','Short circuit',350,260,550,60,'emergency','{"electrical"}'),
  ('electrical','socket_repair','תיקון שקע','Socket repair',220,160,320,45,'normal','{"electrical"}'),
  ('electrical','light_fixture','התקנת גוף תאורה','Light fixture install',240,180,380,45,'low','{"electrical"}'),
  -- air conditioning
  ('air_conditioning','ac_not_cooling','מזגן לא מקרר','AC not cooling',340,260,520,90,'high','{"hvac"}'),
  ('air_conditioning','ac_service','ניקוי וטיפול למזגן','AC service',260,200,380,60,'low','{"hvac"}'),
  ('air_conditioning','ac_leaking','מזגן מטפטף','AC leaking',300,230,460,60,'normal','{"hvac"}'),
  ('air_conditioning','ac_install','התקנת מזגן','AC installation',900,650,1800,180,'low','{"hvac"}'),
  -- locksmith
  ('locksmith','locked_out','ננעלתי מחוץ לבית','Locked out',350,250,550,30,'emergency','{"locksmith"}'),
  ('locksmith','lock_replacement','החלפת צילינדר','Lock replacement',320,240,480,45,'normal','{"locksmith"}'),
  ('locksmith','car_lockout','ננעלתי מחוץ לרכב','Car lockout',380,280,600,30,'emergency','{"locksmith"}'),
  -- pest control
  ('pest_control','cockroaches','הדברת תיקנים','Cockroach treatment',420,320,650,60,'high','{"pest_control"}'),
  ('pest_control','ants','הדברת נמלים','Ant treatment',350,260,520,45,'normal','{"pest_control"}'),
  ('pest_control','rodents','הדברת מזיקים / מכרסמים','Rodent treatment',520,380,850,90,'high','{"pest_control"}'),
  -- cleaning
  ('cleaning','apartment_cleaning','ניקיון דירה','Apartment cleaning',450,300,900,180,'low','{"cleaning"}'),
  ('cleaning','post_renovation','ניקיון אחרי שיפוץ','Post-renovation cleaning',900,600,2000,300,'low','{"cleaning"}'),
  -- gardening
  ('gardening','garden_maintenance','תחזוקת גינה','Garden maintenance',400,280,800,120,'low','{"gardening"}'),
  ('gardening','tree_pruning','גיזום עצים','Tree pruning',650,400,1500,180,'low','{"gardening"}')
) as v(cat, slug, name_he, name_en, base, min_p, max_p, dur, urgency, skills)
join public.categories c on c.slug = v.cat
on conflict (category_id, slug) do nothing;

-- ── Matching weights (spec §14) ───────────────────────────────────────────
-- Sum must be 1.0; enforced by a unit test on the domain layer.
insert into public.settings (key, value, description) values
  ('matching.weights', '{
     "routeOpportunity": 0.25,
     "skillMatch":       0.20,
     "availability":     0.15,
     "eta":              0.10,
     "reliability":      0.10,
     "rating":           0.10,
     "price":            0.05,
     "experience":       0.05
   }'::jsonb,
   'Relative weight of each matching signal. Must sum to 1.0 (spec §14).'),

  -- ── Dispatch waves (spec §16) ───────────────────────────────────────────
  ('dispatch.waves', '{
     "waves": [
       { "wave": 1, "radiusKm": 5,  "maxProviders": 5, "responseTimeoutSeconds": 45 },
       { "wave": 2, "radiusKm": 10, "maxProviders": 5, "responseTimeoutSeconds": 45 },
       { "wave": 3, "radiusKm": 20, "maxProviders": 8, "responseTimeoutSeconds": 60 }
     ],
     "minCandidatesPerWave": 1,
     "offerTtlSeconds": 60
   }'::jsonb,
   'Dispatch wave radii, fan-out size and response timeouts (spec §16).'),

  ('matching.thresholds', '{
     "maxLocationAgeSeconds":      120,
     "maxLocationAccuracyMeters":  500,
     "minRouteOpportunityDeviationMinutes": 6,
     "candidateHardLimit":         50,
     "minScoreToOffer":            25
   }'::jsonb,
   'Freshness and quality gates applied before a provider can be offered a job.'),

  ('location.update_intervals', '{
     "OFFLINE":  null,
     "ONLINE":   60,
     "EN_ROUTE": 10,
     "BUSY":     120
   }'::jsonb,
   'Seconds between provider location reports per state (spec §18). null = no tracking.'),

  ('job.timeouts', '{
     "customerConfirmSeconds":      120,
     "autoCompleteAfterHours":      24,
     "searchGiveUpSeconds":         300
   }'::jsonb,
   'Server-side lifecycle timeouts.'),

  ('pricing.commission', '{
     "note": "Authoritative rules live in platform_fees; this key documents the default."
   }'::jsonb,
   'Pointer to the fee model (spec §28).')
on conflict (key) do nothing;

-- ── Commission model (spec §28): tiered 15% up to ₪1,000, 10% above ───────
-- Amounts are in agorot: 100000 agorot = ₪1,000.
insert into public.platform_fees (name, category_id, fee_type, config, priority, is_active)
select 'Default tiered commission', null, 'tiered',
  '{
     "tiers": [
       { "upTo": 100000, "percentage": 15 },
       { "upTo": null,   "percentage": 10 }
     ],
     "minFee": 0
   }'::jsonb,
  100, true
where not exists (
  select 1 from public.platform_fees where category_id is null and is_active
);

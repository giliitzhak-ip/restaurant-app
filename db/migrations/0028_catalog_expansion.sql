-- ===========================================================================
-- 0028 — 39 more services across the seven existing categories
--
-- The catalog held 23 services, which is thin enough that a provider's actual
-- trade was often absent — and an absent trade is not a small inconvenience:
-- with nothing declared, find_candidate_providers cannot return them at all.
-- D-022 gave them a way to propose one; this reduces how often they need to,
-- which is the better fix for anything predictable enough to anticipate.
--
-- Every service here carries TRIGGER PHRASES, for the reason D-022 spells
-- out: the classifier routes a customer's description to a service by
-- matching phrasings, so a service without any is unreachable by every
-- description. A silent catalog entry is worse than no entry — it looks like
-- coverage and provides none.
--
-- The phrases go in DATA rather than into SERVICE_RULES in TypeScript. That
-- is deliberate: it puts the bulk of the catalog through the same path an
-- admin-approved trade uses, so that path is exercised constantly instead of
-- only by the occasional approval.
--
-- How phrases are written, and why it matters
-- -------------------------------------------
-- A phrase matches when ALL of its meaningful tokens appear in the text, and
-- longer phrases score higher. So the specific form is the safe one:
-- 'הביוב עולה בכל הבית' (4 tokens) beats the existing 'הביוב עולה'
-- (2 tokens) when a customer says the longer thing, and loses to it when they
-- do not — which is the behaviour wanted in both directions.
--
-- Token matching is by substring, so morphology does not carry:
-- 'החלפת דוד' does NOT match "צריך להחליף דוד". Where a customer would
-- plausibly use another form, it is listed as its own phrase rather than
-- assumed. Weak phrases are single generic words that must never decide
-- anything on their own (R-019).
--
-- required_skills is left empty on purpose: dispatch resolves it as
-- coalesce(nullif(s.required_skills,'{}'), c.required_skills), so an empty
-- set inherits the category's requirements rather than dropping them.
-- ===========================================================================

insert into public.services
  (category_id, slug, name_he, base_price_ils, min_price_ils, max_price_ils,
   duration_min, default_urgency, strong_phrases, weak_phrases)
select c.id, v.slug, v.name_he, v.base, v.min_p, v.max_p,
       v.duration, v.urgency::urgency_level, v.strong, v.weak
  from (values
  -- ── אינסטלציה ───────────────────────────────────────────────────────────
  ('plumbing','faucet_replace','החלפת ברז',240,180,400,60,'normal',
   array['החלפת ברז','להחליף ברז','הברז דולף','ברז מטפטף'],array['ברז']),
  ('plumbing','appliance_water_hookup','חיבור מדיח או מכונת כביסה',280,200,450,60,'normal',
   array['חיבור מכונת כביסה','לחבר מכונת כביסה','התקנת מדיח','חיבור מדיח כלים'],array['מדיח']),
  ('plumbing','leak_detection','איתור נזילה',450,320,800,90,'high',
   array['איתור נזילה','נזילה בקיר','רטיבות בקיר','לא מוצאים מאיפה הנזילה'],array['רטיבות']),
  ('plumbing','main_drain_clearing','פתיחת סתימה בביוב ראשי',650,450,1200,120,'high',
   array['סתימה בביוב הראשי','ביוב ראשי סתום','ניקוי צינורות בלחץ','הביוב עולה בכל הבית'],array['ביוב']),
  ('plumbing','water_heater_replace','החלפת דוד',1400,900,2600,180,'normal',
   array['החלפת דוד','להחליף דוד','דוד חדש','הדוד מחליד'],array[]::text[]),
  ('plumbing','pipe_replace','החלפת צנרת',1800,1000,4000,240,'normal',
   array['החלפת צנרת','להחליף צנרת','צנרת מיושנת','שיפוץ צנרת'],array['צנרת']),

  -- ── חשמל ────────────────────────────────────────────────────────────────
  ('electrical','panel_replace','החלפת לוח חשמל',1500,900,3000,240,'normal',
   array['החלפת לוח חשמל','להחליף לוח חשמל','לוח חשמל מיושן','ארון חשמל'],array[]::text[]),
  ('electrical','new_outlet','התקנת נקודת חשמל',320,220,550,90,'normal',
   array['התקנת שקע','להוסיף שקע','נקודת חשמל חדשה','שקע חדש'],array[]::text[]),
  ('electrical','shutter_repair','תיקון תריס חשמלי',380,260,650,90,'normal',
   array['תריס חשמלי לא עובד','תיקון תריס חשמלי','התריס לא נסגר','התריס לא עולה'],array['תריס']),
  ('electrical','rcd_install','התקנת מפסק פחת',420,300,700,90,'normal',
   array['מפסק פחת','הפחת קופץ','התקנת מפסק פחת'],array['פחת']),
  ('electrical','electrical_inspection','בדיקת חשמל ודוח בודק',450,300,800,120,'normal',
   array['בדיקת חשמל','דוח בודק חשמל','אישור בודק חשמל'],array[]::text[]),
  ('electrical','intercom_repair','תיקון אינטרקום',350,250,600,90,'normal',
   array['אינטרקום לא עובד','תיקון אינטרקום','הדלת לא נפתחת מהאינטרקום'],array['אינטרקום']),
  ('electrical','ev_charger','התקנת עמדת טעינה לרכב חשמלי',2200,1400,4000,240,'normal',
   array['עמדת טעינה','טעינה לרכב חשמלי','עמוד טעינה לרכב'],array[]::text[]),

  -- ── מיזוג אוויר ─────────────────────────────────────────────────────────
  ('air_conditioning','ac_smell','ריח רע מהמזגן',280,200,420,60,'normal',
   array['ריח רע מהמזגן','המזגן מריח','ריח מהמזגן'],array[]::text[]),
  ('air_conditioning','ac_no_power','המזגן לא נדלק',320,240,520,60,'high',
   array['המזגן לא נדלק','מזגן לא עובד בכלל','המזגן לא מגיב לשלט'],array[]::text[]),
  ('air_conditioning','ac_relocate','פירוק והתקנת מזגן מחדש',1100,700,2000,240,'normal',
   array['פירוק והתקנת מזגן','פירוק מזגן','להעביר מזגן לדירה חדשה'],array['מעבר דירה']),
  ('air_conditioning','ac_mini_central','תיקון מיני מרכזי',480,350,900,120,'normal',
   array['מיני מרכזי לא עובד','תיקון מיני מרכזי','מזגן מיני מרכזי'],array['מיני מרכזי']),
  ('air_conditioning','ac_gas_refill','מילוי גז למזגן',420,300,700,90,'normal',
   array['מילוי גז למזגן','תוספת גז למזגן','נגמר הגז במזגן'],array[]::text[]),

  -- ── מנעולנות ────────────────────────────────────────────────────────────
  ('locksmith','safe_opening','פריצת כספת',650,400,1500,90,'normal',
   array['פריצת כספת','כספת נעולה','שכחתי קוד לכספת'],array['כספת']),
  ('locksmith','car_key_duplicate','שכפול מפתח לרכב',550,350,1200,90,'normal',
   array['שכפול מפתח לרכב','אבד מפתח הרכב','קודן לרכב לא עובד'],array[]::text[]),
  ('locksmith','multilock_repair','תיקון מנעול רב בריח',480,320,900,90,'normal',
   array['רב בריח','מנעול רב בריח','הדלת לא ננעלת'],array['מנעול']),
  ('locksmith','stuck_door','שחרור דלת תקועה',350,250,600,60,'high',
   array['דלת תקועה','המנעול לא מסתובב','המפתח נשבר במנעול'],array[]::text[]),

  -- ── הדברה ───────────────────────────────────────────────────────────────
  ('pest_control','mosquitoes','הדברת יתושים',380,280,600,60,'normal',
   array['הדברת יתושים','המון יתושים','יתושים בבית'],array['יתושים']),
  ('pest_control','fleas_ticks','הדברת פרעושים וקרציות',450,320,700,90,'high',
   array['הדברת פרעושים','פרעושים בבית','קרציות'],array['פרעושים']),
  ('pest_control','wasps','טיפול בקן צרעות',450,300,800,60,'high',
   array['קן צרעות','צרעות במרפסת','כוורת דבורים'],array['צרעות']),
  ('pest_control','pigeons','מיגון מפני יונים',750,500,1500,120,'normal',
   array['מיגון מפני יונים','יונים במרפסת','קן יונים'],array['יונים']),
  ('pest_control','termites','טיפול בטרמיטים',900,600,2000,120,'high',
   array['טרמיטים','נמלים לבנות'],array[]::text[]),

  -- ── ניקיון ──────────────────────────────────────────────────────────────
  ('cleaning','sofa_carpet','ניקוי ספות ושטיחים',450,300,900,120,'normal',
   array['ניקוי ספות','ניקוי שטיחים','ניקוי ספה בקיטור'],array['שטיח']),
  ('cleaning','floor_polish','פוליש לרצפה',600,400,1200,180,'normal',
   array['פוליש','הברקת רצפה','ניקוי רצפות לעומק'],array[]::text[]),
  ('cleaning','windows','ניקוי חלונות',350,250,700,120,'normal',
   array['ניקוי חלונות','לנקות חלונות','ניקוי תריסים וחלונות'],array['חלונות']),
  ('cleaning','junk_removal','פינוי גרוטאות ופסולת',700,450,1500,180,'normal',
   array['פינוי גרוטאות','פינוי פסולת','לפנות מחסן'],array['גרוטאות']),
  ('cleaning','office_cleaning','ניקיון משרדים',550,350,1200,180,'normal',
   array['ניקיון משרד','ניקיון משרדים','ניקוי משרד'],array[]::text[]),
  ('cleaning','move_cleaning','ניקיון לפני או אחרי מעבר דירה',800,500,1600,240,'normal',
   array['ניקיון לפני מעבר דירה','ניקיון אחרי מעבר','ניקיון דירה ריקה'],array[]::text[]),

  -- ── גינון ───────────────────────────────────────────────────────────────
  ('gardening','lawn_mowing','כיסוח דשא',280,200,500,60,'normal',
   array['כיסוח דשא','לכסח את הדשא','הדשא גבוה'],array['דשא']),
  ('gardening','irrigation','התקנת מערכת השקיה',900,600,2000,240,'normal',
   array['מערכת השקיה','טפטפות בגינה','ממטרות לא עובדות'],array['השקיה']),
  ('gardening','garden_design','עיצוב והקמת גינה',1500,800,4000,300,'low',
   array['עיצוב גינה','הקמת גינה','לתכנן גינה חדשה'],array[]::text[]),
  ('gardening','tree_felling','כריתת עץ',1200,700,3000,240,'normal',
   array['כריתת עץ','לכרות עץ','עץ מסוכן שצריך להוריד'],array[]::text[]),
  ('gardening','weed_fertilize','דישון והדברת עשבייה',400,280,700,90,'low',
   array['הדברת עשבייה','עשבים שוטים','דישון הגינה'],array['עשבייה']),
  ('gardening','synthetic_grass','התקנת דשא סינתטי',2200,1200,5000,300,'low',
   array['דשא סינתטי','להתקין דשא סינתטי'],array[]::text[])
  ) as v(category_slug, slug, name_he, base, min_p, max_p, duration, urgency, strong, weak)
  join public.categories c on c.slug = v.category_slug
on conflict (category_id, slug) do update
  set name_he        = excluded.name_he,
      base_price_ils = excluded.base_price_ils,
      min_price_ils  = excluded.min_price_ils,
      max_price_ils  = excluded.max_price_ils,
      duration_min   = excluded.duration_min,
      default_urgency = excluded.default_urgency,
      strong_phrases = excluded.strong_phrases,
      weak_phrases   = excluded.weak_phrases;

-- Sanity, enforced rather than trusted: no service in the shipped catalog may
-- be unreachable. `custom_` services come from admin approval, which already
-- requires phrases at two levels.
do $$
declare
  v_silent integer;
begin
  select count(*) into v_silent
    from public.services s
    join public.categories c on c.id = s.category_id
   where s.is_active
     and s.slug not like 'custom_%'
     and cardinality(s.strong_phrases) = 0
     -- The 23 original services are matched by the built-in TypeScript rules
     -- instead, so they are reachable without DB phrases.
     and s.slug not in (
       'boiler_issue','burst_pipe','toilet_repair','blocked_drain','sink_leak',
       'light_fixture','socket_repair','short_circuit','power_outage',
       'ac_install','ac_leaking','ac_service','ac_not_cooling',
       'car_lockout','lock_replacement','locked_out',
       'rodents','ants','cockroaches',
       'post_renovation','apartment_cleaning',
       'tree_pruning','garden_maintenance'
     );
  if v_silent > 0 then
    raise exception 'migration 0028: % service(s) have no trigger phrases and would be unreachable', v_silent;
  end if;
end $$;

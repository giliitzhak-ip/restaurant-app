-- ===========================================================================
-- 0030 — a service has two names, because two different people read it
--
-- `services.name_he` is the CUSTOMER's words. That is deliberate and it has
-- to stay: the classifier routes a description to a service, the customer
-- sees what we understood, and "מזגן לא מקרר" is what a person types when
-- their air conditioner stops cooling.
--
-- The registration form then showed that same list to a PROVIDER and asked
-- "מה אתם עושים, ובכמה?". A technician searching "גז" was offered "מזגן לא
-- מקרר", "המזגן לא נדלק", "מזגן מטפטף" — a list of symptoms where a list of
-- services belonged. It is not a wording nit: it reads as though the platform
-- does not know what the trade is, and a professional pricing "ננעלתי מחוץ
-- לבית" is being asked to price somebody else's sentence.
--
-- So the provider's name for the work gets its own column. Both names point
-- at one service row, so nothing about matching, pricing or the classifier
-- changes — only which of the two a given screen shows. Customer-facing
-- surfaces keep name_he; the registration form and the provider's own
-- service list use provider_label.
--
-- Nullable, and read through coalesce, so a service created before this
-- migration or by an approval that did not set one still renders.
-- ===========================================================================

alter table public.services add column if not exists provider_label text;

comment on column public.services.provider_label is
  'What a provider calls this work ("פתיחת דלתות נעולות"), where name_he is '
  'what a customer calls the problem ("ננעלתי מחוץ לבית"). Read through '
  'coalesce(provider_label, name_he) — see migration 0030.';

update public.services s
   set provider_label = v.label
  from (values
    -- ── Plumbing ─────────────────────────────────────────────────────────
    ('pipe_replace',            'החלפת צנרת'),
    ('water_heater_replace',    'החלפת דודים'),
    ('main_drain_clearing',     'פתיחת סתימות בביוב ראשי'),
    ('burst_pipe',              'תיקון פיצוץ צינור'),
    ('leak_detection',          'איתור נזילות'),
    ('boiler_issue',            'תיקון דודים'),
    ('blocked_drain',           'פתיחת סתימות'),
    ('sink_leak',               'תיקון נזילות בכיור'),
    ('appliance_water_hookup',  'חיבור מדיח ומכונת כביסה'),
    ('toilet_repair',           'תיקון אסלות'),
    ('faucet_replace',          'החלפת ברזים'),
    -- ── Electrical ───────────────────────────────────────────────────────
    ('ev_charger',              'התקנת עמדות טעינה לרכב חשמלי'),
    ('panel_replace',           'החלפת לוחות חשמל'),
    ('electrical_inspection',   'בדיקת חשמל ודוח בודק'),
    ('rcd_install',             'התקנת מפסקי פחת'),
    ('shutter_repair',          'תיקון תריסים חשמליים'),
    ('short_circuit',           'איתור ותיקון קצר חשמלי'),
    ('intercom_repair',         'תיקון אינטרקום'),
    ('new_outlet',              'התקנת נקודות חשמל'),
    ('power_outage',            'טיפול בהפסקות חשמל'),
    ('light_fixture',           'התקנת גופי תאורה'),
    ('socket_repair',           'תיקון שקעים'),
    -- ── Air conditioning ─────────────────────────────────────────────────
    ('ac_relocate',             'פירוק והתקנת מזגנים'),
    ('ac_install',              'התקנת מזגנים'),
    ('ac_mini_central',         'תיקון מיני מרכזי'),
    ('ac_gas_refill',           'מילוי גז למזגן'),
    ('ac_not_cooling',          'תיקון מזגן שלא מקרר'),
    ('ac_no_power',             'תיקון מזגן שלא נדלק'),
    ('ac_leaking',              'תיקון נזילות ממזגן'),
    ('ac_smell',                'טיפול בריחות מהמזגן'),
    ('ac_service',              'ניקוי וטיפול תקופתי למזגן'),
    -- ── Locksmith ────────────────────────────────────────────────────────
    ('safe_opening',            'פריצת כספות'),
    ('car_key_duplicate',       'שכפול מפתחות לרכב'),
    ('multilock_repair',        'תיקון מנעולי רב בריח'),
    ('car_lockout',             'פתיחת רכבים נעולים'),
    ('stuck_door',              'שחרור דלתות תקועות'),
    ('locked_out',              'פתיחת דלתות נעולות'),
    ('lock_replacement',        'החלפת צילינדרים'),
    -- ── Pest control ─────────────────────────────────────────────────────
    ('termites',                'טיפול בטרמיטים'),
    ('pigeons',                 'מיגון מפני יונים'),
    ('rodents',                 'הדברת מכרסמים'),
    ('fleas_ticks',             'הדברת פרעושים וקרציות'),
    ('wasps',                   'טיפול בקיני צרעות'),
    ('cockroaches',             'הדברת תיקנים'),
    ('mosquitoes',              'הדברת יתושים'),
    ('ants',                    'הדברת נמלים'),
    -- ── Cleaning ─────────────────────────────────────────────────────────
    ('post_renovation',         'ניקיון אחרי שיפוץ'),
    ('move_cleaning',           'ניקיון לפני ואחרי מעבר דירה'),
    ('junk_removal',            'פינוי גרוטאות ופסולת'),
    ('floor_polish',            'פוליש לרצפות'),
    ('office_cleaning',         'ניקיון משרדים'),
    ('sofa_carpet',             'ניקוי ספות ושטיחים'),
    ('apartment_cleaning',      'ניקיון דירות'),
    ('windows',                 'ניקוי חלונות'),
    -- ── Gardening ────────────────────────────────────────────────────────
    ('synthetic_grass',         'התקנת דשא סינתטי'),
    ('garden_design',           'עיצוב והקמת גינות'),
    ('tree_felling',            'כריתת עצים'),
    ('irrigation',              'התקנת מערכות השקיה'),
    ('tree_pruning',            'גיזום עצים'),
    ('garden_maintenance',      'תחזוקת גינות'),
    ('weed_fertilize',          'דישון והדברת עשבייה'),
    ('lawn_mowing',             'כיסוח דשא')
  ) as v(slug, label)
 where s.slug = v.slug;

-- Every shipped service must carry one. A missing label falls back to the
-- customer's words, which is exactly the mixed list this migration exists to
-- end — so it fails here rather than surfacing quietly in the form.
do $$
declare missing text;
begin
  select string_agg(slug, ', ') into missing
    from public.services
   where slug not like 'custom_%'
     and provider_label is null;

  if missing is not null then
    raise exception 'services with no provider_label: %', missing;
  end if;
end $$;

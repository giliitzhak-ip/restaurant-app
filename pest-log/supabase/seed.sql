-- ─────────────────────────────────────────────────────────────────────────────
-- seed — נתוני דוגמה לסביבת פיתוח ובדיקות.
--
-- ⚠ כל הנתונים כאן בדיוניים. אין להשתמש בפרטי לקוחות אמיתיים.
-- ⚠ קטלוג המזיקים ומאגר התכשירים כאן הם דוגמאות בלבד, ואינם נספח א׳ הרשמי
--   ואינם רשימת תכשירים מאושרת. הטעינה האמיתית מתבצעת דרך
--   scripts/import-catalog.mjs ממקור מאומת.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ארגון א׳ ─────────────────────────────────────────────────────────────────
insert into public.organizations (id, name, legal_name, business_number, phone, email, address)
values (
  '00000000-0000-4000-8000-000000000001',
  'יצחק אחזקות והדברות',
  'יצחק אחזקות והדברות בע״מ',
  '000000000',
  '04-0000000',
  'demo-org-a@example.test',
  'רחוב הדוגמה 1, עיר הדוגמה'
) on conflict (id) do nothing;

-- ── ארגון ב׳ — קיים כדי לבדוק בידוד בין ארגונים (RLS) ────────────────────────
insert into public.organizations (id, name, email)
values ('00000000-0000-4000-8000-000000000002', 'הדברות דוגמה ב׳', 'demo-org-b@example.test')
on conflict (id) do nothing;

-- ── משתמשים ──────────────────────────────────────────────────────────────────
-- ב-Supabase המשתמשים נוצרים דרך Auth. כאן נוצרות שורות auth.users רק אם
-- הסכמה המקומית קיימת (בדיקות), כדי שמפתחות זרים יהיו תקפים.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users') then
    insert into auth.users (id, email) values
      ('00000000-0000-4000-9000-00000000000a', 'exterminator-a@example.test'),
      ('00000000-0000-4000-9000-00000000000b', 'manager-a@example.test'),
      ('00000000-0000-4000-9000-00000000000c', 'exterminator-b@example.test')
    on conflict (id) do nothing;
  end if;
end $$;

insert into public.profiles (id, organization_id, user_id, full_name, email, phone, role) values
  ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-9000-00000000000a', 'מדביר דוגמה א׳', 'exterminator-a@example.test', '0500000001', 'exterminator'),
  ('00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-9000-00000000000b', 'מנהל דוגמה א׳', 'manager-a@example.test', '0500000002', 'owner'),
  ('00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-9000-00000000000c', 'מדביר דוגמה ב׳', 'exterminator-b@example.test', '0500000003', 'owner')
on conflict (id) do nothing;

-- ── רישיונות ─────────────────────────────────────────────────────────────────
insert into public.pesticide_licenses
  (id, organization_id, profile_id, holder_name, license_type, license_number, mobile, email, address, valid_from, valid_until)
values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-a000-00000000000a', 'מדביר דוגמה א׳', 'הדברה תברואית', 'DEMO-0001',
   '0500000001', 'exterminator-a@example.test', 'רחוב הדוגמה 1, עיר הדוגמה', '2026-01-01', '2029-12-31'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-a000-00000000000a', 'מדביר דוגמה א׳', 'איוד', 'DEMO-0002',
   '0500000001', 'exterminator-a@example.test', 'רחוב הדוגמה 1, עיר הדוגמה', '2026-01-01', '2029-12-31')
on conflict (id) do nothing;

-- ── מזמינים ואתרים ───────────────────────────────────────────────────────────
insert into public.clients (id, organization_id, name, is_private_person, phone, mobile, email, contact_role, address) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-8000-000000000001',
   'ועד בית דוגמה', false, '040000001', '0500000010', 'vaad@example.test', 'יו״ר ועד הבית', 'רחוב הדוגמה 10, עיר הדוגמה'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-8000-000000000001',
   'לקוח פרטי לדוגמה', true, '0500000011', '0500000011', 'private@example.test', 'בעל הדירה', 'רחוב הדוגמה 12/3, עיר הדוגמה'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-8000-000000000001',
   'רשות מקומית לדוגמה', false, '040000002', null, 'muni@example.test', 'מנהל מחלקת תברואה', 'כיכר הדוגמה 1')
on conflict (id) do nothing;

insert into public.client_sites
  (id, organization_id, client_id, label, place_kind, city, street, house_number, apartment_number, structure_type)
values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-c000-000000000001', 'חדר אשפה — רחוב הדוגמה 10', 'dwelling',
   'עיר הדוגמה', 'רחוב הדוגמה', '10', null, 'בניין משותף'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-c000-000000000002', 'דירה 3 — רחוב הדוגמה 12', 'dwelling',
   'עיר הדוגמה', 'רחוב הדוגמה', '12', '3', 'דירה בבניין')
on conflict (id) do nothing;

insert into public.client_sites
  (id, organization_id, client_id, label, place_kind, local_authority_name, site_type, site_description, coordinates)
values
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-c000-000000000003', 'גן ציבורי לדוגמה', 'open_area',
   'רשות מקומית לדוגמה', 'גן ציבורי', 'גן ציבורי עם מתקני משחק ופחי אשפה בהיקפו',
   '{"system":"wgs84","latitude":32.0853,"longitude":34.7818}'::jsonb)
on conflict (id) do nothing;

insert into public.client_sites
  (id, organization_id, client_id, label, place_kind, city, local_authority_name, neighborhood_name, area_description, coordinates)
values
  ('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-c000-000000000003', 'שכונת הדוגמה — ערפול', 'fogging_area',
   'עיר הדוגמה', 'רשות מקומית לדוגמה', 'שכונת הדוגמה',
   'שטחים ציבוריים פתוחים בשכונה, כולל שדרה מרכזית וערוץ ניקוז',
   '{"system":"wgs84","latitude":32.09,"longitude":34.79}'::jsonb)
on conflict (id) do nothing;

-- ── מאגר תכשירים — נתוני דוגמה בלבד ──────────────────────────────────────────
-- שימו לב ל-source_name ול-verified_at: כל שורה נושאת אסמכתה. שורות הדוגמה
-- מסומנות במפורש כלא-מאומתות מול מקור רשמי, ולכן הממשק יציג עליהן אזהרה.
insert into public.products (
  id, organization_id, trade_name, active_ingredient_name, active_ingredient_concentration_percent,
  ready_to_use, registration_status, registration_number, label_url, valid_until,
  approved_pests, approved_application_methods, source_name, source_url, verified_at, notes
) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-8000-000000000001',
   'תכשיר דוגמה ריכוז', 'חומר פעיל לדוגמה A', 10.000, false, 'unknown', null, null, null,
   array['מזיק דוגמה 1', 'מזיק דוגמה 2'], array['ריסוס', 'ריסוס נקודתי'],
   'נתוני דוגמה — אינו מקור רשמי', null, now(),
   'שורת דוגמה לפיתוח. יש להחליף בנתונים מאומתים מהמקור הרשמי לפני שימוש אמיתי.'),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-8000-000000000001',
   'תכשיר דוגמה מוכן לשימוש', 'חומר פעיל לדוגמה B', 0.050, true, 'unknown', null, null, null,
   array['מזיק דוגמה 1'], array['מִשחה / ג׳ל', 'תחנות האכלה'],
   'נתוני דוגמה — אינו מקור רשמי', null, now(),
   'שורת דוגמה לפיתוח. תכשיר מוכן לשימוש — הריכוז במוכן לשימוש זהה לריכוז בתכשיר.')
on conflict (id) do nothing;

-- ── קטלוג מזיקים — נתוני דוגמה, אינו נספח א׳ ─────────────────────────────────
insert into public.pest_catalog (organization_id, code, name_he, group_name, source_name, verified_at) values
  ('00000000-0000-4000-8000-000000000001', 'DEMO-01', 'מזיק דוגמה 1', 'קבוצת דוגמה', 'נתוני דוגמה — אינו נספח א׳ הרשמי', now()),
  ('00000000-0000-4000-8000-000000000001', 'DEMO-02', 'מזיק דוגמה 2', 'קבוצת דוגמה', 'נתוני דוגמה — אינו נספח א׳ הרשמי', now())
on conflict (organization_id, code) do nothing;

-- ── תבניות אזהרה — הצעה בלבד, דורשות אישור מדביר בכל יומן ────────────────────
insert into public.warning_templates (
  id, organization_id, title, product_id, treatment_nature_description, risks_to_humans,
  risks_to_animals, re_entry_hours, additional_label_instructions, during_treatment_info,
  after_treatment_info, label_reference
) values (
  '00000000-0000-4000-f000-000000000001', '00000000-0000-4000-8000-000000000001',
  'תבנית דוגמה — ריסוס נקודתי', '00000000-0000-4000-e000-000000000001',
  'תיאור דוגמה של טיב ההדברה. יש להתאים לתווית התכשיר בפועל.',
  'תיאור דוגמה של סיכונים לאדם. יש להעתיק מתווית התכשיר.',
  'תיאור דוגמה של סיכונים לבעלי חיים. יש להעתיק מתווית התכשיר.',
  4.0,
  'הוראות דוגמה לפי תווית. יש להחליף בתוכן התווית בפועל.',
  'מידע דוגמה למהלך ההדברה.',
  'מידע דוגמה לסיום ההדברה.',
  'תווית דוגמה — נדרש לעדכן לאסמכתת התווית בפועל'
) on conflict (id) do nothing;

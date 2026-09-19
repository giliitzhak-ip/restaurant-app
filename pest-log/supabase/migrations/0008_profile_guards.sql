-- ─────────────────────────────────────────────────────────────────────────────
-- 0008 — חסימת הסלמת הרשאות בפרופילים.
--
-- למה זה קובץ נפרד: הניסיון הראשון אכף את הכלל בתוך WITH CHECK של מדיניות
-- ה-RLS, באמצעות פונקציה שקוראת מחדש את public.profiles
-- (role = app.current_role_name()). זה לא עבד: הפונקציה נקראת בתוך אותה
-- פקודת UPDATE וראתה את הערך החדש, ולכן משתמש הצליח לשנות את תפקידו
-- ל-owner. הבדיקה tests/rls/isolation.test.ts תפסה את זה.
--
-- הכלל נאכף כאן בטריגר שמשווה OLD ל-NEW ישירות — בלי תלות ב-snapshot
-- ובלי קריאה חוזרת לטבלה.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function app.guard_profile_privileges()
returns trigger
language plpgsql
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- קריאות service_role / תחזוקה בשרת (auth.uid() ריק) אינן מוגבלות:
  -- שיוך משתמשים וקביעת תפקידים נעשים שם.
  if v_actor is null then
    return new;
  end if;

  -- שיוך לארגון אינו ניתן לשינוי מצד הלקוח, בשום תפקיד.
  if new.organization_id is distinct from old.organization_id then
    raise exception 'לא ניתן לשנות את שיוך המשתמש לארגון.' using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    -- אף אחד אינו משנה את תפקידו של עצמו, גם לא מנהל.
    if old.user_id = v_actor then
      raise exception 'לא ניתן לשנות את התפקיד של עצמך.' using errcode = '42501';
    end if;
    -- תפקיד של משתמש אחר משתנה בידי מנהל בלבד.
    if not app.is_org_admin() then
      raise exception 'שינוי תפקיד מותר למנהל בלבד.' using errcode = '42501';
    end if;
  end if;

  -- user_id הוא זהות המשתמש ואינו ניתן להחלפה.
  if new.user_id is distinct from old.user_id then
    raise exception 'לא ניתן לשנות את מזהה המשתמש בפרופיל.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_privileges on public.profiles;
create trigger trg_profiles_privileges
  before update on public.profiles
  for each row execute function app.guard_profile_privileges();

-- המדיניות עצמה חוזרת להיות פשוטה: מי נוגע בשורה. מה מותר לשנות בה
-- נאכף בטריגר שלמעלה.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = auth.uid() and deleted_at is null)
  with check (user_id = auth.uid());

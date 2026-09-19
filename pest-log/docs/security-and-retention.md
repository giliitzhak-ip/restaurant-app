# אבטחה, פרטיות ושמירת מידע

## מודל האבטחה בקצרה

| שכבה | מה מגן | איפה |
| --- | --- | --- |
| הזדהות | קישור התחברות / קוד חד-פעמי, בלי סיסמאות | Supabase Auth, `src/lib/supabase.ts` |
| הרשאות | Row Level Security על **כל** הטבלאות, עם FORCE | `supabase/migrations/0006_rls.sql` |
| פעולות רגישות | פונקציות `SECURITY DEFINER` שפתוחות ל-`service_role` בלבד | `0005_functions.sql` |
| נעילת מסמך | טריגרים שחוסמים שינוי ומחיקה של יומן שהושלם | `0004_triggers.sql` |
| הסלמת הרשאות | טריגר שמשווה OLD/NEW בפרופילים | `0008_profile_guards.sql` |
| קבצים | bucket פרטי, שמות אקראיים, signed URLs קצרי-מועד | `src/lib/storage.ts`, `0007_storage.sql` |
| דפדפן | CSP, `nosniff`, `no-referrer` | `vite.config.ts` |
| שרת | אימות JWT, CORS מוגבל, rate limiting, הגבלת גודל גוף | `server/auth.ts`, `server/index.ts` |

## הזדהות

- **אין סיסמאות.** ההתחברות היא בקישור חד-פעמי (magic link) או בקוד בן שש
  ספרות לאותה כתובת דוא״ל.
- `shouldCreateUser: false` — לא נוצרים משתמשים מעצמם. מנהל העסק מוסיף
  משתמש, ורק אז ניתן להתחבר.
- שגיאות ההתחברות מתורגמות לעברית ואינן מגלות אם הכתובת קיימת במערכת
  יותר מהנדרש.
- הטוקן מתחדש אוטומטית; השרת מאמת חתימה, תוקף ו-`aud`.

## Row Level Security

RLS מופעל עם `FORCE` על כל 18 הטבלאות — כך שגם בעל הטבלה אינו עוקף אותו בטעות.

**עקרון:** הארגון של המשתמש נקבע מהפרופיל שלו (`app.current_org_id()`),
**לעולם לא מפרמטר שנשלח מהלקוח.**

```
משתמש → profiles.organization_id → כל השאילתות מסוננות לפי הארגון הזה
```

### מה נבדק בבדיקות (`tests/rls/isolation.test.ts`, 40 בדיקות)

- משתמש מארגון א׳ אינו רואה יומנים, מזמינים, אתרים, תכשירים, קטלוג,
  תבניות, רישיונות, ממצאים, חתימות או קבצים של ארגון ב׳.
- ניסיון כתיבה לארגון אחר נדחה (`42501`).
- לא ניתן להעביר יומן או פרופיל לארגון אחר.
- משתמש אינו יכול להעלות את דרגתו; גם מנהל אינו משנה את תפקידו של עצמו.
- `audit_events` נראה למנהל בלבד, ואינו ניתן לכתיבה מהלקוח.
- לתפקיד `anon` אין הרשאות על אף טבלה.

> **הערה על באג שנמצא ותוקן בפיתוח:** הניסיון הראשון אכף את איסור הסלמת
> ההרשאות בתוך `WITH CHECK` של המדיניות, באמצעות פונקציה שקראה מחדש את
> `profiles`. הפונקציה נקראה בתוך אותה פקודת `UPDATE` וראתה את הערך החדש,
> ולכן מדביר הצליח לשנות את תפקידו ל-`owner`. הבדיקה תפסה את זה, והכלל
> הועבר לטריגר שמשווה `OLD` ל-`NEW`. הלקח: **אין לאכוף אי-שינוי של שדה
> ע"י קריאה חוזרת לאותה טבלה מתוך מדיניות.**

## פעולות שהלקוח אינו יכול לבצע

`complete_pest_log` ו-`open_pest_log_correction` נשללו מ-`authenticated`
ופתוחות ל-`service_role` בלבד. הלקוח קורא לשירות השרת, שמאמת JWT, מריץ את
ולידציית ה-Zod ורק אז קורא ל-RPC. כך אי אפשר להשלים יומן בעקיפת הוולידציה.

הפונקציות שכן פתוחות ללקוח (`upsert_pest_log_draft`, `cancel_pest_log`,
`soft_delete_pest_log`, `record_sync_operation`) הן `SECURITY DEFINER` ולכן
עוקפות RLS — ולכן כל אחת מהן אוכפת בעצמה את הארגון של הקורא ומתעלמת
מ-`p_actor` כשיש `auth.uid()`.

## קבצים, תמונות ו-PDF

- bucket `pest-log-files`, **פרטי**.
- מבנה הנתיב: `<organization_id>/logs/<log_id>/<סוג>/<שם אקראי>.<סיומת>`.
  מדיניות ה-storage בודקת שהמקטע הראשון שווה לארגון של המשתמש.
- **שמות הקבצים אקראיים** (16 בתים מ-`crypto`) ואינם נגזרים משם לקוח,
  מתאריך או מתוכן.
- סוגים מותרים: JPEG, PNG, WEBP, PDF. גודל מרבי 15MB — נאכף גם בלקוח
  (`validateUpload`) וגם בהגדרת ה-bucket.
- תמונות נדחסות בלקוח לפני ההעלאה (רוחב מרבי 2000px, תקציב ~1.2MB),
  בשמירה על יחס הגובה-רוחב.
- אין גישה ציבורית. כל צפייה היא דרך **signed URL** שתוקפו
  `SIGNED_URL_TTL_SECONDS` (ברירת מחדל 300 שניות).
- אין ללקוח הרשאת UPDATE או DELETE על קבצים.

## הגנות בדפדפן

CSP נבנית מ-`VITE_SUPABASE_URL` ומ-`VITE_PDF_SERVICE_URL` — בלי wildcards:

```
default-src 'self'; object-src 'none'; frame-ancestors 'none';
script-src 'self'; connect-src 'self' blob: <supabase> <pdf-service>
```

- **XSS:** React מבצע escape כברירת מחדל; אין `dangerouslySetInnerHTML`
  בקוד. בתבנית ה-PDF כל ערך עובר `escapeHtml` — יש בדיקה שמוודאת שתגית
  בשם מזמין אינה מוזרקת למסמך.
- **IDOR:** כל נתיב בשרת מאמת שהיומן שייך לארגון של המשתמש לפני כל פעולה,
  ומזהה היומן נבדק כ-UUID תקין.
- `frame-ancestors 'none'` מונע הטמעה באתר אחר.
- הערה: `frame-ancestors` אינו נאכף כשהוא מועבר ב-meta בלבד — בפריסה יש
  לשלוח את ה-CSP גם ככותרת HTTP (ראו להלן).

## שירות השרת

- כל נתיב דורש `Authorization: Bearer <jwt>` תקף.
- CORS: רק origins מ-`PDF_SERVICE_ALLOWED_ORIGINS`.
- **Rate limiting** לכל משתמש ולכל נתיב (ברירת מחדל 10 בקשות בדקה),
  עם `Retry-After`. לפריסה בכמה מופעים יש להחליף את המונה בזיכרון
  במונה משותף (Redis או טבלה ב-Postgres).
- גוף בקשה מוגבל ל-6MB.
- `Idempotency-Key` חובה בהשלמה — קריאה כפולה לא מקצה מספר סידורי נוסף.

## מידע אישי ולוגים

- לוגי השרת רושמים שיטה, נתיב, קוד תגובה וקידומת מזהה המשתמש בלבד.
  **אין** שמות, טלפונים, כתובות או תוכן יומן בלוגים.
- `audit_events.metadata` מכיל מטא-נתונים תפעוליים (מספר סידורי, hash,
  מספר ממצאים). תיעוד מסירה רושם מועד ודרך בלבד — שם המקבל כבר מתועד
  ביומן עצמו.
- מינימיזציה: המערכת אינה אוספת מידע שאינו נדרש לאחת מ-17 הדרישות.
- `signatures.signer_name` הוא מידע אישי הנדרש מפורשות בדרישה 15.

## שמירת מידע ומחיקה

| כלל | מימוש |
| --- | --- |
| שמירה ≥ 3 שנים | `organizations.retention_years`, CHECK ≥ 3 |
| אין מחיקה פיזית של יומן | טריגר חוסם `DELETE` תמיד, בכל תפקיד |
| אין מדיניות DELETE ללקוח | `pest_logs` ללא policy ל-DELETE |
| מחיקה רק אחרי התקופה | `soft_delete_pest_log` בודק `completed_at` |
| מנהל בלבד | הפונקציה דורשת `role in ('owner','manager')` |
| soft delete | `deleted_at`/`deleted_by`; ה-snapshot נשמר |
| audit | `pest_log.soft_deleted` |

`audit_events` הוא append-only: טריגר חוסם `UPDATE` ו-`DELETE`.

## גיבוי ושחזור

### גיבוי
1. **מסד הנתונים:** ב-Supabase יש גיבוי יומי מנוהל (PITR בתוכניות
   הנתמכות). מומלץ להוסיף גיבוי לוגי חוץ-ספק:
   ```bash
   pg_dump --format=custom --no-owner --file=backup-$(date +%F).dump "$DATABASE_URL"
   ```
2. **קבצים:** ה-bucket אינו נכלל ב-`pg_dump`. יש לגבות אותו בנפרד
   (Storage API או `supabase storage cp`), אחרת ישוחזרו רשומות שמפנות
   לקבצים שאינם קיימים.
3. יש לבדוק שחזור בפועל לפני שמסתמכים על הגיבוי.

### שחזור לסביבה נקייה
```bash
node scripts/migrate.mjs --url="$TARGET_DATABASE_URL"
pg_restore --clean --if-exists --no-owner --dbname="$TARGET_DATABASE_URL" backup.dump
# ואז שחזור ה-bucket
```

### ייצוא מלא
```bash
node scripts/export.mjs --url="$DATABASE_URL" --org <uuid> --out ./export
```
מייצר JSON של כל היומנים (כולל snapshot ו-hash), CSV לטבלאות, ומוריד
את כל קובצי ה-PDF. משמש לייצוא לפי דרישת בעל העסק וכעותק חוץ-ספק.

## סודות

- אין סודות בקוד ואין בהיסטוריית ה-git.
- `.env` ב-`.gitignore`; `.env.example` מכיל מפתחות מדומים בלבד.
- `.env.e2e` מכיל ערכים מדומים לבדיקות ואינו סוד.
- `SUPABASE_SERVICE_ROLE_KEY` ו-`SUPABASE_JWT_SECRET` הם **צד שרת בלבד**.
  מפתח ה-service role עוקף RLS — אין להכניסו לשום משתנה `VITE_`.
- החלפת מפתחות: לרוטט ב-Supabase, לעדכן ב-secret manager, לפרוס מחדש את
  שירות השרת. הלקוח אינו מושפע.

## רשימת בדיקה לפני עלייה לאוויר

- [ ] `.env` אמיתי הוגדר, ואינו ב-git.
- [ ] ה-CSP נשלח גם ככותרת HTTP מה-CDN/reverse proxy, לא רק ב-meta.
- [ ] HSTS ו-HTTPS בלבד.
- [ ] `PDF_SERVICE_ALLOWED_ORIGINS` מוגבל לדומיין האמיתי.
- [ ] rate limiting משותף אם יש יותר ממופע אחד של שירות השרת.
- [ ] גיבוי מסד **וגם** גיבוי bucket מוגדרים ונבדקו בשחזור.
- [ ] נטענו נספח א׳ ומאגר תכשירים ממקור מאומת (`npm run import:pest-catalog`).
- [ ] נקראו הפריטים המסומנים 🔎 ב-`docs/legal-compliance-2026.md`.
- [ ] הודעת הפרטיות עודכנה לפרטי העסק בפועל.

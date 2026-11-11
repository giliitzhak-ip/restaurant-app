# SMART MABAT AI MARKETING · מבט חכם

סוכן AI שמנהל את אינסטגרם של **SMART MABAT | מבט חכם – מבית יצחק פרוייקטים**: כותב פוסטים בעברית, מייצר תמונות ממותגות, מתזמן לפי שעון ישראל ומפרסם דרך Meta Graph API הרשמי.

> **המערכת מגיעה במצב בדיקות.** שום פוסט לא יתפרסם באינסטגרם עד שתעשו את שלושת הדברים: `PUBLISH_LIVE_ENABLED=true` ב-Vercel, חיבור אינסטגרם עם הרשאות מאומתות, והפעלת מתג "פרסום אמיתי" (כולל הקלדת המילה "פרסם").

---

## מה יש ב-MVP

| מודול | מה עובד | סטטוס |
|---|---|---|
| AI Content Agent | בחירת נושא לפי ביצועים וגיוון, כתיבה בעברית עם Claude, CTA והאשטגים, מניעת חזרות, חסימת המצאות | נבדק בבדיקות יחידה. קריאה אמיתית ל-Claude עוד לא הורצה (אין מפתח בסביבת הפיתוח) |
| בדיקות תוכן | 15 בדיקות לפני כל פרסום: אורך, עברית, CTA, 30 האשטגים, כפילות, המלצות/פרויקטים/מספרים/מפרטים/מחירים מומצאים | נבדק |
| AI Image Generator | OpenAI gpt-image-1, חיתוך 4:5, פס מותג, **כותרת בעברית RTL**, לוגו | עיבוד המיתוג נבדק. קריאה אמיתית ל-OpenAI עוד לא הורצה |
| ספריית תמונות | העלאה מהאייפון (המרה אוטומטית מ-HEIC ל-JPEG), שימוש בתמונות אמיתיות | נבנה, טרם נבדק מול Supabase אמיתי |
| Instagram Publisher | Graph API רשמי, תור, נעילה אטומית, ניסיונות חוזרים, מניעת כפילויות, בדיקת הרשאות ומכסה | לוגיקת התור נבדקה ב-Postgres. **מול Meta עוד לא נבדק** |
| Reels | תשתית בלבד | חסום לפרסום אמיתי עד שייבדק |
| Smart Scheduler | X פוסטים בשבוע, ימים ושעות, שעון ישראל כולל שעון קיץ | נבדק |
| Analytics | חשיפה, לייקים, תגובות, שמירות, דוח שבועי, משקלי נושאים | נבנה. נתונים יגיעו רק מפוסטים אמיתיים |
| Admin Dashboard | 12 מסכים, מותאם לאייפון, ניווט תחתון | צולם במסך אייפון עם נתוני דוגמה |

---

## שלב 1 – Supabase (מסד נתונים ואחסון)

1. היכנסו ל-[supabase.com](https://supabase.com) → **New project**. אזור: `Frankfurt (eu-central-1)`. שמרו את סיסמת המסד.
2. בתפריט: **SQL Editor** → **New query**.
3. פתחו ב-GitHub את הקובץ `smart-mabat/supabase/migrations/0001_init.sql`, לחצו **Raw**, העתיקו הכול, הדביקו ב-Supabase ולחצו **Run**. אמורה להופיע ההודעה `Success. No rows returned`.
4. **Project Settings → API**: העתיקו לפתקים את:
   - `Project URL` → זה `SUPABASE_URL`
   - `service_role` (secret) → זה `SUPABASE_SERVICE_ROLE_KEY`. **לא לשתף עם אף אחד.**

## שלב 2 – Vercel (פריסה)

1. היכנסו ל-[vercel.com](https://vercel.com) עם GitHub → **Add New → Project** → בחרו את הריפו `restaurant-app`.
2. **Root Directory** → לחצו Edit → בחרו `smart-mabat`. ‏Framework: Next.js (מזוהה אוטומטית).
3. ב-**Environment Variables** הוסיפו לעת עתה רק:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_EMAIL` – האימייל שלכם
   - `PUBLISH_LIVE_ENABLED` = `false`
4. **Deploy**.
5. פתחו באייפון את `https://<הדומיין-שלכם>.vercel.app/setup`, הקלידו סיסמת מנהל (12+ תווים) ולחצו **צור ערכים**.
6. העתיקו את 4 הערכים (`ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`) ל-Vercel → Settings → Environment Variables.
7. Vercel → **Deployments** → על הפריסה האחרונה ⋯ → **Redeploy**.
8. היכנסו לכתובת האתר והתחברו. עמוד `/setup` נכבה אוטומטית.

> טיפ: בספארי → שיתוף → **הוסף למסך הבית**, והמערכת תיפתח כמו אפליקציה.

## שלב 3 – בדיקה ראשונה (מצב בדיקות)

1. **הגדרות סוכן**: בחרו מצב "אישור ידני", ימים, שעה (ברירת מחדל 19:00) ומספר פוסטים בשבוע. מלאו טלפון/אתר **רק אם אתם רוצים שיופיעו**. הסוכן לא ממציא פרטים.
2. העלו לוגו (PNG שקוף) באותו עמוד.
3. **פוסטים → חדש → צור פוסט**. בלי מפתחות AI ייווצר פוסט בדיקה מתבנית ותמונת placeholder ממותגת. זה מספיק כדי לבדוק את כל המערכת.
4. בעמוד הפוסט: **אשר ותזמן** ואז **בדיקת פרסום (סימולציה)**. הפוסט יסומן "פורסם בסימולציה", ובאינסטגרם לא יופיע כלום.

## שלב 4 – הפעלת ה-AI

ב-Vercel הוסיפו (ואז Redeploy):
- `ANTHROPIC_API_KEY` – מ-[console.anthropic.com](https://console.anthropic.com) (כתיבת הפוסטים, Claude Opus 5.5).
- `OPENAI_API_KEY` – מ-[platform.openai.com](https://platform.openai.com) (תמונות). לא חובה. בלעדיו תוכלו להשתמש בתמונות אמיתיות מהספרייה (הגדרות → מקור תמונה → ספרייה).

אם מודל Claude מסרב לבקשה, המערכת מבקשת אוטומטית ממודל גיבוי (`fallbacks: "default"`).

## שלב 5 – שירות מתוזמן (הסוכן רץ לבד)

**ראשי (מומלץ, כל 10 דקות):** Supabase → Database → Extensions → הפעילו `pg_cron` ו-`pg_net`. אחר כך ב-SQL Editor הריצו את `supabase/cron.sql`, אחרי שהחלפתם את `YOUR-APP` בדומיין ואת `YOUR-CRON-SECRET` בערך `CRON_SECRET`.

**גיבוי:** `vercel.json` מריץ את הסוכן פעם ביום (בתוכנית Hobby של Vercel מותר רק יומי).

לבדיקה: בדשבורד → **הרץ עכשיו**, ובעמוד **יומן פעולות** תראו את הריצות.

## שלב 6 – חיבור אינסטגרם (קריאה בלבד)

דרישות: חשבון Instagram **Business** או **Creator**.

1. [developers.facebook.com](https://developers.facebook.com) → My Apps → **Create App** → Use case: **Manage messaging & content on Instagram**.
2. בתוך האפליקציה: **Instagram → API setup with Instagram login** → **Add account** → התחברו לחשבון של מבט חכם → **Generate token**.
3. ההרשאות הנדרשות: `instagram_business_basic`, `instagram_business_content_publish` (ולביצועים: `instagram_business_manage_insights`).
4. במערכת: **אינסטגרם** → הדביקו את הטוקן → **חבר ואמת**. המערכת מבצעת רק קריאות קריאה (זהות, מכסה) ולא מפרסמת כלום.

הטוקן נשמר מוצפן ב-AES-256-GCM ומתחדש אוטומטית לפני שפג תוקפו (60 יום).

> **שימו לב:** כל עוד אפליקציית Meta במצב Development, היא עובדת רק לחשבונות שמוגדרים בה כ-Tester/Admin. זה מספיק לחשבון העסקי שלכם.

## שלב 7 – פרסום אמיתי (רק אחרי שהכול תקין)

1. ודאו שכמה סימולציות עברו בהצלחה ושהתוכן נראה לכם טוב.
2. Vercel: `PUBLISH_LIVE_ENABLED` = `true` → Redeploy.
3. במערכת: **אינסטגרם** → הקלידו `פרסם` → **הפעל פרסום אמיתי**.
4. מומלץ להתחיל ב"אישור ידני" ולעבור ל"פרסום אוטומטי" רק אחרי כמה פוסטים מוצלחים.

לעצירה מיידית יש שלוש דרכים: כפתור **עצור** בדשבורד, **חזרה למצב בדיקות**, או `PUBLISH_LIVE_ENABLED=false`.

---

## אבטחה

- כל המפתחות בצד השרת בלבד. אין שום מפתח בדפדפן.
- טבלאות Supabase נעולות ב-RLS בלי מדיניות, ולמפתח הציבורי אין שום גישה.
- טוקן Meta מוצפן (AES-256-GCM). נשלח ב-Header ולא ב-URL, כדי שלא יופיע בלוגים.
- סיסמה: scrypt. ‏Session: ‏JWT חתום, HttpOnly, ל-12 שעות. חסימה אחרי 8 ניסיונות כושלים ב-15 דקות.
- תור עם נעילה אטומית (`FOR UPDATE SKIP LOCKED`) ו-lease לריצת הסוכן: אין פרסום כפול גם בריצות חופפות.
- לפני כל פרסום הבדיקות רצות שוב, ועריכה של פוסט מאושר מחזירה אותו לאישור.
- רק API רשמי של Meta, בלי בוט דפדפן ובלי עקיפת מגבלות. המערכת בודקת את מכסת הפרסום לפני כל פרסום.

## מבנה התיקיות

```
smart-mabat/
├─ supabase/migrations/0001_init.sql   סכמה, RLS, פונקציות תור
├─ supabase/cron.sql                   תזמון pg_cron
├─ src/proxy.ts                        הגנת כניסה לכל העמודים
├─ src/actions/                        Server Actions (טפסים)
├─ src/app/(admin)/                    מסכי הניהול
├─ src/app/api/cron/tick/              נקודת ההפעלה של הסוכן
├─ src/lib/agent.ts                    מחזור הסוכן: תכנון → כתיבה → בדיקה → פרסום
├─ src/lib/ai/                         Claude + פרומפטים
├─ src/lib/content/                    בדיקות תוכן, זיהוי כפילויות, נושאים
├─ src/lib/images/                     יצירת תמונות, מיתוג, אחסון
├─ src/lib/instagram/                  Graph API, חיבור, מפרסם
├─ src/lib/scheduler/                  משבצות זמן (שעון ישראל), אסטרטגיה מסתגלת
├─ src/lib/analytics/                  Insights
└─ tests/                              בדיקות יחידה (Vitest)
```

## פיתוח מקומי (לא חובה)

```bash
cd smart-mabat
cp .env.example .env.local   # מלאו ערכים
npm install
npm run dev                  # http://localhost:3000
npm test                     # בדיקות יחידה
```

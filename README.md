<div align="center">

# GET&#8203;SERVICE

**המקצוען הנכון. בדיוק כשצריך.**

Marketplace להזמנת בעלי מקצוע בזמן אמת — Next.js · TypeScript · Supabase · Tailwind

</div>

---

## מה זה

GET SERVICE מחברת לקוח שצריך בעל מקצוע עם בעלי מקצוע מאומתים בסביבתו, בזמן אמת:
הלקוח פותח בקשה, מנוע ההתאמה משדר אותה לבעלי מקצוע רלוונטיים, הם שולחים הצעות מחיר
עם זמן הגעה, הלקוח בוחר, עוקב אחרי הביצוע, משלם ומדרג.

זו מערכת Full-Stack עובדת — לא מוקאפ: מסד נתונים עם הרשאות ברמת השורה, אימות,
API מאומת, עדכונים בזמן אמת, שכבות הפשטה לתשלומים/מפות/התראות, ופאנל ניהול.

## הרצה מהירה

```bash
npm install
cp .env.example .env.local     # אופציונלי — בלי זה המערכת עולה במצב הדגמה
npm run dev                    # http://localhost:3000
```

**מצב הדגמה:** ללא Supabase האפליקציה עולה ומציגה את קטלוג השירותים, דף הנחיתה,
המסמכים המשפטיים ואת כל המסכים — עם הודעה ברורה שחיבור מסד הנתונים לא הוגדר.
תשלומים, מפות והתראות פועלים דרך מתאמי Mock גם כשיש Supabase, עד שמגדירים מפתחות.

## חיבור Supabase

1. צור פרויקט ב-[supabase.com](https://supabase.com) והעתק URL + מפתחות ל-`.env.local`.
2. הרץ את המיגרציות:
   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
   (או `npx supabase db reset` בסביבה מקומית — `npx supabase start`.)
3. זרע נתוני הדגמה:
   ```bash
   npm run db:seed
   ```

### משתמשי הדגמה (לאחר seed)

| תפקיד | אימייל | סיסמה |
| --- | --- | --- |
| לקוח | `customer@test.com` | `DemoPassword123!` |
| בעל מקצוע | `provider@test.com` | `DemoPassword123!` |
| מנהל | `admin@test.com` | `DemoPassword123!` |

> הסיסמאות האלה הן placeholders לפיתוח בלבד. אין להשתמש בהן בפרודקשן.
> תפקיד `admin` לא ניתן לקבלה דרך הרשמה — רק דרך ה-seed או עדכון ידני במסד.

## בדיקות

```bash
npm run test      # 111 בדיקות Vitest — יחידה + אינטגרציה
npm run lint
npm run typecheck
```

**אימות אבטחת המסד** — `supabase/tests/rls-verification.sql` מריץ 13 טענות מול מסד
אמיתי: ההרשמה לא יכולה להנפיק `admin`, בעל מקצוע לא יכול לאמת את עצמו או לנפח
דירוג, לקוח רואה רק את העבודות שלו, אי אפשר לדרג עבודה של אחר או לשלוח הצעה
לעבודה שלא שודרה אליך, ואי אפשר למחוק ביקורת. הסקריפט מסתיים ב-`rollback`, כך
שהוא בטוח להרצה חוזרת.

```bash
# מול Supabase מקומי
supabase db reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/rls-verification.sql

# מול PostgreSQL רגיל (דורש postgis + pgcrypto)
./supabase/tests/run-local.sh
```

## סקריפטים

| פקודה | מה היא עושה |
| --- | --- |
| `npm run dev` | שרת פיתוח |
| `npm run build` | build לפרודקשן |
| `npm run start` | הרצת ה-build |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run db:seed` | זריעת נתוני הדגמה |
| `npm run db:reset` | איפוס מסד מקומי + מיגרציות |

## מצב האינטגרציות

`GET /api/health` מחזיר אילו אינטגרציות חיות ואילו רצות ב-Mock — בלי לחשוף מפתחות.

| שירות | ללא מפתח | עם מפתח |
| --- | --- | --- |
| Supabase | מצב הדגמה (קטלוג מקומי) | מסד מלא + Auth + Realtime + Storage |
| תשלומים | `MockPaymentAdapter` — authorize/capture/refund בזיכרון | Stripe (manual capture) או מתאם ישראלי |
| מפות | `MockMapsAdapter` — geocoding של ערים בישראל, ETA מוערך | Google Maps / Mapbox |
| התראות | לוג לקונסול, שורת `notifications` נשמרת תמיד | Email / SMS / Push / WhatsApp |
| סיווג AI | `KeywordJobClassifier` דטרמיניסטי | כל מימוש של `AIJobClassifier` |

## מסמכים

- [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) — היקף, שלבי הבנייה ומה נשאר
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — שכבות, זרימות, אבטחה והחלטות
- [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) — טבלאות, אינדקסים ומדיניות RLS

## מבנה הפרויקט

```
app/            מסלולי Next.js — דף נחיתה, אימות, /app (לקוח), /provider, /admin, /api
components/     UI primitives (ui/), פריסה (layout/), מותג (brand/)
features/       לוגיקת מסך לפי תחום — jobs, providers, chat, admin, auth, marketing
lib/            שכבת השירות: services/, supabase/, validation/, api/, i18n/, utils/
hooks/          hooks ללקוח — realtime, geolocation, api, debounce
supabase/       migrations/ + seed/
tests/          Vitest — יחידה ואינטגרציה
types/          טיפוסי מסד הנתונים
legacy/         אב-טיפוס ישן שהיה ב-repo לפני GET SERVICE (לא חלק מהאפליקציה)
```

## אבטחה בקצרה

- כל טבלה עם RLS פעיל ו-`force row level security`; ברירת המחדל היא מניעה.
- לקוח רואה רק את העבודות שלו; בעל מקצוע רואה רק עבודות שהוצעו לו או שובצו אליו.
- מסמכי אימות ב-bucket פרטי, נגישים לבעליהם ולמנהלים בלבד.
- כל endpoint עובר `requireSession` / `requireRole`, ולא נשען על הסתרה ב-UI.
- מחירים ועמלות מחושבים בצד השרת בלבד; הלקוח לא יכול לשלוח סכום משלו.
- טריגרים במסד מונעים מבעל מקצוע לשנות את סטטוס האימות, הדירוג או המונים שלו.
- שגיאות מוחזרות כהודעה בלבד — בלי stack traces.

## פריסה

- **Vercel** — `next build` עובד כמו שהוא; הגדר את משתני הסביבה מ-`.env.example`.
- **Supabase** — הרץ `supabase db push` מול הפרויקט לפני הפריסה הראשונה.
- אין סודות בקוד; כל מפתח נקרא דרך `lib/env.ts` ויש לו fallback מפורש.

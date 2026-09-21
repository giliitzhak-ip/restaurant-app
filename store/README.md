# בית וגינה — Premium Home & Garden Solutions Store

חנות E-commerce ישראלית, RTL-first, Mobile-first, בנויה ל-Production.
מוכרת מוצרים לבית, לגינה, לסדר וארגון, ולמניעת מזיקים לשימוש ביתי.

> **עיקרון מנחה:** אין במערכת מידע מומצא. מחיר, מק״ט, ברקוד, מספר רישום, חומר
> פעיל, מינון, הוראות שימוש, אזהרות ומלאי — כל שדה שאינו ידוע נשאר `null`
> ומוצג כ״ממתין לעדכון״. מוצר הדברה/דחייה מתפרסם בחנות **רק** לאחר אימות מלא,
> והאכיפה מתבצעת בשרת ולא רק בממשק.

---

## הרצה מהירה

```bash
# 1. התקנת תלויות
npm install

# 2. הגדרת סביבה
cp .env.example .env
#    מלאו DATABASE_URL ו-AUTH_SECRET (openssl rand -base64 48)

# 3. מסד נתונים
npm run db:migrate      # הרצת מיגרציות
npm run db:seed         # קטלוג התחלה + משתמש מנהל

# 4. הרצה
npm run dev             # http://localhost:3000
```

כניסה למערכת הניהול: `http://localhost:3000/admin`
(משתמש ברירת מחדל נוצר ב-seed לפי `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

### סקריפטים

| סקריפט | תיאור |
| --- | --- |
| `npm run dev` | שרת פיתוח |
| `npm run build` | build ל-Production |
| `npm run start` | הרצת ה-build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict |
| `npm run test` | כל הבדיקות (unit + integration + e2e) |
| `npm run e2e` | בדיקות e2e בלבד (דורש `npm run build` קודם) |
| `npm run db:migrate` | מיגרציה בפיתוח |
| `npm run db:deploy` | מיגרציה ב-Production |
| `npm run db:seed` | נתוני התחלה |
| `npm run db:reset` | איפוס מלא של המסד |

---

## מבנה הפרויקט

```
prisma/
  schema.prisma            סכימת המסד
  migrations/              מיגרציות SQL
  seed.ts                  נתוני התחלה
  seed-data/               קטלוג RPC, קטגוריות, מוצרי דמו, Solver, תוכן
src/
  app/
    (storefront)/          חנות: בית, קטגוריה, מוצר, חיפוש, עגלה, קופה, Solver
    admin/                 מערכת ניהול
    api/                   route handlers (העלאת מדיה, ייבוא, webhooks, חיפוש)
    actions/               server actions
  components/
    ui/                    Design System primitives
    storefront/            רכיבי חנות
    admin/                 רכיבי ניהול
  lib/
    auth/                  סשן, סיסמאות, RBAC, rate limiting
    catalog/               שאילתות קטלוג, סטטוסים, publish guard
    media/                 ולידציה, עיבוד תמונה, שירות מדיה
    storage/               StorageProvider (local / S3 / Cloudinary)
    payments/              PaymentProvider (sandbox)
    shipping/              ShippingProvider (sandbox)
    email/                 EmailProvider + SMS/WhatsApp seam
    orders/                יצירת הזמנה, שריון מלאי, webhooks
    cart/                  עגלה (אורח + מיזוג לחשבון)
    suppliers/             פרסור מחירון וייבוא
    solver/                אשף הפתרונות
  config/settings.ts       כל ברירות המחדל התפעוליות
tests/
  unit/ integration/ e2e/
```

---

## ארכיטקטורה

### שכבות
UI ← server actions / route handlers ← domain services ← Prisma ← PostgreSQL.
אין לוגיקה עסקית ברכיבי UI, ואין גישה ישירה למסד מהקומפוננטות.

### Adapters
כל אינטגרציה חיצונית עוברת דרך interface:
`StorageProvider`, `PaymentProvider`, `ShippingProvider`, `EmailProvider`,
`MessagingProvider`, `AnalyticsSink`.
החלפת ספק = הוספת מימוש + שינוי משתנה סביבה. שום קוד אחר לא משתנה.

### כסף
כל ערך כספי נשמר כ-**integer באגורות**. אין floating point בשום מקום בשרשרת.

### Publish Guard
`src/lib/catalog/publish-guard.ts` הוא מקור האמת היחיד לשאלה
״האם המוצר יכול להופיע בחנות?״. הוא נקרא גם מה-server action וגם משאילתת
החנות (`PUBLIC_PRODUCT_WHERE`), כך שבאג בממשק לא יכול לחשוף מוצר לא מאומת.

---

## מערכת התמונות

* **העלאה**: Drag & Drop או בחירה מרובה, עם Upload Progress אמיתי (XHR).
* **ולידציה בשרת**: magic number של הקובץ, לא סיומת ולא Content-Type.
  SVG, HTML וקבצי הרצה נחסמים. גודל מקסימלי configurable.
* **עיבוד**: הקובץ מקודד מחדש (מנקה metadata), ונוצרות ארבע גרסאות —
  `thumbnail` 160, `card` 600, `page` 1200, `zoom` 2000 — בפורמט WebP,
  עם `fit: contain` על רקע לבן. תמונה אף פעם לא נמתחת.
* **אחסון**: הקבצים עוברים דרך `StorageProvider`. **אין base64 במסד.**
  המסד שומר `url`, `storageKey`, `mimeType`, `width`, `height`, `fileSize`,
  `alt`, `position`, `checksum` ו-`variants`.
* **ניהול**: שינוי סדר בגרירה, ״הגדר כתמונה ראשית״, החלפה, מחיקה ועריכת Alt.
  התמונה הראשונה הופכת אוטומטית לראשית; תמיד יש בדיוק תמונה ראשית אחת.
* **De-duplication**: העלאה חוזרת של אותו קובץ (sha256 זהה) לא מכפילה נכס.
* **ייבוא מרוכז**: `Admin ← מוצרים ← ייבוא תמונות מרוכז`. בוחרים תיקייה,
  המערכת מציעה שיוך לפי שם קובץ (`SKU-main.jpg`, `SKU-2.jpg`) ומציגה
  Preview. **שום קובץ אינו נשמר לפני אישור מפורש.**

---

## אבטחה

* Session cookie חתום (JWT/HS256), `httpOnly`, `sameSite=lax`, `secure` ב-Production.
* הגנה על `/admin` ב-middleware **וגם** ב-server guard בכל עמוד ופעולה.
* RBAC אמיתי עם חמישה תפקידים; `regulatory.verify` שמור ל-Super Admin בלבד.
* Rate limiting על התחברות, קופה, חיפוש והעלאות. נעילת חשבון אחרי 5 כשלונות.
* סיסמאות ב-bcrypt (12 סבבים). הודעת שגיאה אחידה — אין גילוי קיום משתמש.
* Security headers + CSP; `frame-ancestors 'none'`, `object-src 'none'`.
* ולידציית קלט ב-Zod בכל server action ו-route handler.
* Webhook: אימות חתימה ב-`timingSafeEqual` לפני פרסור, ואידמפוטנטיות לפי event id.
* **אין שמירה של מספרי כרטיס או CVV** — הסליקה היא hosted/tokenized בלבד.
* Audit log לכל פעולה רגישה.

---

## בדיקות

```bash
npm run test              # הכל
npx vitest run tests/unit
npx vitest run tests/integration   # דורש DATABASE_URL
npm run build && npm run e2e       # e2e מריץ שרת אמיתי
```

מכוסים: כספים ומרווח, publish guard, ולידציית תמונות, RBAC, סשן ו-rate limiting,
פרסור מחירון, שיוך תמונות לפי שם קובץ, יצירת הזמנה, שריון מלאי, מניעת overselling
במקביליות, webhook כפול, זיכוי, העלאת תמונות מקצה לקצה, הגנת /admin, ואכיפת
הפרסום הרגולטורי.

---

## מה עדיין Sandbox

| תחום | מצב | מה נדרש |
| --- | --- | --- |
| סליקה | `SandboxPaymentProvider` | חוזה עם ספק PCI-compliant + מימוש `PaymentProvider` |
| משלוחים | `SandboxShippingProvider` (תמחור אמיתי מהמסד) | API של חברת השילוח |
| דוא״ל | `ConsoleEmailProvider` | ספק דיוור טרנזקציוני |
| SMS/WhatsApp | seam בלבד | ספק הודעות |
| אחסון ענן | S3/Cloudinary adapters ללא transport | פרטי חשבון + השלמת ה-SDK |
| Analytics | event layer + consent gate | חיבור GA4 / Meta |

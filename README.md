# restaurant-app

מאגר זה מכיל שני פרויקטים נפרדים:

| תיקייה | תיאור |
| --- | --- |
| `store/` | **חנות E-commerce ישראלית** — Next.js + TypeScript + PostgreSQL. ראו [`store/README.md`](store/README.md). |
| `server.js`, `public/` | מערכת הזמנות למסעדה (Node.js ללא תלויות) — הפרויקט המקורי במאגר, ללא שינוי. |

## החנות

```bash
cd store
npm install
cp .env.example .env     # מלאו DATABASE_URL ו-AUTH_SECRET
npm run db:migrate
npm run db:seed
npm run dev
```

התיעוד המלא — ארכיטקטורה, מערכת התמונות, אבטחה, בדיקות ומה שעדיין חסר —
נמצא ב-[`store/README.md`](store/README.md).

## מערכת ההזמנות למסעדה

```bash
npm start   # node server.js
```

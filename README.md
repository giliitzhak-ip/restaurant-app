# restaurant-app

<div dir="rtl">

מאגר זה מכיל שני פרויקטים נפרדים ובלתי תלויים זה בזה.

## STANGA — משחק כדורגל רחוב תלת־ממדי

תיקייה: [`stanga/`](stanga/)

משחק כדורגל רחוב ישראלי תלת־ממדי לדפדפן ולטלפון, בנוי ב־TypeScript, Vite ו־Babylon.js
עם פיזיקת Havok. שחקן אחד מול יריב ממוחשב, ניקוד לפי שער, קורה, משקוף וחיבור.

</div>

```bash
cd stanga
npm install
npm run dev
```

<div dir="rtl">

התיעוד המלא נמצא ב־[`stanga/README.md`](stanga/README.md).

## מערכת הזמנות למסעדה

קבצים: `server.js`, `public/`

שרת Node.js ללא תלויות חיצוניות, המשתמש ב־`node:sqlite` המובנה.

</div>

```bash
node server.js
```

/* מיגרציית נתונים חד-פעמית: הסרת החסימה התפעולית מהמאגר.
   לא נמחקים חומרים ולא משתנים פרטי חומר – רק הסטטוס והדגל isSelectable.
   הרצה: node tools/unblock-materials.js                                     */
const fs = require('fs');
const path = require('path');

const SEED = path.join(__dirname, '..', 'src', 'data', 'pesticides.seed.json');
const data = JSON.parse(fs.readFileSync(SEED, 'utf8'));

const before = {};
for (const p of data.products) before[p.verificationStatus] = (before[p.verificationStatus] || 0) + 1;

for (const p of data.products) {
  if (p.verificationStatus !== 'verified') {
    /* חומר ללא נתוני אימות אינו חסום – הוא פשוט לא ידוע */
    p.verificationStatus = 'unknown';
    p.statusLabel = 'מידע יושלם בהמשך';
  }
  /* נשמר לתאימות לאחור בלבד; אין להשתמש בו כדי להשבית בחירה */
  p.isSelectable = true;
}

data.disclaimer =
  'כל חומר במאגר ניתן לבחירה ולשמירה ביומן. שלושה חומרים הוזנו מתוויות המוצר; ' +
  'לשאר טרם הוזנו פרטי תווית ורישום, והם מסומנים בתג מידע בלבד. ' +
  'מינונים ומגבלות ריסוס אינם נשמרים במערכת ויש לקחת אותם מהתווית העדכנית בכל טיפול. ' +
  'אין באמור אישור גורף לעמידה בחוק; חובה לפעול לפי התווית העדכנית ולפי תנאי רישיון המדביר.';

fs.writeFileSync(SEED, JSON.stringify(data, null, 2) + '\n');

const after = {};
for (const p of data.products) after[p.verificationStatus] = (after[p.verificationStatus] || 0) + 1;
console.log('לפני:', JSON.stringify(before));
console.log('אחרי:', JSON.stringify(after));
console.log('כולם ניתנים לבחירה:', data.products.every(p => p.isSelectable === true));

/** מפענח CSV עם תמיכה במרכאות, במפריד משתנה ובפסיקים בתוך שדה. */
export function parseCsv(text) {
  const clean = String(text).replace(/^﻿/, ''); // הסרת BOM

  // זיהוי המפריד לפי השורה הראשונה, מחוץ למרכאות
  const firstLine = clean.split(/\r?\n/)[0] ?? '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch] += 1;
  }
  const delimiter = Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ',');

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    /* מרכאות פותחות שדה מצוטט רק בתחילת שדה.
       באמצע שדה הן תו רגיל — נפוץ בעברית, למשל בע"מ. */
    if (ch === '"' && field === '') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (nonEmpty.length === 0) return [];

  const headers = nonEmpty[0].map((h) => String(h).trim());
  return nonEmpty.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = String(r[idx] ?? '').trim(); });
    return obj;
  });
}

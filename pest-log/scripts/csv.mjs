/**
 * קורא CSV פשוט (RFC 4180): גרשיים כפולים, פסיקים בתוך שדה, שורות חדשות בתוך שדה.
 * נכתב כאן ולא נלקח מספרייה כדי שלא לצרף תלות נוספת רק לייבוא.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // הסרת BOM שנוסף ע"י Excel — אחרת שם העמודה הראשונה יישבר.
  const input = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** ממיר CSV לרשומות לפי שורת הכותרת. */
export function csvToRecords(text) {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows.map((row) => {
    const record = {};
    keys.forEach((key, index) => {
      record[key] = (row[index] ?? '').trim();
    });
    return record;
  });
}

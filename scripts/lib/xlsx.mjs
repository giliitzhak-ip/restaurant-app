/**
 * קריאת קובץ XLSX ללא תלויות חיצוניות.
 * קובץ xlsx הוא ארכיון ZIP ובתוכו XML; כאן מפוענחים רק החלקים הדרושים:
 * מחרוזות משותפות וגיליון ראשון.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';

/* ───────── פריסת ZIP ───────── */

function readEntries(buffer) {
  // איתור סוף התיקייה המרכזית
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66000; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('הקובץ אינו ארכיון ZIP תקין (לא נמצא EOCD).');

  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    // כותרת מקומית: אורכי השדות עשויים להיות שונים מאלה שבתיקייה המרכזית
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    entries.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/* ───────── פענוח XML מינימלי ───────── */

function decodeXmlText(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/* קובצי xlsx נכתבים לעיתים עם קידומת מרחב שמות (<x:row>) ולעיתים בלעדיה.
   כל הביטויים כאן סובלניים לקידומת. */
const TAG = (name) => new RegExp(`<(?:[A-Za-z0-9_]+:)?${name}[\\s>]`);
const TEXT_TAG = /<(?:[A-Za-z0-9_]+:)?t[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?t>/g;
const VALUE_TAG = /<(?:[A-Za-z0-9_]+:)?v[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?v>/;
const CLOSE = (name) => new RegExp(`</(?:[A-Za-z0-9_]+:)?${name}>`);

function splitTags(xml, name) {
  return xml.split(new RegExp(`<(?:[A-Za-z0-9_]+:)?${name}[\\s>]`)).slice(1);
}

/** מחרוזות משותפות: כל <si> עשוי להכיל כמה <t>. */
function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const si of splitTags(xml, 'si')) {
    const end = si.search(CLOSE('si'));
    const body = end === -1 ? si : si.slice(0, end);
    const parts = [...body.matchAll(TEXT_TAG)].map((m) => decodeXmlText(m[1]));
    out.push(parts.join(''));
  }
  return out;
}

function columnIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** מחזיר מערך שורות, כל שורה מערך של מחרוזות. */
export function readXlsxRows(filePath) {
  const entries = readEntries(fs.readFileSync(filePath));
  const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8');
  const shared = parseSharedStrings(sharedXml);

  const sheetName = [...entries.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0];
  if (!sheetName) throw new Error('לא נמצא גיליון בקובץ.');
  const sheet = entries.get(sheetName).toString('utf8');

  const rows = [];
  for (const chunk of splitTags(sheet, 'row')) {
    const end = chunk.search(CLOSE('row'));
    const body = end === -1 ? chunk : chunk.slice(0, end);
    const cells = new Map();
    for (const cell of splitTags(body, 'c')) {
      const ref = /r="([A-Z]+\d+)"/.exec(cell)?.[1];
      if (!ref) continue;
      const type = /t="([^"]+)"/.exec(cell)?.[1];
      let value = '';
      if (type === 's') {
        const idx = VALUE_TAG.exec(cell)?.[1];
        value = idx !== undefined ? (shared[Number(idx)] ?? '') : '';
      } else if (type === 'inlineStr') {
        // טקסט מוטמע יושב בתגיות <t>
        value = [...cell.matchAll(TEXT_TAG)].map((m) => decodeXmlText(m[1])).join('');
      } else {
        // t="str" (נוסחה שהוחזרה כטקסט) ומספרים — הערך יושב ב-<v>
        const v = VALUE_TAG.exec(cell)?.[1];
        value = v !== undefined ? decodeXmlText(v) : '';
      }
      cells.set(columnIndex(ref), value.trim());
    }
    if (cells.size === 0) { rows.push([]); continue; }
    const width = Math.max(...cells.keys()) + 1;
    rows.push(Array.from({ length: width }, (_, i) => cells.get(i) ?? ''));
  }
  return rows;
}

/**
 * ממיר שורות לאובייקטים. שורת הכותרות מזוהה כשורה הראשונה שיש בה
 * כמה תאים לא ריקים — קבצים רשמיים פותחים בשורות כותרת ומקור.
 */
export function rowsToRecords(rows, minColumns = 3) {
  const headerIndex = rows.findIndex((r) => r.filter((c) => c.trim() !== '').length >= minColumns);
  if (headerIndex === -1) return [];
  const headers = rows[headerIndex].map((h, i) => h.trim() || `עמודה ${i + 1}`);
  return rows.slice(headerIndex + 1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
      return obj;
    });
}

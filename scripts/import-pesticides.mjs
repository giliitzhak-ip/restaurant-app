/**
 * ייבוא מאגר התכשירים המורשים להדברה.
 *
 *   node scripts/import-pesticides.mjs --file <קובץ.csv|json>
 *   node scripts/import-pesticides.mjs --url  <כתובת JSON/CSV>
 *
 * המקור הרשמי:
 *   https://www.gov.il/he/Departments/DynamicCollectors/pesticides-database
 *
 * הסקריפט מזהה את העמודות לפי מילות מפתח, ולכן אינו תלוי בשם עמודה מדויק.
 * ריכוז החומר הפעיל נקרא מהמקור ואינו מנוחש: ערך שאינו קיים מסומן "לא הוזן".
 *
 * הפלט: src/data/pesticides.generated.json — נטען אוטומטית על ידי האפליקציה.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './lib/csv.mjs';
import { readXlsxRows, rowsToRecords } from './lib/xlsx.mjs';
import { parseActiveIngredients } from './lib/ingredients.mjs';
import { detectColumns, findRecords, flattenRecord } from './lib/fields.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'data', 'pesticides.generated.json');
const NOT_ENTERED = 'לא הוזן';

/* ───────── קריאת הקלט ───────── */

function args() {
  const out = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    const token = process.argv[i];
    if (!token?.startsWith('--')) continue;
    const key = token.replace(/^--/, '');
    const next = process.argv[i + 1];
    if (!next || next.startsWith('--')) { out[key] = true; }
    else { out[key] = next; i += 1; }
  }
  return out;
}

/** --map tradeName=Data.name,registrationNumber=Data.reg */
function parseMapping(raw) {
  if (!raw || raw === true) return {};
  const mapping = {};
  for (const pair of String(raw).split(',')) {
    const [field, column] = pair.split('=').map((x) => x?.trim());
    if (field && column) mapping[field] = column;
  }
  return mapping;
}

function isXlsx(filePath) {
  return /\.xlsx?$/i.test(filePath);
}

async function readInput({ file, url }) {
  if (file) {
    const resolved = path.resolve(file);
    if (isXlsx(resolved)) {
      return { rows: readXlsxRows(resolved), source: path.basename(file) };
    }
    return { text: fs.readFileSync(resolved, 'utf8'), source: path.basename(file) };
  }
  if (url) {
    const res = await fetch(url, { headers: { Accept: 'application/json, text/csv, */*' } });
    if (!res.ok) throw new Error(`הורדה נכשלה: ${res.status} ${res.statusText}`);
    return { text: await res.text(), source: url };
  }
  throw new Error('יש לציין --file או --url');
}

function toRecords(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const json = JSON.parse(trimmed);
    return findRecords(json).map(flattenRecord);
  }
  return parseCsv(text);
}

/* ───────── המרה למבנה האפליקציה ───────── */

function slug(value, index) {
  const base = String(value ?? '').replace(/[^0-9A-Za-z֐-׿]+/g, '').slice(0, 24);
  return `gov_${base || 'x'}_${index}`;
}

/** תאריך תוקף לתקן YYYY-MM-DD. ערך שאינו ניתן לפענוח מוחזר ריק. */
function toIsoDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return undefined;
}

function splitPests(raw) {
  return String(raw ?? '')
    .split(/\s*[,;|/]\s*|\s+ו\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

/** איחוד שמות העמודות מכל הרשומות: ב-JSON שדה יכול להופיע רק בחלקן. */
function collectHeaders(records) {
  const seen = new Set();
  for (const row of records.slice(0, 500)) {
    for (const key of Object.keys(row ?? {})) seen.add(key);
  }
  return [...seen];
}

function convert(records, overrides = {}) {
  const headers = collectHeaders(records);
  const cols = { ...detectColumns(headers), ...overrides };
  if (!cols.tradeName) {
    throw new Error(
      'לא זוהתה עמודת שם תכשיר.\n' +
      `העמודות שנמצאו: ${headers.join(' | ')}\n` +
      'אפשר למפות ידנית, למשל:\n' +
      `  --map tradeName=${headers[0] ?? 'COLUMN'},registrationNumber=...,activeIngredient=...`,
    );
  }

  const materials = [];
  const seen = new Map();
  let withConcentration = 0;
  let withoutIngredient = 0;

  records.forEach((row, index) => {
    const tradeName = String(row[cols.tradeName] ?? '').trim();
    if (!tradeName) return;

    const registrationNumber = String(row[cols.registrationNumber] ?? '').trim() || NOT_ENTERED;
    const ingredients = parseActiveIngredients(
      cols.activeIngredient ? row[cols.activeIngredient] : '',
      cols.concentration ? row[cols.concentration] : undefined,
    );

    // מניעת כפילויות: אותו שם ואותו מספר רישום
    const key = `${tradeName}|${registrationNumber}`;
    if (seen.has(key)) return;
    seen.set(key, true);

    if (ingredients.length === 0) withoutIngredient += 1;
    if (ingredients.some((i) => i.concentration !== NOT_ENTERED)) withConcentration += 1;

    const pests = cols.pests ? splitPests(row[cols.pests]) : [];
    const holder = cols.holder ? String(row[cols.holder] ?? '').trim() : '';
    const labelUrl = cols.labelUrl ? String(row[cols.labelUrl] ?? '').trim() : '';

    materials.push({
      id: slug(registrationNumber !== NOT_ENTERED ? registrationNumber : tradeName, index),
      tradeName,
      registrationNumber,
      formulation: (cols.formulation ? String(row[cols.formulation] ?? '').trim() : '') || NOT_ENTERED,
      activeIngredients: ingredients,
      holder: holder || undefined,
      approvedPestNames: pests,
      validUntil: toIsoDate(cols.validUntil ? row[cols.validUntil] : ''),
      labelUrl: /^https?:\/\//i.test(labelUrl) ? labelUrl : undefined,
    });
  });

  return { materials, cols, stats: { withConcentration, withoutIngredient } };
}

/* ───────── הרצה ───────── */

const opts = args();
try {
  const input = await readInput(opts);
  const source = input.source;
  const records = input.rows ? rowsToRecords(input.rows) : toRecords(input.text);
  if (records.length === 0) throw new Error('לא נמצאו רשומות בקובץ.');

  if (opts.inspect) {
    const headers = collectHeaders(records);
    console.log(`נמצאו ${records.length} רשומות. העמודות הזמינות:\n`);
    for (const h of headers) {
      const row = records.find((r) => String(r?.[h] ?? '').trim() !== '');
      const sample = String(row?.[h] ?? '').slice(0, 60).replace(/\s+/g, ' ');
      console.log(`  ${h}${sample ? `  →  ${sample}` : ''}`);
    }
    const guessed = detectColumns(headers);
    console.log('\nזיהוי אוטומטי:');
    for (const [field, column] of Object.entries(guessed)) console.log(`  ${field} ← "${column}"`);
    const missing = ['tradeName', 'registrationNumber', 'activeIngredient']
      .filter((f) => !guessed[f]);
    if (missing.length) console.log(`\nלא זוהו: ${missing.join(', ')} — יש למפות עם --map`);
    process.exit(0);
  }

  const { materials, cols, stats } = convert(records, parseMapping(opts.map));

  const payload = {
    generatedAt: new Date().toISOString(),
    source,
    officialSource: 'https://www.gov.il/he/Departments/DynamicCollectors/pesticides-database',
    count: materials.length,
    materials,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`נקראו ${records.length} רשומות מתוך: ${source}`);
  console.log('עמודות שזוהו:');
  for (const [field, column] of Object.entries(cols)) console.log(`  ${field} ← "${column}"`);
  console.log(`\nיובאו ${materials.length} תכשירים.`);
  console.log(`  עם ריכוז חומר פעיל: ${stats.withConcentration}`);
  console.log(`  ללא חומר פעיל במקור: ${stats.withoutIngredient}`);
  if (!cols.activeIngredient) {
    console.log('\nשים לב: לא זוהתה עמודת חומר פעיל. הריכוז לא יתמלא אוטומטית.');
  }
  console.log(`\nנכתב: ${path.relative(ROOT, OUT)}`);
  console.log('יש להריץ build כדי שהמאגר ייכנס לאפליקציה.');
} catch (err) {
  console.error(`ייבוא נכשל: ${err.message}`);
  process.exit(1);
}

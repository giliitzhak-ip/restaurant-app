/**
 * בדיקות ליבואן מאגר התכשירים.
 * הנתונים בתיקיית fixtures בדיוניים במכוון ואינם תכשירים אמיתיים.
 *   node scripts/tests/import.test.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../lib/csv.mjs';
import { parseActiveIngredients } from '../lib/ingredients.mjs';
import { detectColumns, findRecords, flattenRecord } from '../lib/fields.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, 'fixtures');
const OUT = path.join(ROOT, 'src', 'data', 'pesticides.generated.json');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`PASS · ${name}`); }
  else { fail += 1; console.log(`FAIL · ${name}${detail ? ` · ${detail}` : ''}`); }
};

/* ───────── פענוח חומר פעיל: אותה טבלת מקרים כמו באפליקציה ───────── */

const cases = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'ingredient-cases.json'), 'utf8'));
let mismatches = 0;
for (const c of cases) {
  const actual = parseActiveIngredients(c.input, c.hint);
  if (JSON.stringify(actual) !== JSON.stringify(c.expect)) {
    mismatches += 1;
    console.log(`   ✗ ${c.why}: קיבלתי ${JSON.stringify(actual)}`);
  }
}
check(`פענוח חומר פעיל זהה לאפליקציה (${cases.length} מקרים)`, mismatches === 0,
  mismatches ? `${mismatches} הבדלים` : '');

/* ───────── פענוח CSV ───────── */

const csvText = fs.readFileSync(path.join(FIXTURES, 'sample.csv'), 'utf8');
const rows = parseCsv(csvText);
check('CSV: נקראו כל השורות', rows.length === 4, `נמצאו ${rows.length}`);
check('CSV: מרכאות בתוך שם (בע"מ) אינן שוברות את הקובץ',
  rows[0]['בעל הרישום'] === 'חברת בדיקה בע"מ', rows[0]['בעל הרישום']);
check('CSV: פסיק בתוך שדה מצוטט נשמר',
  rows[3]['שם התכשיר'] === 'בדיקה, עם פסיק', rows[3]['שם התכשיר']);

/* ───────── זיהוי עמודות ───────── */

const cols = detectColumns(Object.keys(rows[0]));
check('זיהוי עמודת שם תכשיר', cols.tradeName === 'שם התכשיר');
check('זיהוי עמודת מספר רישום', cols.registrationNumber === 'מספר רישום');
check('זיהוי עמודת חומר פעיל', cols.activeIngredient === 'חומר פעיל');

const jsonText = fs.readFileSync(path.join(FIXTURES, 'sample.json'), 'utf8');
const records = findRecords(JSON.parse(jsonText)).map(flattenRecord);
check('JSON: אותרו הרשומות במבנה מקונן', records.length === 2, `נמצאו ${records.length}`);
const jsonCols = detectColumns([...new Set(records.flatMap((r) => Object.keys(r)))]);
check('JSON: זיהוי שם תכשיר בתעתיק לטיני', jsonCols.tradeName === 'Data.shem_hatachshir', String(jsonCols.tradeName));
check('JSON: זיהוי עמודת ריכוז שמופיעה רק בחלק מהרשומות',
  jsonCols.concentration === 'Data.rikuz', String(jsonCols.concentration));

/* ───────── ריצה מלאה של הסקריפט ───────── */

const backup = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
const run = (args) =>
  execFileSync('node', [path.join(ROOT, 'scripts', 'import-pesticides.mjs'), ...args], {
    encoding: 'utf8', cwd: ROOT,
  });

try {
  run(['--file', path.join(FIXTURES, 'sample.csv')]);
  const csvOut = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  check('ייבוא CSV: כל התכשירים נכנסו', csvOut.count === 4, `נמצאו ${csvOut.count}`);

  const alpha = csvOut.materials.find((m) => m.tradeName === 'בדיקה אלפא');
  check('ייבוא CSV: החומר הפעיל נקרא', alpha?.activeIngredients?.[0]?.name === 'Testamethrin');
  check('ייבוא CSV: אחוז החומר הפעיל נקרא אוטומטית',
    alpha?.activeIngredients?.[0]?.concentration === '9.6%',
    String(alpha?.activeIngredients?.[0]?.concentration));
  check('ייבוא CSV: מספר הרישום נקרא', alpha?.registrationNumber === '9001');
  check('ייבוא CSV: המזיקים פוצלו', alpha?.approvedPestNames?.length === 2);

  const beta = csvOut.materials.find((m) => m.tradeName === 'בדיקה ביתא');
  check('ייבוא CSV: כמה חומרים פעילים מפוצלים', beta?.activeIngredients?.length === 2);

  const gamma = csvOut.materials.find((m) => m.tradeName === 'בדיקה גמא');
  check('ייבוא CSV: ריכוז חסר מסומן "לא הוזן" ואינו מנוחש',
    gamma?.activeIngredients?.[0]?.concentration === 'לא הוזן',
    String(gamma?.activeIngredients?.[0]?.concentration));

  run(['--file', path.join(FIXTURES, 'sample.json')]);
  const jsonOut = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  check('ייבוא JSON: הרשומות נכנסו', jsonOut.count === 2, `נמצאו ${jsonOut.count}`);
  const epsilon = jsonOut.materials.find((m) => m.tradeName === 'בדיקה אפסילון');
  check('ייבוא JSON: ריכוז מעמודה נפרדת מולא אוטומטית',
    epsilon?.activeIngredients?.[0]?.concentration === '17.8%',
    String(epsilon?.activeIngredients?.[0]?.concentration));

  // מיפוי ידני
  const mapped = run(['--file', path.join(FIXTURES, 'sample.json'), '--map', 'tradeName=Data.toarit']);
  check('מיפוי ידני של עמודה נכנס לתוקף', mapped.includes('Data.toarit'));

  // מצב בדיקה אינו כותב קובץ
  const before = fs.readFileSync(OUT, 'utf8');
  const inspect = run(['--file', path.join(FIXTURES, 'sample.csv'), '--inspect']);
  check('--inspect מציג עמודות', inspect.includes('העמודות הזמינות'));
  check('--inspect אינו משנה את הפלט', fs.readFileSync(OUT, 'utf8') === before);
} finally {
  if (backup !== null) fs.writeFileSync(OUT, backup, 'utf8');
}

/* ───────── כשל מבוקר ───────── */

const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pest-'));
fs.writeFileSync(path.join(badDir, 'bad.csv'), 'עמודה א,עמודה ב\n1,2\n', 'utf8');
try {
  run(['--file', path.join(badDir, 'bad.csv')]);
  check('קובץ ללא עמודת שם תכשיר נכשל בבירור', false, 'לא נזרקה שגיאה');
} catch (err) {
  const out = String(err.stdout ?? '') + String(err.stderr ?? '');
  check('קובץ ללא עמודת שם תכשיר נכשל בבירור', out.includes('לא זוהתה עמודת שם תכשיר'));
  check('הודעת השגיאה מציעה מיפוי ידני', out.includes('--map'));
}
fs.rmSync(badDir, { recursive: true, force: true });

console.log(`\n═══ ${pass} עברו, ${fail} נכשלו ═══`);
process.exit(fail ? 1 : 0);

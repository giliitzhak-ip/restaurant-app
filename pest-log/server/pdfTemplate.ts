import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { BAIT_STATION_STATUS_LABELS } from '../src/schema/sections';
import {
  HANDOVER_METHOD_LABELS,
  INFESTATION_LEVEL_LABELS,
  MIXTURE_KIND_LABELS,
  POISON_CENTER_NOTICE,
  PREVENTION_STATUS_LABELS,
  QUANTITY_BASIS_LABELS,
  TREATMENT_KIND_LABELS,
} from '../src/schema/enums';

/**
 * תבנית ה-PDF.
 *
 * מדוע HTML ו-Chromium ולא html2canvas: html2canvas מייצר תמונה — הטקסט לא
 * ניתן לחיפוש, העברית מיטשטשת ושבירת העמודים שבורה. כאן נבנה HTML עם
 * `direction: rtl`, פונט עברי מוטבע, `@page A4`, ו-`thead` שחוזר בכל עמוד;
 * Chromium מדפיס אותו ל-PDF וקטורי עם טקסט אמיתי הניתן לחיפוש.
 */

const require = createRequire(import.meta.url);

/** הפונט מוטבע כ-data URL כדי שההפקה לא תלויה בפונטים של מערכת ההפעלה. */
function loadFontDataUrl(weight: 400 | 700): string {
  const path = require.resolve(`@fontsource/heebo/files/heebo-hebrew-${weight}-normal.woff2`);
  return `data:font/woff2;base64,${readFileSync(path).toString('base64')}`;
}

let cachedFonts: { regular: string; bold: string } | null = null;
function fonts(): { regular: string; bold: string } {
  cachedFonts ??= { regular: loadFontDataUrl(400), bold: loadFontDataUrl(700) };
  return cachedFonts;
}

/** בריחה מ-HTML — כל הערכים מגיעים ממשתמשים, ואין להזריק דרכם תגיות. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function text(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  const str = String(value).trim();
  return str.length > 0 ? escapeHtml(str) : fallback;
}

function yesNo(value: unknown): string {
  return value === true ? 'כן' : value === false ? 'לא' : '—';
}

function formatDateTime(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return escapeHtml(
    new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date),
  );
}

type Row = Record<string, unknown>;

function get(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Row)[key];
    return undefined;
  }, source);
}

function field(label: string, value: unknown): string {
  return `<div class="field"><span class="label">${escapeHtml(label)}</span><span class="value">${text(value)}</span></div>`;
}

function section(title: string, requirement: number, body: string): string {
  return `
    <section class="section">
      <h2>${escapeHtml(title)}<span class="req">סעיף ${requirement}</span></h2>
      ${body}
    </section>`;
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '<p class="empty">לא נרשמו פריטים.</p>';
  return `
    <table>
      <thead>
        <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>`;
}

export interface PdfRenderInput {
  /** ה-snapshot של היומן — המסמך הקובע. */
  snapshot: Record<string, unknown>;
  /** תמונות החתימות כ-data URL, לפי תפקיד. */
  signatureImages: {
    exterminator?: string;
    recipient?: string;
    assistants?: Record<number, string>;
  };
  /** QR לאימות העותק, כ-data URL. */
  verificationQr: string;
  /** מזהה האימות המוצג לצד ה-QR. */
  verificationId: string;
  /** פרטי מסירה, אם תועדו לאחר ההשלמה. */
  deliveryNote?: { deliveredAt: string; method: string; recipientName: string } | undefined;
}

export function buildPdfHtml(input: PdfRenderInput): string {
  const { snapshot } = input;
  const meta = (snapshot.meta ?? {}) as Row;
  const location = (snapshot.location ?? {}) as Row;
  const execution = (snapshot.execution ?? {}) as Row;
  const applications = Array.isArray(snapshot.applications) ? (snapshot.applications as Row[]) : [];
  const findings = (get(snapshot, 'monitoring.findings') as Row[] | undefined) ?? [];
  const preventionActions = (get(snapshot, 'prevention.actions') as Row[] | undefined) ?? [];
  const assistants = Array.isArray(snapshot.assistants) ? (snapshot.assistants as Row[]) : [];
  const baitStations = Array.isArray(snapshot.baitStations) ? (snapshot.baitStations as Row[]) : [];
  const treatmentKinds = Array.isArray(snapshot.treatmentKinds) ? (snapshot.treatmentKinds as string[]) : [];
  const operator = (snapshot.operator ?? {}) as Row;
  const orderer = (snapshot.orderer ?? {}) as Row;
  const exterminator = (snapshot.exterminator ?? {}) as Row;
  const preWarnings = (snapshot.preWarnings ?? {}) as Row;
  const postWarnings = (snapshot.postWarnings ?? {}) as Row;
  const handover = (snapshot.handover ?? {}) as Row;
  const fumigation = snapshot.fumigation as Row | undefined;
  const fogging = snapshot.fogging as Row | undefined;
  const { regular, bold } = fonts();

  const coordinates = location.coordinates as Row | undefined;
  const coordinatesText = coordinates
    ? coordinates.system === 'itm'
      ? `רשת ישראל — מזרח ${text(coordinates.east)} / צפון ${text(coordinates.north)}`
      : `WGS84 — ${text(coordinates.latitude)}, ${text(coordinates.longitude)}`
    : '—';

  const locationFields =
    location.placeKind === 'dwelling'
      ? [
          field('עיר', location.city),
          field('רחוב', location.street),
          field('מספר בית', location.houseNumber),
          field('מספר דירה', location.apartmentNumber),
          field('סוג המבנה', location.structureType),
        ]
      : location.placeKind === 'open_area'
        ? [
            field('שם הרשות המקומית', location.localAuthorityName),
            field('סוג האתר', location.siteType),
            field('תיאור האתר', location.siteDescription),
            field('נ״צ', coordinatesText),
          ]
        : [
            field('שם השכונה', location.neighborhoodName),
            field('עיר', location.city),
            field('שם הרשות המקומית', location.localAuthorityName),
            field('תיאור השטח המערופל', location.areaDescription),
            field('נ״צ', coordinatesText),
          ];

  const signatureBlock = (label: string, name: unknown, image: string | undefined, signedAt: unknown) => `
    <div class="signature">
      <div class="signature-label">${escapeHtml(label)}</div>
      ${image ? `<img class="signature-image" src="${image}" alt="חתימת ${escapeHtml(String(name ?? ''))}">` : '<div class="signature-missing">—</div>'}
      <div class="signature-name">${text(name)}</div>
      <div class="signature-date">${formatDateTime(signedAt)}</div>
    </div>`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>יומן ביצוע הדברה ${text(meta.serialNumber, '')}</title>
<style>
  @font-face { font-family: 'Heebo'; src: url('${regular}') format('woff2'); font-weight: 400; font-display: block; }
  @font-face { font-family: 'Heebo'; src: url('${bold}') format('woff2'); font-weight: 700; font-display: block; }

  @page {
    size: A4;
    margin: 14mm 12mm 18mm 12mm;
  }

  * { box-sizing: border-box; }
  body {
    font-family: 'Heebo', 'DejaVu Sans', sans-serif;
    direction: rtl;
    text-align: right;
    color: #111;
    font-size: 9.5pt;
    line-height: 1.5;
    margin: 0;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2.5pt solid #b8892b;
    padding-bottom: 6pt;
    margin-bottom: 8pt;
  }
  .header h1 { font-size: 15pt; margin: 0 0 2pt; }
  .header .org { font-size: 10pt; font-weight: 700; color: #7a5a17; }
  .header .serial { font-size: 12pt; font-weight: 700; }
  .header .meta-line { font-size: 8.5pt; color: #444; }

  /* דרישה 16 — מוצג בכל עמוד, בראש הדף. */
  .poison {
    border: 1.2pt solid #a11; background: #fff4f4; color: #8a0f0f;
    padding: 4pt 7pt; font-weight: 700; font-size: 9.5pt;
    margin-bottom: 8pt; border-radius: 3pt;
  }

  .section { margin-bottom: 9pt; break-inside: auto; }
  .section h2 {
    font-size: 10.5pt; margin: 0 0 4pt; padding: 3pt 6pt;
    background: #f4efe3; border-right: 3pt solid #b8892b;
    display: flex; justify-content: space-between; align-items: baseline;
    break-after: avoid;
  }
  .section h2 .req { font-size: 7.5pt; font-weight: 400; color: #7a5a17; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1pt 10pt; }
  .grid.one { grid-template-columns: 1fr; }
  .field { display: flex; gap: 5pt; padding: 1.5pt 0; border-bottom: 0.4pt dotted #ccc; break-inside: avoid; }
  .field .label { font-weight: 700; min-width: 34%; color: #333; }
  .field .value { flex: 1; white-space: pre-wrap; }

  table { width: 100%; border-collapse: collapse; margin-top: 3pt; font-size: 8.5pt; }
  th, td { border: 0.5pt solid #b9b9b9; padding: 3pt 4pt; text-align: right; vertical-align: top; }
  th { background: #f4efe3; font-weight: 700; }
  /* כותרות הטבלה חוזרות בכל עמוד. */
  thead { display: table-header-group; }
  tbody tr { break-inside: avoid; }
  .empty { color: #666; font-style: italic; margin: 3pt 0; }

  .signatures { display: flex; gap: 10pt; flex-wrap: wrap; margin-top: 4pt; }
  .signature { border: 0.6pt solid #999; padding: 4pt; width: 31%; min-width: 150pt; break-inside: avoid; }
  .signature-label { font-weight: 700; font-size: 8.5pt; margin-bottom: 2pt; }
  .signature-image { width: 100%; height: 42pt; object-fit: contain; }
  .signature-missing { height: 42pt; }
  .signature-name { font-size: 8.5pt; border-top: 0.5pt solid #ccc; padding-top: 2pt; }
  .signature-date { font-size: 7.5pt; color: #555; }

  .verify { display: flex; gap: 8pt; align-items: center; border: 0.8pt solid #b8892b;
            padding: 5pt; margin-top: 8pt; break-inside: avoid; }
  .verify img { width: 62pt; height: 62pt; }
  .verify .verify-text { font-size: 8pt; }
  .verify code { font-family: 'DejaVu Sans Mono', monospace; font-size: 7.5pt; word-break: break-all; direction: ltr; display: inline-block; }

  .note { font-size: 8pt; color: #555; margin-top: 3pt; }
  .derived { color: #7a5a17; font-size: 7.5pt; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="org">${text(meta.organizationName)}</div>
    <h1>יומן ביצוע הדברה</h1>
    <div class="meta-line">גרסת מסמך ${text(meta.documentVersion, '1')}${
      meta.correctsLogId ? ` · גרסת תיקון ליומן קודם` : ''
    }</div>
  </div>
  <div style="text-align:left">
    <div class="serial">מספר סידורי: ${text(meta.serialNumber)}</div>
    <div class="meta-line">מועד השלמה: ${formatDateTime(meta.completedAt)}</div>
  </div>
</div>

<div class="poison">${escapeHtml(POISON_CENTER_NOTICE)}</div>

${
  meta.correctionReason
    ? `<div class="section"><h2>סיבת התיקון<span class="req">גרסה ${text(meta.documentVersion)}</span></h2>
       <div class="grid one">${field('סיבת התיקון', meta.correctionReason)}</div></div>`
    : ''
}

${section(
  'פרטי המדביר',
  1,
  `<div class="grid">
     ${field('שם מלא', exterminator.fullName)}
     ${field('סוג רישיון', exterminator.licenseType)}
     ${field('מספר רישיון', exterminator.licenseNumber)}
     ${field('טלפון נייד', exterminator.mobile)}
     ${field('דוא״ל', exterminator.email)}
     ${field('כתובת', exterminator.address)}
   </div>`,
)}

${section(
  'פרטי מפעיל המדביר',
  2,
  operator.hasOperator
    ? `<div class="grid">
         ${field('שם', operator.name)}
         ${field('טלפון', operator.phone)}
         ${field('דוא״ל', operator.email)}
         ${field('כתובת', operator.address)}
       </div>`
    : '<p class="empty">לא קיים מפעיל מדביר ליומן זה.</p>',
)}

${section(
  'פרטי מזמין ההדברה',
  3,
  `<div class="grid">
     ${field('שם', orderer.name)}
     ${field('תפקיד', orderer.role)}
     ${field('טלפון', orderer.phone)}
     ${field('טלפון נייד', orderer.mobile)}
     ${field('אדם פרטי', yesNo(orderer.isPrivatePerson))}
   </div>`,
)}

${section(
  'מקום ההדברה',
  4,
  `<div class="grid">
     ${field('סוג המקום', location.placeKind === 'dwelling' ? 'דירה / בית / מבנה' : location.placeKind === 'open_area' ? 'שטח פתוח' : 'ערפול (שכונה)')}
     ${field('סוג ההדברה', treatmentKinds.map((k) => TREATMENT_KIND_LABELS[k as keyof typeof TREATMENT_KIND_LABELS] ?? k).join(', '))}
     ${locationFields.join('')}
   </div>`,
)}

${section(
  'תאריך ושעת ביצוע ההדברה בפועל',
  5,
  `<div class="grid">
     ${field('תאריך הביצוע', execution.performedDate)}
     ${field('שעת תחילה', execution.performedStartTime)}
     ${field('שעת סיום', execution.performedEndTime)}
     ${field('אזור זמן', execution.timeZone)}
   </div>`,
)}

${section(
  'ממצאי ניטור',
  6,
  table(
    ['המזיק', 'פעולות הזיהוי', 'דרגת התפתחות', 'סימני נגיעות', 'מיקום', 'רמת נגיעות'],
    findings.map((f) => [
      text(f.pestName),
      text(f.identificationActions),
      text(f.developmentStage),
      text(f.infestationSigns),
      text(f.findingLocation),
      text(INFESTATION_LEVEL_LABELS[f.infestationLevel as keyof typeof INFESTATION_LEVEL_LABELS] ?? f.infestationLevel),
    ]),
  ),
)}

${section(
  'פעולות מניעה וטיפול',
  7,
  `${table(
    ['הפעולה', 'מצב', 'הערות'],
    preventionActions.map((a) => [
      text(a.description),
      text(PREVENTION_STATUS_LABELS[a.status as keyof typeof PREVENTION_STATUS_LABELS] ?? a.status),
      text(a.notes),
    ]),
  )}
  <div class="grid one">
    ${field('הנסיבות שבגללן הוחלט לבצע הדברה ולא טיפול אחר', get(snapshot, 'prevention.circumstancesForChoosingPestControl'))}
  </div>`,
)}

${section(
  'אזהרות ומידע לפני ההדברה',
  8,
  `<div class="grid one">
     ${field('תיאור טיב ההדברה', preWarnings.treatmentNatureDescription)}
     ${field('סיכונים לאדם', preWarnings.risksToHumans)}
     ${field('סיכונים לבעלי חיים', preWarnings.risksToAnimals)}
     ${field('זמן כניסה מחדש (שעות)', preWarnings.reEntryHours)}
     ${field('הוראות נוספות לפי תווית התכשיר', preWarnings.additionalLabelInstructions)}
     ${field('אסמכתת התווית', preWarnings.labelReference)}
     ${field('הוחלה ההנחיה המחמירה ביותר על כל התכשירים', yesNo(preWarnings.strictestAppliedAcrossAll))}
     ${field('אושר ע״י המדביר', `${yesNo(preWarnings.acknowledgedByExterminator)} · ${formatDateTime(preWarnings.acknowledgedAt)}`)}
   </div>`,
)}

${
  assistants.length > 0
    ? section(
        'מדביר מסייע',
        9,
        table(
          ['שם', 'סוג רישיון', 'מספר רישיון', 'טלפון', 'דוא״ל', 'כתובת', 'ניתנו הנחיות', 'קיבל עותק'],
          assistants.map((a) => [
            text(a.fullName),
            text(a.licenseType),
            text(a.licenseNumber),
            text(a.phone),
            text(a.email),
            text(a.address),
            yesNo(a.instructionsGiven),
            yesNo(a.receivedLogCopy),
          ]),
        ),
      )
    : section('מדביר מסייע', 9, '<p class="empty">לא עבד מדביר מסייע ביומן זה.</p>')
}

${
  fumigation
    ? section(
        'איוד — פעולות איטום שבוצעו לפני האיוד',
        10,
        `${table(
          ['פעולת האיטום', 'מיקום', 'חומר', 'מועד ביצוע'],
          ((fumigation.sealingActions as Row[] | undefined) ?? []).map((s) => [
            text(s.description),
            text(s.locationDescription),
            text(s.materialUsed),
            formatDateTime(s.performedAt),
          ]),
        )}
        <div class="grid one">${field('מועד סיום פעולות האיטום', formatDateTime(fumigation.sealingCompletedAt))}</div>`,
      )
    : ''
}

${
  fogging
    ? section(
        'ערפול — התראה לציבור',
        11,
        `<div class="grid one">
           ${field('ניתנה לציבור התראה מראש', yesNo(fogging.publicWarningGiven))}
           ${field('אופן ההתראה', fogging.publicWarningMethod)}
           ${field('מועד ההתראה', formatDateTime(fogging.publicWarningAt))}
           ${field('הסיבה לאי-מתן התראה', fogging.publicWarningNotGivenReason)}
         </div>`,
      )
    : ''
}

${section(
  'תכשירים ויישום',
  12,
  `${table(
    [
      'המזיק',
      'שם מסחרי',
      'אצווה / סדרת ייצור',
      'חומר פעיל',
      'ריכוז בתכשיר',
      'מינון',
      'יחידה',
      'כמות',
      'בסיס',
      'ריכוז במוכן לשימוש',
      'שיטת היישום',
    ],
    applications.map((a) => [
      text(a.targetPestName),
      text(a.productTradeName),
      text(a.batchNumber),
      text(a.activeIngredientName),
      `${text(a.activeIngredientConcentrationPercent)}%`,
      text(a.dosage),
      text(a.dosageUnit),
      `${text(a.mixtureQuantity)} ${text(a.mixtureUnit, '')} ${escapeHtml(
        MIXTURE_KIND_LABELS[a.mixtureKind as keyof typeof MIXTURE_KIND_LABELS] ?? '',
      )}`,
      `${text(a.basisAmount)} ${text(a.basisUnit, '')} ${escapeHtml(
        QUANTITY_BASIS_LABELS[a.quantityBasis as keyof typeof QUANTITY_BASIS_LABELS] ?? '',
      )}`,
      `${text(a.readyToUseConcentrationPercent)}%${
        a.readyToUseConcentrationDerived ? '<div class="derived">תכשיר מוכן לשימוש — זהה לריכוז בתכשיר</div>' : ''
      }`,
      text(a.applicationMethod),
    ]),
  )}`,
)}

${
  baitStations.length > 0
    ? section(
        'תחנות האכלה',
        12,
        table(
          ['מספר תחנה', 'מיקום', 'מצב', 'רמת אכילה', 'תכשיר', 'הערות'],
          baitStations.map((b) => [
            text(b.stationNumber),
            text(b.locationDescription),
            text(BAIT_STATION_STATUS_LABELS[b.status as keyof typeof BAIT_STATION_STATUS_LABELS] ?? b.status),
            text(b.consumptionLevel),
            text(b.productTradeName),
            text(b.notes),
          ]),
        ),
      )
    : ''
}

${section(
  'אזהרות ומידע במהלך ההדברה ובסיומה',
  13,
  `<div class="grid one">
     ${field('במהלך ההדברה', postWarnings.duringTreatmentInfo)}
     ${field('בסיום ההדברה', postWarnings.afterTreatmentInfo)}
     ${field('נדרש טיפול משלים', yesNo(postWarnings.followUpRequired))}
     ${field('תיאור הטיפול המשלים', postWarnings.followUpDescription)}
     ${field('מועד מתוכנן לטיפול משלים', postWarnings.followUpTargetDate)}
     ${field('אושר ע״י המדביר', `${yesNo(postWarnings.acknowledgedByExterminator)} · ${formatDateTime(postWarnings.acknowledgedAt)}`)}
   </div>`,
)}

${section(
  'מסירת היומן למזמין ההדברה',
  14,
  `<div class="grid">
     ${field('היומן נמסר או הושאר אצל המזמין', yesNo(handover.delivered))}
     ${field('שם האדם שקיבל את היומן', handover.recipientName)}
     ${field('תפקיד המקבל', handover.recipientRole)}
     ${field('דרך המסירה', HANDOVER_METHOD_LABELS[handover.method as keyof typeof HANDOVER_METHOD_LABELS] ?? handover.methodOther)}
     ${field('מועד המסירה', formatDateTime(handover.deliveredAt))}
   </div>
   ${
     input.deliveryNote
       ? `<div class="grid one">${field(
           'מסירה נוספת שתועדה לאחר ההשלמה',
           `${input.deliveryNote.method} · ${input.deliveryNote.recipientName} · ${input.deliveryNote.deliveredAt}`,
         )}</div>`
       : ''
   }`,
)}

${section(
  'חתימות',
  15,
  `<div class="signatures">
     ${signatureBlock('חתימת המדביר', get(snapshot, 'signatures.exterminator.signerName'), input.signatureImages.exterminator, get(snapshot, 'signatures.exterminator.signedAt'))}
     ${assistants
       .map((a, index) =>
         signatureBlock(
           `חתימת המדביר המסייע`,
           get(a, 'signature.signerName') ?? a.fullName,
           input.signatureImages.assistants?.[index],
           get(a, 'signature.signedAt'),
         ),
       )
       .join('')}
     ${signatureBlock('חתימת מקבל היומן', get(snapshot, 'signatures.recipient.signerName'), input.signatureImages.recipient, get(snapshot, 'signatures.recipient.signedAt'))}
   </div>`,
)}

<div class="verify">
  <img src="${input.verificationQr}" alt="קוד אימות">
  <div class="verify-text">
    <div><strong>מזהה אימות לעותק זה</strong></div>
    <code>${escapeHtml(input.verificationId)}</code>
    <div class="note">סריקת הקוד מציגה את פרטי האימות של העותק. המסמך הקובע הוא היומן השמור במערכת.</div>
  </div>
</div>

${snapshot.generalNotes ? `<div class="section"><h2>הערות כלליות<span class="req"></span></h2><div class="grid one">${field('הערות', snapshot.generalNotes)}</div></div>` : ''}

</body>
</html>`;
}

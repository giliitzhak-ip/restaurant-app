/**
 * פענוח חומרים פעילים וריכוזם — מימוש יחיד, משותף ליבואן ולאפליקציה.
 *
 * האלגוריתם סורק את הריכוזים ולוקח כשם החומר את הטקסט שלפני כל ריכוז.
 * פיצול לפי פסיקים אינו אפשרי, משום ששמות כימיים מכילים פסיקים בעצמם:
 *   "N-[[(4-chlorophenyl)amino]carbonyl]-2,6-difluorobenzamide 0.250%"
 * הוא חומר אחד, לא שניים.
 */

export const NOT_ENTERED = 'לא הוזן';

/** מספר ואחריו אחוז או יחידת ריכוז. הדגל g נדרש לסריקה חוזרת. */
const CONCENTRATION_G = /(\d+(?:[.,]\d+)?)\s*(%|g\/l|gr\/l|mg\/kg|ppm)/gi;

function normalizeUnit(unit) {
  const u = String(unit).toLowerCase();
  if (u === '%') return '%';
  if (u === 'gr/l') return 'g/l';
  return u;
}

function formatConcentration(value, unit) {
  const number = String(value).replace(',', '.');
  const u = normalizeUnit(unit);
  return u === '%' ? `${number}%` : `${number} ${u}`;
}

/** מנקה שם חומר משאריות מפרידים, רווחים ושורות חדשות. */
function cleanName(raw) {
  return String(raw ?? '')
    .replace(/\s+/gu, ' ')
    // סימן יחידה יתום ללא מספר לפניו: במקור יש ריכוז חסר, ואין להשאירו בשם
    .replace(/(^|[\s,;|])(%|g\/l|gr\/l|mg\/kg|ppm)(?=$|[\s,;|])/gi, '$1')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s,;|+·•\-–—:]+/u, '')
    .replace(/[\s,;|+·•:]+$/u, '')
    .trim();
}

/**
 * מפענח רשימת חומרים פעילים מטקסט חופשי.
 * `concentrationHint` משמש כשהריכוז מגיע בעמודה נפרדת, ורק כשיש חומר יחיד.
 */
export function parseActiveIngredients(raw, concentrationHint) {
  const text = String(raw ?? '').trim();
  if (!text) return [];

  const found = [];
  let cursor = 0;
  CONCENTRATION_G.lastIndex = 0;
  let match = CONCENTRATION_G.exec(text);

  while (match !== null) {
    const name = cleanName(text.slice(cursor, match.index));
    if (name) {
      found.push({ name, concentration: formatConcentration(match[1], match[2]) });
    }
    cursor = match.index + match[0].length;
    match = CONCENTRATION_G.exec(text);
  }

  // שארית אחרי הריכוז האחרון: חומר נוסף שצוין ללא ריכוז
  const tail = cleanName(text.slice(cursor));
  if (tail) found.push({ name: tail, concentration: NOT_ENTERED });

  if (found.length === 0) {
    const name = cleanName(text);
    if (!name) return [];
    const single = { name, concentration: NOT_ENTERED };
    if (concentrationHint) {
      const hint = parseActiveIngredients(`x ${concentrationHint}`);
      if (hint.length === 1 && hint[0].concentration !== NOT_ENTERED) {
        single.concentration = hint[0].concentration;
      }
    }
    return [single];
  }

  if (found.length === 1 && found[0].concentration === NOT_ENTERED && concentrationHint) {
    const hint = parseActiveIngredients(`x ${concentrationHint}`);
    if (hint.length === 1 && hint[0].concentration !== NOT_ENTERED) {
      return [{ name: found[0].name, concentration: hint[0].concentration }];
    }
  }

  return found;
}

/** תצוגה אחידה: "Bifenthrin 9.6% · Tetramethrin 2%" */
export function formatIngredients(list) {
  if (!list || list.length === 0) return NOT_ENTERED;
  return list.map((i) => `${i.name} ${i.concentration}`).join(' · ');
}

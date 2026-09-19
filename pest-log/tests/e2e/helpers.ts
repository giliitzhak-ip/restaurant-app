import { expect, type Page } from '@playwright/test';

/**
 * עוזרים למילוי האשף בבדיקות E2E.
 * הכל דרך הממשק האמיתי: שדות, כפתורים וחתימות.
 */

/**
 * התחברות דרך הזרימה האמיתית: דוא״ל → קוד חד-פעמי.
 * כך נבדק גם מסך ההתחברות, ולא רק מה שאחריו.
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/');
  const emailField = page.getByLabel('כתובת דוא״ל');
  if (await emailField.isVisible().catch(() => false)) {
    await emailField.fill('exterminator-a@example.test');
    await page.getByRole('button', { name: 'שליחת קישור התחברות' }).click();
    await page.getByLabel('קוד חד-פעמי').fill('123456');
    await page.getByRole('button', { name: 'כניסה' }).click();
  }
  await expect(page.getByRole('heading', { name: /שלום/ })).toBeVisible({ timeout: 30_000 });
}

export async function gotoNewLog(page: Page): Promise<void> {
  await login(page);
  await page.getByRole('button', { name: '+ יומן הדברה חדש' }).click();
  await expect(page.getByRole('navigation', { name: 'שלבי מילוי היומן' })).toBeVisible();
}

export async function goToStep(page: Page, step: number): Promise<void> {
  await page.getByRole('navigation', { name: 'שלבי מילוי היומן' }).getByRole('button').nth(step - 1).click();
}

/** ממלא שדה לפי התווית שלו. */
export async function fill(page: Page, label: string | RegExp, value: string): Promise<void> {
  await page.getByLabel(label, { exact: typeof label === 'string' }).first().fill(value);
}

/** חותם על לוח חתימה ומאשר. */
export async function signPad(page: Page, padLabel: string): Promise<void> {
  const canvas = page.getByRole('img', { name: `אזור חתימה עבור ${padLabel}` });
  const box = await canvas.boundingBox();
  if (!box) throw new Error(`לא נמצא לוח חתימה: ${padLabel}`);

  // ציור בפועל עם מגע/עכבר — זה מה שמייצר את ה-PNG.
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.3, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.7, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.4, { steps: 8 });
  await page.mouse.up();

  const container = canvas.locator('..');
  await container.getByRole('button', { name: 'אישור החתימה' }).click();
  await expect(container.getByText(/החתימה אושרה/)).toBeVisible();
}

/** שלב 1 — צדדים. */
export async function fillStep1(page: Page): Promise<void> {
  await goToStep(page, 1);
  await fill(page, 'שם מלא', 'מדביר בדיקה');
  await fill(page, 'סוג רישיון', 'הדברה תברואית');
  await fill(page, 'מספר רישיון', 'E2E-0001');
  await fill(page, 'טלפון נייד', '0500000001');
  await fill(page, 'דוא״ל', 'e2e-exterminator@example.test');
  await fill(page, 'כתובת', 'רחוב הבדיקה 1, עיר הבדיקה');

  await fill(page, 'שם מזמין ההדברה', 'מזמין בדיקה');
  await page.getByLabel('המזמין הוא אדם פרטי').check();
  await fill(page, 'מספר טלפון', '0500000011');
  await fill(page, 'מספר נייד', '0500000011');
  await fill(page, 'תפקידו', 'בעל הדירה');
}

/** שלב 2 — מקום ומועד (דירה כברירת מחדל). */
export async function fillStep2Dwelling(page: Page): Promise<void> {
  await goToStep(page, 2);
  await page.getByLabel('סוג מקום ההדברה').selectOption('dwelling');
  await fill(page, 'עיר', 'עיר הבדיקה');
  await fill(page, 'רחוב', 'רחוב הבדיקה');
  await fill(page, 'מספר בית', '12');
  await fill(page, 'מספר דירה', '3');
  await fill(page, 'סוג המבנה', 'דירה בבניין');
  await page.getByRole('button', { name: 'מילוי לפי הזמן הנוכחי' }).click();
}

/** שלב 3 — ממצא ניטור אחד. */
export async function fillStep3(page: Page, pestName = 'מזיק דוגמה 1'): Promise<void> {
  await goToStep(page, 3);
  await page.getByRole('button', { name: '+ הוספת מזיק' }).click();
  await fill(page, 'שם המזיק', pestName);
  await fill(page, 'פעולות הזיהוי', 'בדיקה חזותית ופריסת מלכודות ניטור במטבח ל-48 שעות.');
  await fill(page, 'דרגת התפתחות', 'בוגרים');
  await fill(page, 'סימני נגיעות', 'הפרשות מתחת לכיור ושרידי נשל מאחורי המקרר.');
  await fill(page, 'מיקום הממצא', 'מטבח — מתחת לכיור');
  await page.getByLabel('רמת נגיעות').selectOption('medium');
}

/** שלב 4 — מניעה ותכשיר. */
export async function fillStep4(page: Page, pestName = 'מזיק דוגמה 1'): Promise<void> {
  await goToStep(page, 4);

  await page.getByRole('button', { name: '+ הוספת פעולת מניעה' }).click();
  await fill(page, 'תיאור הפעולה', 'איטום סדקים סביב צנרת המטבח');
  await page.getByLabel('מצב הפעולה').selectOption('performed');
  await fill(
    page,
    'הנסיבות שבגללן הוחלט לבצע הדברה ולא טיפול אחר',
    'פעולות המניעה בוצעו אך הנגיעות נמשכה ונמצאו בוגרים פעילים באזור הכנת מזון.',
  );

  await page.getByRole('button', { name: '+ הוספת תכשיר' }).click();
  await fill(page, 'שם המזיק', pestName);
  await fill(page, 'השם המסחרי של התכשיר', 'תכשיר דוגמה ריכוז');
  await fill(page, 'מספר אצווה / סדרת ייצור', 'BATCH-E2E-01');
  await fill(page, 'שם החומר הפעיל', 'חומר פעיל לדוגמה A');
  await fill(page, 'ריכוז החומר הפעיל בתכשיר (%)', '10');
  await fill(page, 'מינון', '25');
  await fill(page, 'יחידת המידה', 'מ״ל/ליטר');
  await page.getByLabel('סוג הכמות').selectOption('solution');
  await fill(page, 'כמות', '5');
  await fill(page, 'יחידת הכמות', 'ליטר');
  await page.getByLabel('הבסיס').selectOption('area');
  await fill(page, 'גודל', '85');
  await fill(page, 'יחידת הבסיס', 'מ״ר');
  await fill(page, 'ריכוז החומר הפעיל בתכשיר המוכן לשימוש (%)', '0.25');
  await fill(page, 'שיטת היישום', 'ריסוס נקודתי');
}

/** שלב 5 — אזהרות ואישורן. */
export async function fillStep5(page: Page): Promise<void> {
  await goToStep(page, 5);
  await fill(page, 'תיאור מפורט של טיב ההדברה', 'ריסוס נקודתי של סדקים וחריצים במטבח לפי תווית התכשיר.');
  await fill(page, 'סיכונים לאדם', 'גירוי בעור, בעיניים ובדרכי הנשימה. אין לשהות באזור בזמן הריסוס.');
  await fill(page, 'סיכונים לבעלי חיים', 'רעיל לדגים ולחיות מחמד. יש להרחיק אקווריומים.');
  await fill(page, 'זמן כניסה מחדש (שעות)', '4');
  await fill(page, 'אסמכתת תווית התכשיר', 'תווית תכשיר דוגמה — מהדורה 2026');
  await fill(page, 'הוראות נוספות לפי תווית התכשיר', 'לאוורר 30 דקות לפני הכניסה ולשטוף משטחי מזון.');
  await page.getByLabel('הוחלה ההנחיה המחמירה ביותר על כל התכשירים').check();
  await page.getByLabel(/אני, המדביר, מאשר שהאזהרות/).check();

  await fill(page, 'אזהרות ומידע במהלך ההדברה', 'אין להיכנס לאזור המטופל במהלך הריסוס.');
  await fill(page, 'אזהרות ומידע בסיום ההדברה', 'לאוורר 30 דקות ולנגב משטחי מזון.');
  await page.getByLabel(/אני, המדביר, מאשר את האזהרות והמידע/).check();
}

/** שלב 6 — מסירה וחתימות. */
export async function fillStep6(page: Page): Promise<void> {
  await goToStep(page, 6);
  await page.getByLabel('היומן נמסר או הושאר אצל מזמין ההדברה').check();
  await fill(page, 'שם האדם שקיבל את היומן', 'מקבל בדיקה');
  await page.getByLabel('דרך המסירה').selectOption('handed_in_person');
  await signPad(page, 'חתימת המדביר');
  await signPad(page, 'חתימת האדם שקיבל את היומן');
}

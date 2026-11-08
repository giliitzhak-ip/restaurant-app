import type { NotificationEvent } from './types';

export interface TemplateInput {
  jobTitle?: string;
  jobReference?: string;
  providerName?: string;
  customerName?: string;
  price?: string;
  commission?: string;
  balance?: string;
  shortfall?: string;
  eta?: string;
  rating?: number;
  reason?: string;
}

type Template = (input: TemplateInput) => { title: string; body: string };

/**
 * Hebrew copy for every notification event. Kept beside the service rather than
 * inline in call sites so a locale can be added by extending this map.
 */
export const templates: Record<NotificationEvent, Template> = {
  job_created: ({ jobTitle }) => ({
    title: 'הבקשה נשלחה',
    body: `הבקשה "${jobTitle ?? 'שלך'}" נשלחה. אנחנו מחפשים בעלי מקצוע באזור שלך.`,
  }),
  new_job_for_provider: ({ jobTitle }) => ({
    title: 'עבודה חדשה באזור שלך',
    body: `${jobTitle ?? 'עבודה חדשה'} — כנס לראות פרטים ולשלוח הצעה.`,
  }),
  new_offer: ({ providerName, price }) => ({
    title: 'התקבלה הצעת מחיר',
    body: `${providerName ?? 'בעל מקצוע'} שלח הצעה${price ? ` על סך ${price}` : ''}.`,
  }),
  offer_accepted: ({ customerName, jobTitle }) => ({
    title: 'ההצעה שלך התקבלה',
    body: `${customerName ?? 'הלקוח'} בחר בך לעבודה "${jobTitle ?? ''}". אפשר לצאת לדרך.`,
  }),
  provider_on_the_way: ({ providerName, eta }) => ({
    title: 'בעל המקצוע בדרך אליך',
    body: `${providerName ?? 'בעל המקצוע'} יצא לדרך${eta ? `, זמן הגעה משוער ${eta}` : ''}.`,
  }),
  provider_arrived: ({ providerName }) => ({
    title: 'בעל המקצוע הגיע',
    body: `${providerName ?? 'בעל המקצוע'} הגיע לכתובת.`,
  }),
  job_completed: ({ jobTitle }) => ({
    title: 'העבודה הושלמה',
    body: `"${jobTitle ?? 'העבודה'}" סומנה כהושלמה. נשמח שתדרג את השירות.`,
  }),
  confirmation_requested: ({ jobTitle, providerName }) => ({
    title: 'לאשר שהעבודה בוצעה?',
    body: `${providerName ?? 'בעל המקצוע'} סימן ש"${jobTitle ?? 'העבודה'}" הושלמה. אישור קצר שלך עוזר לנו לדעת שהכול קרה כמו שצריך.`,
  }),
  job_confirmed: ({ jobTitle, customerName }) => ({
    title: 'הלקוח אישר את העבודה',
    body: `${customerName ?? 'הלקוח'} אישר שהעבודה "${jobTitle ?? ''}" בוצעה. הדירוג והניסיון שלך עודכנו.`,
  }),
  commission_charged: ({ commission, jobTitle, balance }) => ({
    title: 'נגבתה עמלה',
    body: `עמלה${commission ? ` של ${commission}` : ''} נגבתה מהיתרה עבור "${jobTitle ?? 'העבודה'}"${balance ? `. יתרה נוכחית: ${balance}` : ''}. את התשלום על העבודה עצמה אתה גובה ישירות מהלקוח.`,
  }),
  commission_refunded: ({ commission, reason }) => ({
    title: 'העמלה הוחזרה ליתרה',
    body: `${commission ?? 'העמלה'} הוחזרה ליתרה שלך${reason ? ` — ${reason}` : ''}.`,
  }),
  balance_low: ({ balance }) => ({
    title: 'היתרה מתקרבת לסוף',
    body: `היתרה שלך${balance ? ` היא ${balance}` : ''}. כשהיא מתרוקנת לא נוכל להעביר אליך עבודות חדשות.`,
  }),
  balance_blocked: ({ shortfall }) => ({
    title: 'העברת עבודות הופסקה',
    body: `אין יתרה לגביית עמלה, ולכן לא נשלחות אליך עבודות חדשות${shortfall ? `. נדרשת טעינה של ${shortfall}` : ''}.`,
  }),
  topup_completed: ({ balance }) => ({
    title: 'היתרה נטענה',
    body: `הטעינה הושלמה${balance ? `. יתרה נוכחית: ${balance}` : ''}. אתה שוב מקבל עבודות.`,
  }),
  job_lost_no_balance: ({ jobTitle, commission }) => ({
    title: 'עבודה אבדה בגלל יתרה',
    body: `לקוח בחר בך ל"${jobTitle ?? 'עבודה'}" אבל לא היה אפשר לגבות את העמלה${commission ? ` (${commission})` : ''}. טען יתרה כדי לא לפספס עבודות נוספות.`,
  }),
  new_message: ({ customerName, providerName }) => ({
    title: 'הודעה חדשה',
    body: `קיבלת הודעה מ${providerName ?? customerName ?? 'הצד השני'}.`,
  }),
  new_review: ({ rating }) => ({
    title: 'התקבל דירוג חדש',
    body: `קיבלת דירוג${rating ? ` של ${rating} כוכבים` : ''}.`,
  }),
  provider_verified: () => ({
    title: 'החשבון שלך אומת',
    body: 'האימות הושלם. אפשר להדליק "זמין" ולהתחיל לקבל עבודות.',
  }),
  provider_rejected: ({ reason }) => ({
    title: 'החשבון לא אושר',
    body: reason ? `הבקשה נדחתה: ${reason}` : 'הבקשה נדחתה. אפשר לפנות לתמיכה לפרטים.',
  }),
  job_cancelled: ({ jobTitle, reason }) => ({
    title: 'העבודה בוטלה',
    body: `"${jobTitle ?? 'העבודה'}" בוטלה${reason ? `: ${reason}` : ''}.`,
  }),
  dispute_opened: ({ jobReference }) => ({
    title: 'נפתחה תלונה',
    body: `נפתחה תלונה על עבודה ${jobReference ?? ''}. צוות GET SERVICE יבחן אותה.`,
  }),
};

export function renderTemplate(event: NotificationEvent, input: TemplateInput = {}) {
  return templates[event](input);
}

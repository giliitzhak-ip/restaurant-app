import type { NotificationEvent } from './types';

export interface TemplateInput {
  jobTitle?: string;
  jobReference?: string;
  providerName?: string;
  customerName?: string;
  price?: string;
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
  payment_completed: ({ price }) => ({
    title: 'התשלום הושלם',
    body: `התשלום${price ? ` על סך ${price}` : ''} הושלם בהצלחה.`,
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

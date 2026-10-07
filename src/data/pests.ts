import type { Pest } from '../types';

export const PESTS: Pest[] = [
  { id: 'american_roach', name: 'תיקן אמריקאי', aliases: ['ג\'וק', 'תיקן', 'american cockroach', 'periplaneta'], group: 'crawling' },
  { id: 'german_roach', name: 'תיקן גרמני', aliases: ['ג\'וק קטן', 'german cockroach', 'blattella'], group: 'crawling' },
  { id: 'ants', name: 'נמלים', aliases: ['נמלה', 'ants', 'ant'], group: 'crawling' },
  { id: 'bed_bug', name: 'פשפש המיטה', aliases: ['פשפשים', 'פשפש', 'bed bug', 'bedbug', 'cimex'], group: 'crawling' },
  { id: 'fleas', name: 'פרעושים', aliases: ['פרעוש', 'fleas', 'flea'], group: 'crawling' },
  { id: 'ticks', name: 'קרציות', aliases: ['קרצייה', 'קרציה', 'ticks', 'tick'], group: 'crawling' },
  { id: 'flies', name: 'זבובים', aliases: ['זבוב', 'flies', 'fly'], group: 'flying' },
  { id: 'mosquitoes', name: 'יתושים', aliases: ['יתוש', 'mosquito', 'mosquitoes'], group: 'flying' },
  { id: 'mice', name: 'עכברים', aliases: ['עכבר', 'mice', 'mouse'], group: 'rodent' },
  { id: 'rats', name: 'חולדות', aliases: ['חולדה', 'rats', 'rat'], group: 'rodent' },
  { id: 'wasps', name: 'צרעות', aliases: ['צרעה', 'דבורים', 'wasps', 'wasp'], group: 'flying' },
  { id: 'other_crawling', name: 'חרקים זוחלים אחרים', aliases: ['זוחלים', 'crawling insects'], group: 'crawling' },
  { id: 'other', name: 'אחר', aliases: ['other'], group: 'other' },
];

export const pestById = (id: string): Pest | undefined => PESTS.find((p) => p.id === id);
export const pestName = (id: string): string => pestById(id)?.name ?? id;

export const SIGNS = [
  'צואה', 'הפרשות', 'עקבות', 'נגיסות', 'קינון', 'ביצים/נרתיקי ביצים',
  'פרטים חיים', 'פרטים מתים', 'ריח אופייני', 'שלד חיצוני/הפשטות',
];

export const AREAS = [
  'מטבח', 'חדר אמבטיה', 'שירותים', 'חדר שינה', 'סלון', 'מחסן', 'חצר',
  'גינה', 'חדר אשפה', 'מרתף', 'גג', 'צנרת/שוחות', 'ארונות', 'מאחורי מקרר',
  'מאחורי תנור', 'לוח חשמל', 'קו היקפי חיצוני', 'חדר מדרגות', 'חניון',
];

export const EQUIPMENT = [
  'מרסס גב', 'מרסס ידני', 'מפיץ אבקה', 'שואב שטח', 'פנס בדיקה',
  'אקדח ג\'ל', 'תיבות האכלה', 'מלכודות דבק', 'מלכודות מכניות', 'סולם', 'ציוד מגן אישי',
];

export const PRE_TREATMENT_ACTIONS = [
  'ניטור', 'איטום סדקים וחורים', 'ניקוי', 'שאיבה', 'פינוי מפגעים',
  'הצבת מלכודות', 'הדרכת הלקוח',
];

export const PREVENTION_RECOMMENDATIONS = [
  'איטום סדקים וחורים בקירות ובריצוף',
  'תיקון נזילות והרטבות',
  'שמירה על ניקיון וסילוק שאריות מזון',
  'אחסון מזון במיכלים אטומים',
  'פינוי אשפה בתדירות גבוהה וסגירת מכלי אשפה',
  'התקנת רשתות והרחקת צמחייה מהמבנה',
  'איוורור וייבוש אזורים לחים',
];

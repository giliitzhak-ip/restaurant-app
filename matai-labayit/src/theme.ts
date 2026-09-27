import { I18nManager, Platform } from 'react-native';

// עיצוב: צבעים חמים ונקיים, ניגודיות גבוהה לטקסט (AA ומעלה), אזורי לחיצה של 48px לפחות.
export const colors = {
  bg: '#F6F3EE',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEAE2',
  ink: '#1E1C19',
  inkSoft: '#57514A', // ניגודיות 7:1 מול bg
  muted: '#6B655C', // ניגודיות ~5:1 מול bg
  line: '#DDD6CB',
  primary: '#2E4A3D', // ירוק עמוק
  primaryPressed: '#23392F',
  onPrimary: '#FFFFFF',
  accent: '#A87C4F', // פליז
  accentSoft: '#F3E8DA',
  danger: '#A5322B',
  dangerSoft: '#F8E3E1',
  warning: '#8A5A00',
  warningSoft: '#FFF3D6',
  success: '#2F6B45',
  successSoft: '#E2F1E6',
  canvasBg: '#1B1A18',
  overlay: 'rgba(20,18,16,0.55)',
  selection: '#E7B35A',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const touch = 48;

export const type = {
  display: { fontSize: 30, fontWeight: '700' as const, color: colors.ink, letterSpacing: -0.3 },
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.ink },
  heading: { fontSize: 17, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 16, color: colors.ink, lineHeight: 23 },
  small: { fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  tiny: { fontSize: 12, color: colors.muted },
};

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

// ---------- כיווניות (RTL) ----------
// ב-iOS/Android במצב RTL, React Native הופך את 'row' ואת textAlign 'right'↔'left' בעצמו.
// בדפדפן הכיווניות מגיעה מ-dir="rtl". הקבועים כאן מבטיחים מראה נכון בשני המצבים,
// וגם בהפעלה הראשונה ב-Expo Go לפני שהמערכת עברה ל-RTL.
const nativeRTL = Platform.OS !== 'web' && I18nManager.isRTL;
export const IS_RTL_LAYOUT = Platform.OS === 'web' || nativeRTL;
/** שורה שמתחילה מימין */
export const ROW = (IS_RTL_LAYOUT ? 'row' : 'row-reverse') as 'row' | 'row-reverse';
/** יישור טקסט לימין */
export const TEXT_RIGHT = (nativeRTL ? 'left' : 'right') as 'left' | 'right';
export const rtl = { textAlign: TEXT_RIGHT, writingDirection: 'rtl' as const };
/** כיוון משמאל לימין לאזורי ציור (קואורדינטות קנבס). בדפדפן אין צורך (ואין תמיכה במאפיין). */
export const LTR = (Platform.OS === 'web' ? {} : { direction: 'ltr' }) as object;

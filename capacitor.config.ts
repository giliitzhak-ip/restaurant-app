import type { CapacitorConfig } from '@capacitor/cli';

/**
 * תצורת Capacitor – עטיפת האפליקציה לאפליקציה מקומפלת לאנדרואיד ול-iOS.
 *
 * לפני סנכרון יש לבנות את האפליקציה כשהיא מצביעה על שרת אמיתי:
 *   VITE_API_BASE=https://your-server npm run build && npx cap sync
 *
 * ללא VITE_API_BASE הסנכרון לשרת לא יעבוד באפליקציה המקומפלת,
 * משום שה-webview רץ מ-capacitor://localhost ולא מכתובת השרת.
 */
const config: CapacitorConfig = {
  appId: 'il.co.yizhakhadbarot.journal',
  appName: 'יומן הדברה',
  webDir: 'dist',
  // רקע זהה לרקע האפליקציה, כדי שלא יהבהב לבן בפתיחה
  backgroundColor: '#F4F7F5',
  android: {
    backgroundColor: '#F4F7F5',
    // מונע זום מקרי בשדות הטופס בזמן עבודה ביד אחת
    zoomEnabled: false,
  },
  ios: {
    backgroundColor: '#F4F7F5',
    // שומר על אזורי הבטחה של iOS יחד עם ה-safe-area שבעיצוב
    contentInset: 'always',
    scrollEnabled: true,
    zoomEnabled: false,
  },
};

export default config;

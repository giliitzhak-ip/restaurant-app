// נקודת כניסה לדפדפן: טוענים את CanvasKit (Skia ל-Web) לפני שמסכי האפליקציה נטענים.
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(() => {
  require('expo-router/entry');
});

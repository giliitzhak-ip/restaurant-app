import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { I18nManager, Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FeedbackProvider } from '@/components/Feedback';
import { IconButton, Loading } from '@/components/ui';
import { recoverPendingCapture } from '@/services/media';
import { isLoaded, loadDB } from '@/storage/db';
import { colors, type } from '@/theme';

// עברית מימין לשמאל. ב-iOS/Android ההגדרה נקבעת גם ב-app.json (expo-localization: forcesRTL).
if (Platform.OS !== 'web') {
  I18nManager.allowRTL(true);
  if (!I18nManager.isRTL) I18nManager.forceRTL(true);
} else if (typeof document !== 'undefined') {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'he';
  document.title = 'מתאים לבית';
}

export default function RootLayout() {
  const [ready, setReady] = useState(isLoaded());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadDB()
      .then(() => {
        setReady(true);
        // אנדרואיד: אם המערכת סגרה את האפליקציה בזמן הצילום – מחזירים את המשתמש לאותו מסך עם התמונה
        recoverPendingCapture()
          .then((r) => {
            if (!r) return;
            const pending = { pendingRef: r.photo.ref, pendingW: String(r.photo.width), pendingH: String(r.photo.height) };
            setTimeout(() => {
              if (r.ctx.purpose === 'room') router.push({ pathname: '/room/new', params: pending });
              else router.push({ pathname: '/add-product', params: { ...r.ctx.params, ...pending } });
            }, 300);
          })
          .catch(() => undefined);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <FeedbackProvider>
          <StatusBar style="dark" />
          {error ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <Text style={type.heading}>לא הצלחנו לטעון את הנתונים השמורים</Text>
              <Text style={type.small}>{error}</Text>
            </View>
          ) : !ready ? (
            <Loading label="טוען…" />
          ) : (
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.ink,
                headerTitleStyle: { fontWeight: '700', fontSize: 18 },
                headerShadowVisible: false,
                headerTitleAlign: 'center',
                headerBackTitle: 'חזרה',
                contentStyle: { backgroundColor: colors.bg },
                // בדפדפן החץ של הניווט לא מתהפך אוטומטית – בעברית "חזרה" מצביע ימינה
                ...(Platform.OS === 'web'
                  ? { headerLeft: ({ canGoBack }: { canGoBack?: boolean }) => (canGoBack ? <IconButton icon="arrow-right" label="חזרה" onPress={() => router.back()} /> : null) }
                  : {}),
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="home" options={{ headerShown: false }} />
              <Stack.Screen name="store" options={{ title: 'אני בחנות עכשיו' }} />
              <Stack.Screen name="room/new" options={{ title: 'חדר חדש' }} />
              <Stack.Screen name="room/[roomId]" options={{ title: 'החדר' }} />
              <Stack.Screen name="add-product" options={{ title: 'הוספת מוצר' }} />
              <Stack.Screen name="cutout/[productId]" options={{ title: 'חיתוך המוצר' }} />
              <Stack.Screen name="editor/[designId]" options={{ headerShown: false }} />
              <Stack.Screen name="compare" options={{ title: 'השוואת אפשרויות' }} />
              <Stack.Screen name="product/[productId]" options={{ title: 'פרטי מוצר' }} />
              <Stack.Screen name="shopping" options={{ title: 'רשימת קניות ומועדפים' }} />
              <Stack.Screen name="settings" options={{ title: 'הגדרות ונתונים' }} />
            </Stack>
          )}
        </FeedbackProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

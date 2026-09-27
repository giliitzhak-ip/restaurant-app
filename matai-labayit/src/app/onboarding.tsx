import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedback } from '@/components/Feedback';
import { Button, Icon, type IconName } from '@/components/ui';
import { loadDemo } from '@/demo/demo';
import { updateThumbnail } from '@/editor/exporter';
import { updateSettings, getState, designsForRoom } from '@/storage/db';
import { colors, radius, ROW, rtl, space, type } from '@/theme';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'home-outline', title: 'מצלמים את החדר', text: 'תמונה אחת של הקיר או הפינה שרוצים לשדרג.' },
  { icon: 'store-outline', title: 'מצלמים מוצר בחנות', text: 'בכל חנות, בלי קטלוג – האפליקציה מסירה את רקע החנות.' },
  { icon: 'sofa-outline', title: 'רואים אותו אצלכם', text: 'מזיזים, משנים גודל, משווים אפשרויות – ואז קונים בביטחון.' },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { toast } = useFeedback();
  const [loading, setLoading] = useState(false);

  const start = () => {
    updateSettings({ onboardingDone: true });
    router.replace('/home');
    router.push('/room/new');
  };
  const demo = async () => {
    setLoading(true);
    try {
      const { roomId, designId } = await loadDemo();
      updateSettings({ onboardingDone: true, lastRoomId: roomId });
      designsForRoom(getState(), roomId).forEach((d) => updateThumbnail(d.id).catch(() => undefined));
      router.replace('/home');
      router.push({ pathname: '/editor/[designId]', params: { designId } });
    } catch (e) {
      toast(`טעינת הדוגמה נכשלה: ${(e as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.inner}>
        <View style={styles.logo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="sofa-outline" size={40} color={colors.onPrimary} />
        </View>
        <Text style={[type.display, rtl]} accessibilityRole="header">
          מתאים לבית
        </Text>
        <Text style={[type.body, rtl, { color: colors.inkSoft, fontSize: 18, lineHeight: 26 }]}>
          עומדים בחנות ומתלבטים? צלמו את המוצר ותראו מיד איך הוא ייראה אצלכם בבית – צבע, גודל ומיקום.
        </Text>
        <View style={{ gap: space.md, marginTop: space.md }}>
          {STEPS.map((s, i) => (
            <View key={s.title} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.heading, rtl]}>{s.title}</Text>
                <Text style={[type.small, rtl]}>{s.text}</Text>
              </View>
              <Icon name={s.icon} color={colors.accent} size={26} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <Text style={[type.tiny, rtl, { marginBottom: space.sm }]}>
          בלי הרשמה. החדרים והתמונות נשמרים רק בטלפון שלכם, ולא עולים לשום שרת בלי שתבקשו.
        </Text>
        <Button label="מתחילים – צילום החדר" icon="camera-outline" size="lg" onPress={start} testID="start" />
        <Button label="לנסות עם חדר לדוגמה" variant="ghost" onPress={demo} loading={loading} testID="demo" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.xl },
  inner: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', gap: space.md },
  logo: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  step: { flexDirection: ROW, gap: space.md, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.line },
  stepNum: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
});

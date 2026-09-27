import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch as RNSwitch, Text, View } from 'react-native';
import { useFeedback } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, Divider, Field, H2, P } from '@/components/ui';
import { hasDemo, loadDemo, removeDemo } from '@/demo/demo';
import { updateThumbnail } from '@/editor/exporter';
import { checkServer, type CloudCapabilities } from '@/services/cloud';
import { designsForRoom, getState, referencedImages, updateSettings, useDB, wipeAll } from '@/storage/db';
import { clearImages, deleteImage, listImages } from '@/storage/imageStore';
import { colors, ROW, rtl, space, type, LTR } from '@/theme';

// ב-react-native-web המתג לא מוצג נכון בכיוון RTL – עוטפים בכיוון LTR
const Switch = (props: React.ComponentProps<typeof RNSwitch>) =>
  Platform.OS === 'web' ? (
    <View {...({ dir: 'ltr' } as object)}>
      <RNSwitch {...props} />
    </View>
  ) : (
    <RNSwitch {...props} />
  );

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

export default function Settings() {
  const settings = useDB((s) => s.settings);
  const counts = useDB((s) => ({ rooms: Object.keys(s.rooms).length, products: Object.keys(s.products).length, designs: Object.keys(s.designs).length }));
  const demoLoaded = useDB(() => hasDemo());
  const { confirm, toast } = useFeedback();
  const [url, setUrl] = useState(settings.cloud.serverUrl);
  const [caps, setCaps] = useState<CloudCapabilities | null>(null);
  const [checking, setChecking] = useState(false);
  const [imgStats, setImgStats] = useState<{ count: number; bytes: number; orphans: string[]; orphanBytes: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refreshImages = useCallback(async () => {
    const list = await listImages();
    const used = referencedImages();
    const orphans = list.filter((i) => !used.has(i.ref));
    setImgStats({ count: list.length, bytes: list.reduce((s, i) => s + i.bytes, 0), orphans: orphans.map((o) => o.ref), orphanBytes: orphans.reduce((s, i) => s + i.bytes, 0) });
  }, []);
  useEffect(() => {
    refreshImages().catch(() => undefined);
  }, [refreshImages, counts.products, counts.rooms, counts.designs]);

  const toggleCloud = async (on: boolean) => {
    if (!on) {
      updateSettings({ cloud: { ...settings.cloud, enabled: false } });
      return;
    }
    const ok = await confirm(
      'הפעלת עיבוד בענן',
      'כשתבקשו במפורש (למשל "הסרה בענן" או "זיהוי בענן"), התמונה הרלוונטית תישלח לשרת שכתובתו מוגדרת כאן. תמונות לא נשלחות אוטומטית, ובכל שליחה של תמונת חדר תתבקשו לאשר שוב. בלי השירות, כל היכולות הבסיסיות עובדות במכשיר.',
      'מאשר/ת',
    );
    if (ok) updateSettings({ cloud: { ...settings.cloud, enabled: true, consentAt: Date.now() } });
  };

  const test = async () => {
    setChecking(true);
    setCaps(null);
    try {
      const c = await checkServer(url.trim());
      setCaps(c);
      updateSettings({ cloud: { ...settings.cloud, serverUrl: url.trim() } });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setChecking(false);
    }
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <H2>הנתונים שלכם</H2>
      <Card style={{ gap: space.sm }}>
        <P>
          {counts.rooms} חדרים · {counts.designs} גרסאות · {counts.products} מוצרים
        </P>
        <P muted>הכול נשמר מקומית בטלפון בלבד, בלי חשבון משתמש. גיבוי וסנכרון לענן אפשר להוסיף בהמשך.</P>
        {imgStats && (
          <P muted>
            {imgStats.count} תמונות שמורות · {mb(imgStats.bytes)}
            {imgStats.orphans.length ? ` · ${imgStats.orphans.length} קבצים שאינם בשימוש (${mb(imgStats.orphanBytes)})` : ''}
          </P>
        )}
        {!!imgStats?.orphans.length && (
          <Button
            label="ניקוי תמונות שאינן בשימוש"
            variant="secondary"
            loading={busy === 'orphans'}
            onPress={() =>
              run('orphans', async () => {
                for (const r of imgStats.orphans) await deleteImage(r);
                await refreshImages();
                toast('התמונות המיותרות נמחקו', 'success');
              })
            }
          />
        )}
      </Card>

      <H2>נתוני הדגמה</H2>
      <Card style={{ gap: space.sm }}>
        <P muted>חדר לדוגמה עם ספה, מנורה, צבעי קיר ופרקט – כדי להתנסות בלי לצלם. אפשר להסיר בכל רגע.</P>
        {demoLoaded ? (
          <Button
            label="הסרת נתוני ההדגמה"
            variant="danger"
            loading={busy === 'demo'}
            testID="remove-demo"
            onPress={() =>
              run('demo', async () => {
                await removeDemo();
                await refreshImages();
                toast('נתוני ההדגמה הוסרו', 'success');
              })
            }
          />
        ) : (
          <Button
            label="טעינת חדר לדוגמה"
            variant="secondary"
            loading={busy === 'demo'}
            testID="load-demo"
            onPress={() =>
              run('demo', async () => {
                const { roomId } = await loadDemo();
                for (const d of designsForRoom(getState(), roomId)) await updateThumbnail(d.id).catch(() => undefined);
                toast('החדר לדוגמה נוסף', 'success');
              })
            }
          />
        )}
      </Card>

      <H2>עיבוד בענן (לא חובה)</H2>
      <Card style={{ gap: space.md }}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, rtl, { fontWeight: '700' }]}>שימוש בשרת עיבוד</Text>
            <Text style={[type.tiny, rtl]}>הסרת רקע וזיהוי משטחים מדויקים יותר. דורש שרת משלכם (ראו README).</Text>
          </View>
          <Switch value={settings.cloud.enabled} onValueChange={toggleCloud} accessibilityLabel="שימוש בשרת עיבוד" trackColor={{ true: colors.primary, false: colors.line }} />
        </View>
        {settings.cloud.enabled && (
          <>
            <Field label="כתובת השרת" value={url} onChangeText={setUrl} placeholder="https://your-server.example.com" autoCapitalize="none" keyboardType="url" style={{ ...LTR, textAlign: 'left' } as never} />
            <Button label="בדיקת חיבור ושמירה" variant="secondary" onPress={test} loading={checking} disabled={!url.trim()} />
            {caps && (
              <Banner
                kind={caps.removeBackground || caps.segmentSurface ? 'success' : 'warning'}
                text={`מחובר${caps.mock ? ' (מצב דמה)' : ''}. הסרת רקע: ${caps.removeBackground ? 'זמינה' : 'לא הוגדרה'} · זיהוי משטחים: ${caps.segmentSurface ? 'זמין' : 'לא הוגדר'}`}
              />
            )}
          </>
        )}
        <P muted>מפתחות API נשמרים רק בשרת, לעולם לא באפליקציה. תמונות הבית לא עולות לשרת בלי פעולה ואישור מפורשים.</P>
      </Card>

      <H2>תצוגה</H2>
      <Card style={{ gap: space.sm }}>
        <View style={styles.switchRow}>
          <Text style={[type.body, rtl, { flex: 1 }]}>הצגת טיפים לצילום</Text>
          <Switch value={settings.showTips} onValueChange={(v) => updateSettings({ showTips: v })} accessibilityLabel="הצגת טיפים לצילום" trackColor={{ true: colors.primary, false: colors.line }} />
        </View>
        <Divider />
        <Button label="הצגת מסך הפתיחה שוב" variant="ghost" onPress={() => { updateSettings({ onboardingDone: false }); router.replace('/onboarding'); }} />
      </Card>

      <H2>מחיקת נתונים</H2>
      <Card style={{ gap: space.sm }}>
        <P muted>מחיקה של כל החדרים, הגרסאות, המוצרים והתמונות מהטלפון. אי אפשר לשחזר.</P>
        <Button
          label="מחיקת כל הנתונים"
          variant="danger"
          icon="delete-outline"
          loading={busy === 'wipe'}
          testID="wipe"
          onPress={async () => {
            if (!(await confirm('למחוק הכול?', 'כל החדרים, הגרסאות, המוצרים והתמונות יימחקו לצמיתות מהטלפון.', 'מחיקה', true))) return;
            await run('wipe', async () => {
              await wipeAll();
              await clearImages();
              await refreshImages();
              toast('כל הנתונים נמחקו', 'success');
            });
          }}
        />
      </Card>
      <Text style={[type.tiny, { textAlign: 'center' }]}>מתאים לבית · גרסה 1.0.0 · כל ההדמיות להמחשה בלבד</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: ROW, alignItems: 'center', gap: space.md, minHeight: 48 },
});

import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedback } from '@/components/Feedback';
import { StoredImage } from '@/components/StoredImage';
import { Button, Card, Icon, IconButton } from '@/components/ui';
import { loadDemo } from '@/demo/demo';
import { updateThumbnail } from '@/editor/exporter';
import { designsForRoom, getState, updateSettings, useDB, type DBState } from '@/storage/db';
import { colors, radius, ROW, rtl, shadow, space, type } from '@/theme';

const selectRooms = (s: DBState) =>
  Object.values(s.rooms)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((r) => {
      const designs = designsForRoom(s, r.id);
      const latest = [...designs].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return { room: r, count: designs.length, thumb: latest?.thumbnail ?? r.photo };
    });

const selectCounts = (s: DBState) => {
  const ps = Object.values(s.products);
  return { list: ps.filter((p) => p.inShoppingList && !p.purchased).length, fav: ps.filter((p) => p.favorite).length };
};

export default function Home() {
  const insets = useSafeAreaInsets();
  const rooms = useDB(selectRooms);
  const counts = useDB(selectCounts);
  const { toast } = useFeedback();
  const [loadingDemo, setLoadingDemo] = useState(false);

  const demo = async () => {
    setLoadingDemo(true);
    try {
      const { roomId } = await loadDemo();
      designsForRoom(getState(), roomId).forEach((d) => updateThumbnail(d.id).catch(() => undefined));
      updateSettings({ lastRoomId: roomId });
      toast('נוסף חדר לדוגמה. אפשר להסיר אותו בהגדרות.', 'success');
    } catch (e) {
      toast(`טעינת הדוגמה נכשלה: ${(e as Error).message}`, 'error');
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]}>
        <View style={styles.inner}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[type.title, rtl]} accessibilityRole="header">
                מתאים לבית
              </Text>
              <Text style={[type.small, rtl]}>הדמיית מוצרים בבית שלכם – לפני שקונים</Text>
            </View>
            <IconButton icon="cog-outline" label="הגדרות ונתונים" onPress={() => router.push('/settings')} testID="settings" />
          </View>

          <Pressable
            testID="store-mode"
            accessibilityRole="button"
            accessibilityLabel="אני בחנות עכשיו"
            accessibilityHint="בחירת חדר שמור וצילום מוצר להדמיה מהירה"
            onPress={() => router.push('/store')}
            style={({ pressed }) => [styles.storeBtn, pressed && { backgroundColor: colors.primaryPressed }]}
          >
            <View style={styles.storeIcon}>
              <Icon name="store-outline" size={30} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.storeTitle, rtl]}>אני בחנות עכשיו</Text>
              <Text style={[styles.storeSub, rtl]}>בוחרים חדר ← מצלמים מוצר ← רואים הדמיה</Text>
            </View>
            <Icon name="chevron-left" size={28} color={colors.onPrimary} />
          </Pressable>

          <View style={styles.quickRow}>
            <QuickLink icon="cart-outline" label="רשימת קניות" badge={counts.list} onPress={() => router.push({ pathname: '/shopping', params: { tab: 'list' } })} />
            <QuickLink icon="heart-outline" label="מועדפים" badge={counts.fav} onPress={() => router.push({ pathname: '/shopping', params: { tab: 'fav' } })} />
          </View>

          <View style={styles.sectionHead}>
            <Text style={[type.heading, rtl]} accessibilityRole="header">
              החדרים שלי
            </Text>
            <Button label="חדר חדש" icon="plus" variant="secondary" onPress={() => router.push('/room/new')} testID="new-room" />
          </View>

          {rooms.length === 0 ? (
            <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
              <Icon name="home-outline" size={40} color={colors.accent} />
              <Text style={[type.heading, { textAlign: 'center' }]}>עוד אין חדרים שמורים</Text>
              <Text style={[type.small, { textAlign: 'center' }]}>צלמו חדר פעם אחת – ותוכלו לחזור אליו מכל חנות.</Text>
              <Button label="צילום חדר ראשון" icon="camera-outline" onPress={() => router.push('/room/new')} />
              <Button label="או נסו חדר לדוגמה" variant="ghost" onPress={demo} loading={loadingDemo} />
            </Card>
          ) : (
            <View style={styles.grid}>
              {rooms.map(({ room, count, thumb }) => (
                <Pressable
                  key={room.id}
                  testID={`room-${room.name}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${room.name}, ${count} גרסאות`}
                  onPress={() => router.push({ pathname: '/room/[roomId]', params: { roomId: room.id } })}
                  style={({ pressed }) => [styles.roomCard, pressed && { opacity: 0.85 }]}
                >
                  <StoredImage refId={thumb} style={styles.roomImg} />
                  <View style={styles.roomMeta}>
                    <Text style={[type.heading, rtl]} numberOfLines={1}>
                      {room.name}
                    </Text>
                    <Text style={[type.tiny, rtl]}>{count === 1 ? 'גרסה אחת' : `${count} גרסאות`}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function QuickLink({ icon, label, badge, onPress }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; badge: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} פריטים` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.quick, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <Icon name={icon} color={colors.primary} />
      <Text style={{ fontWeight: '700', color: colors.ink, flex: 1, ...rtl }}>{label}</Text>
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg },
  inner: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.lg },
  header: { flexDirection: ROW, alignItems: 'center', gap: space.md },
  storeBtn: { flexDirection: ROW, alignItems: 'center', gap: space.md, backgroundColor: colors.primary, borderRadius: radius.lg, padding: space.lg, minHeight: 92, ...shadow },
  storeIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#F3EFE7', alignItems: 'center', justifyContent: 'center' },
  storeTitle: { color: colors.onPrimary, fontSize: 21, fontWeight: '800' },
  storeSub: { color: '#DCE6DF', fontSize: 14, marginTop: 2 },
  quickRow: { flexDirection: ROW, gap: space.md },
  quick: { flex: 1, flexDirection: ROW, alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: space.md, minHeight: 56 },
  badge: { backgroundColor: colors.accent, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  sectionHead: { flexDirection: ROW, alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: ROW, flexWrap: 'wrap', gap: space.md },
  roomCard: { width: '47.5%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  roomImg: { width: '100%', aspectRatio: 4 / 3 },
  roomMeta: { padding: space.md, gap: 2 },
});

import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { StoredImage } from '@/components/StoredImage';
import { Banner, Button, Icon } from '@/components/ui';
import { designsForRoom, updateSettings, useDB, type DBState } from '@/storage/db';
import { saveDesign } from '@/storage/db';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import { uid } from '@/utils/id';

const selectRooms = (s: DBState) =>
  Object.values(s.rooms)
    .sort((a, b) => (a.id === s.settings.lastRoomId ? -1 : b.id === s.settings.lastRoomId ? 1 : b.updatedAt - a.updatedAt))
    .map((r) => {
      const designs = designsForRoom(s, r.id).sort((a, b) => b.updatedAt - a.updatedAt);
      return { room: r, latest: designs[0], last: r.id === s.settings.lastRoomId };
    });

/** "אני בחנות עכשיו": בחירת חדר שמור ← צילום מוצר ← הדמיה. */
export default function StoreMode() {
  const rooms = useDB(selectRooms);

  const choose = (roomId: string, designId?: string) => {
    let id = designId;
    if (!id) {
      const now = Date.now();
      id = uid();
      saveDesign({ id, roomId, name: 'אפשרות 1', layers: [], ambient: { temperature: 'none', brightness: 0 }, createdAt: now, updatedAt: now });
    }
    updateSettings({ lastRoomId: roomId });
    router.push({ pathname: '/add-product', params: { roomId, designId: id, store: '1' } });
  };

  return (
    <Screen>
      <Text style={[type.title, rtl]} accessibilityRole="header">
        לאיזה חדר המוצר?
      </Text>
      {rooms.length === 0 ? (
        <>
          <Banner kind="info" text="עוד לא שמרתם חדר. צלמו את החדר פעם אחת (או בחרו תמונה שלו מהגלריה) ואז תוכלו לחזור אליו מכל חנות." />
          <Button label="צילום חדר חדש" icon="camera-outline" size="lg" onPress={() => router.replace('/room/new')} />
        </>
      ) : (
        <View style={{ gap: space.md }}>
          {rooms.map(({ room, latest, last }) => (
            <Pressable
              key={room.id}
              testID={`store-room-${room.name}`}
              accessibilityRole="button"
              accessibilityLabel={`${room.name}${last ? ', החדר האחרון' : ''}`}
              onPress={() => choose(room.id, latest?.id)}
              style={({ pressed }) => [styles.card, last && styles.cardLast, pressed && { opacity: 0.85 }]}
            >
              <StoredImage refId={latest?.thumbnail ?? room.photo} style={styles.img} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[type.heading, rtl]}>{room.name}</Text>
                {last && <Text style={[type.tiny, rtl, { color: colors.accent, fontWeight: '700' }]}>החדר האחרון</Text>}
                <Text style={[type.small, rtl]}>הקישו כדי לצלם מוצר</Text>
              </View>
              <Icon name="camera-outline" color={colors.primary} size={28} />
            </Pressable>
          ))}
          <Button label="חדר אחר – צילום חדש" icon="plus" variant="secondary" onPress={() => router.push('/room/new')} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: ROW, alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.line, minHeight: 96 },
  cardLast: { borderColor: colors.accent, borderWidth: 2 },
  img: { width: 96, height: 72, borderRadius: radius.md },
});

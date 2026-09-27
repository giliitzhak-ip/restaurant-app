import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFeedback } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { StoredImage } from '@/components/StoredImage';
import { Banner, Button, Card, Icon, IconButton } from '@/components/ui';
import { duplicateDesign } from '@/editor/flow';
import { categoryById } from '@/model/categories';
import type { Design } from '@/model/types';
import { designTotal } from '@/model/totals';
import { deleteDesign, deleteRoom, designsForRoom, saveDesign, updateProduct, updateSettings, useDB, type DBState } from '@/storage/db';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import { uid } from '@/utils/id';

const fmtDate = (t: number) => new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });


export default function RoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const room = useDB((s) => s.rooms[roomId]);
  const designs = useDB((s: DBState) => designsForRoom(s, roomId));
  const products = useDB((s) => s.products);
  const roomProducts = Object.values(products).filter((p) => p.roomId === roomId);
  const { confirm, ask, toast } = useFeedback();
  const [pickCompare, setPickCompare] = useState<string[] | null>(null);

  if (!room) {
    return (
      <Screen>
        <Banner kind="danger" text="החדר לא נמצא – ייתכן שנמחק." />
        <Button label="למסך הבית" onPress={() => router.replace('/home')} />
      </Screen>
    );
  }

  const newDesign = () => {
    const now = Date.now();
    const id = uid();
    saveDesign({ id, roomId, name: `אפשרות ${designs.length + 1}`, layers: [], ambient: { temperature: 'none', brightness: 0 }, createdAt: now, updatedAt: now });
    router.push({ pathname: '/editor/[designId]', params: { designId: id } });
  };

  const designMenu = async (d: Design) => {
    const c = await ask(d.name, undefined, [
      { label: 'פתיחה בעורך', value: 'open' },
      { label: 'שכפול לגרסה חדשה', value: 'dup', style: 'secondary' },
      { label: d.favorite ? 'הסרה מהמועדפים' : 'סימון כמועדפת', value: 'fav', style: 'secondary' },
      { label: 'מחיקת הגרסה', value: 'del', style: 'danger' },
    ]);
    if (c === 'open') router.push({ pathname: '/editor/[designId]', params: { designId: d.id } });
    if (c === 'dup') {
      const copy = duplicateDesign(d.id);
      if (copy) toast(`נוצרה "${copy.name}"`, 'success');
    }
    if (c === 'fav') saveDesign({ ...d, favorite: !d.favorite });
    if (c === 'del' && (await confirm('למחוק את הגרסה?', `"${d.name}" תימחק. גרסאות אחרות לא ייפגעו.`, 'מחיקה', true))) await deleteDesign(d.id);
  };

  const onCompareTap = (id: string) => {
    if (!pickCompare) return;
    const next = pickCompare.includes(id) ? pickCompare.filter((x) => x !== id) : [...pickCompare, id].slice(-2);
    setPickCompare(next);
    if (next.length === 2) {
      setPickCompare(null);
      router.push({ pathname: '/compare', params: { roomId, a: next[0], b: next[1] } });
    }
  };

  const removeRoom = async () => {
    if (await confirm('למחוק את החדר?', 'החדר, התמונה שלו וכל הגרסאות יימחקו מהטלפון. מוצרים שמורים יישארו ברשימת הקניות.', 'מחיקה', true)) {
      await deleteRoom(roomId);
      router.replace('/home');
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: room.name }} />
      <StoredImage refId={room.photo} style={{ width: '100%', aspectRatio: room.photoW / room.photoH, borderRadius: radius.lg }} label={`תמונת ${room.name}`} />
      <View style={styles.row}>
        <Button
          label="אני בחנות – צילום מוצר"
          icon="store-outline"
          style={{ flex: 1 }}
          onPress={() => {
            updateSettings({ lastRoomId: roomId });
            const latest = [...designs].sort((a, b) => b.updatedAt - a.updatedAt)[0];
            if (latest) router.push({ pathname: '/add-product', params: { roomId, designId: latest.id, store: '1' } });
            else newDesign();
          }}
        />
      </View>
      {!room.scaleRef && <Banner kind="warning" text="לחדר אין קנה מידה – גודל המוצרים בהדמיה יהיה הערכה. אפשר לסמן קנה מידה בעורך (״קנה מידה״)." />}

      <View style={styles.head}>
        <Text style={[type.heading, rtl]} accessibilityRole="header">
          גרסאות ({designs.length})
        </Text>
        <View style={styles.row}>
          {designs.length >= 2 && (
            <Button label={pickCompare ? 'ביטול' : 'השוואה'} icon="view-split-vertical" variant="secondary" onPress={() => setPickCompare(pickCompare ? null : [])} />
          )}
          <Button label="חדשה" icon="plus" variant="secondary" onPress={newDesign} />
        </View>
      </View>
      {pickCompare && <Banner kind="info" text={`בחרו שתי גרסאות להשוואה (${pickCompare.length}/2)`} />}
      <View style={styles.grid}>
        {designs.map((d) => {
          const total = designTotal(d, products);
          const picked = pickCompare?.includes(d.id);
          return (
            <View key={d.id} style={[styles.card, picked && { borderColor: colors.primary, borderWidth: 3 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${d.name}${d.favorite ? ', מועדפת' : ''}${pickCompare ? (picked ? ', נבחרה להשוואה' : ', הקישו לבחירה להשוואה') : ''}`}
                accessibilityState={{ selected: !!picked }}
                onPress={() => (pickCompare ? onCompareTap(d.id) : router.push({ pathname: '/editor/[designId]', params: { designId: d.id } }))}
                onLongPress={() => designMenu(d)}
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}
                testID={`design-${d.name}`}
              >
                <StoredImage refId={d.thumbnail ?? room.photo} style={styles.thumb} />
              </Pressable>
              <View style={{ padding: space.sm, gap: 2 }}>
                <View style={[styles.row, { alignItems: 'center' }]}>
                  {d.favorite && <Icon name="heart" size={16} color={colors.accent} />}
                  <Text style={[type.heading, rtl, { flex: 1, fontSize: 15 }]} numberOfLines={1}>
                    {d.name}
                  </Text>
                  <IconButton icon="dots-vertical" label={`אפשרויות עבור ${d.name}`} onPress={() => designMenu(d)} size={40} />
                </View>
                <Text style={[type.tiny, rtl]}>
                  {d.layers.length} פריטים{total ? ` · ₪${total.toLocaleString('he-IL')}` : ''}
                </Text>
                <Text style={[type.tiny, rtl]}>עודכן {fmtDate(d.updatedAt)}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {roomProducts.length > 0 && (
        <>
          <Text style={[type.heading, rtl]} accessibilityRole="header">
            מוצרים לחדר הזה
          </Text>
          <Card style={{ padding: 0 }}>
            {roomProducts.map((p, i) => (
              <View key={p.id} style={[styles.prodRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`פרטי ${p.name || categoryById(p.category).label}`}
                  onPress={() => router.push({ pathname: '/product/[productId]', params: { productId: p.id } })}
                  style={styles.prodBody}
                >
                  {p.color && !p.photo ? (
                    <View style={[styles.prodImg, { backgroundColor: p.color }]} />
                  ) : (
                    <StoredImage refId={p.cutout ?? p.swatch ?? p.photo} style={styles.prodImg} resizeMode="contain" />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, rtl, { fontWeight: '600' }]} numberOfLines={1}>
                      {p.name || categoryById(p.category).label}
                    </Text>
                    <Text style={[type.tiny, rtl]}>{[p.store, p.price ? `₪${p.price.toLocaleString('he-IL')}` : null].filter(Boolean).join(' · ') || 'ללא פרטים'}</Text>
                  </View>
                </Pressable>
                <IconButton
                  icon={p.inShoppingList ? 'cart' : 'cart-outline'}
                  label={p.inShoppingList ? 'הסרה מרשימת הקניות' : 'הוספה לרשימת הקניות'}
                  active={p.inShoppingList}
                  onPress={() => updateProduct(p.id, { inShoppingList: !p.inShoppingList })}
                />
              </View>
            ))}
          </Card>
        </>
      )}

      <Button label="מחיקת החדר" icon="delete-outline" variant="danger" onPress={removeRoom} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: ROW, gap: space.sm },
  head: { flexDirection: ROW, alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: ROW, flexWrap: 'wrap', gap: space.md },
  card: { width: '47.5%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  thumb: { width: '100%', aspectRatio: 4 / 3 },
  prodRow: { flexDirection: ROW, alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 64 },
  prodBody: { flex: 1, flexDirection: ROW, alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  prodImg: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
});

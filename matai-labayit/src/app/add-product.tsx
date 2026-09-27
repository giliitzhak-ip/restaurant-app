import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { PRODUCT_TIPS, Tips } from '@/components/Tips';
import { Button, Chip, Field, Icon, P, Segmented } from '@/components/ui';
import { usePhotoPicker } from '@/components/usePhotoPicker';
import { openEditorWithProduct } from '@/editor/flow';
import { CATEGORIES, categoriesForPlacement, categoryById, PLACEMENTS } from '@/model/categories';
import type { CategoryId, Placement, Product } from '@/model/types';
import { saveProduct, useDB } from '@/storage/db';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import { uid } from '@/utils/id';

export default function AddProduct() {
  const params = useLocalSearchParams<{ roomId: string; designId: string; placement?: Placement; store?: string; from?: string }>();
  const room = useDB((s) => s.rooms[params.roomId]);
  const storeMode = params.store === '1';
  const [placement, setPlacement] = useState<Placement>(params.placement ?? 'floor');
  const [showAll, setShowAll] = useState(false);
  const cats = useMemo(() => (showAll ? CATEGORIES : categoriesForPlacement(placement)), [placement, showAll]);
  const [categoryId, setCategoryId] = useState<CategoryId>(cats[0]?.id ?? 'furniture');
  const [target, setTarget] = useState<'current' | 'new'>(storeMode ? 'new' : 'current');
  const [details, setDetails] = useState({ name: '', store: '', price: '' });
  const [showDetails, setShowDetails] = useState(false);
  const { pick, busy } = usePhotoPicker();
  const cat = categoryById(cats.some((c) => c.id === categoryId) ? categoryId : cats[0]?.id ?? 'furniture');

  if (!room) {
    return (
      <Screen>
        <P>החדר לא נמצא.</P>
        <Button label="חזרה למסך הבית" onPress={() => router.replace('/home')} />
      </Screen>
    );
  }

  const choosePlacement = (p: Placement) => {
    setPlacement(p);
    const list = categoriesForPlacement(p);
    if (!list.some((c) => c.id === categoryId)) setCategoryId(list[0].id);
  };

  const baseProduct = (): Product => {
    const now = Date.now();
    const price = parseFloat(details.price.replace(/[^\d.]/g, ''));
    return {
      id: uid(),
      category: cat.id,
      name: details.name.trim() || undefined,
      store: details.store.trim() || undefined,
      price: Number.isFinite(price) ? price : undefined,
      roomId: room.id,
      createdAt: now,
      updatedAt: now,
    };
  };

  const capture = async (src: 'camera' | 'library') => {
    const photo = await pick(src);
    if (!photo) return;
    const p: Product = { ...baseProduct(), photo: photo.ref, photoW: photo.width, photoH: photo.height };
    saveProduct(p);
    const mode = cat.kind === 'paint' ? 'color' : cat.kind === 'pattern' ? 'swatch' : 'object';
    router.push({ pathname: '/cutout/[productId]', params: { productId: p.id, designId: params.designId, placement, mode, target, from: params.from ?? '' } });
  };

  const paintInEditor = () => {
    const p: Product = { ...baseProduct(), color: '#9DB29C', name: details.name.trim() || 'צבע לקיר' };
    saveProduct(p);
    openEditorWithProduct({ designId: params.designId, productId: p.id, placement, target, fromEditor: params.from === 'editor' });
  };

  return (
    <Screen>
      <View style={{ gap: space.sm }}>
        <Text style={[type.heading, rtl]} accessibilityRole="header">
          1. איפה למקם את המוצר?
        </Text>
        <View style={styles.wrapRow}>
          {PLACEMENTS.map((p) => (
            <Chip key={p.id} label={p.label} icon={p.icon as never} selected={placement === p.id} onPress={() => choosePlacement(p.id)} testID={`placement-${p.id}`} />
          ))}
        </View>
        <P muted>{PLACEMENTS.find((p) => p.id === placement)?.hint}</P>
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[type.heading, rtl]} accessibilityRole="header">
          2. איזה מוצר?
        </Text>
        <View style={styles.grid}>
          {cats.map((c) => {
            const on = c.id === cat.id;
            return (
              <Pressable
                key={c.id}
                testID={`cat-${c.id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${c.label}: ${c.examples}`}
                onPress={() => setCategoryId(c.id)}
                style={({ pressed }) => [styles.cat, on && styles.catOn, pressed && { opacity: 0.85 }]}
              >
                <Icon name={c.icon as never} color={on ? colors.onPrimary : colors.primary} size={26} />
                <Text style={[styles.catLabel, on && { color: colors.onPrimary }]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setShowAll(!showAll)} style={{ minHeight: 40, justifyContent: 'center' }}>
          <Text style={[rtl, { color: colors.primary, fontWeight: '700' }]}>{showAll ? 'הצג רק קטגוריות למיקום הזה' : 'הצג את כל הקטגוריות'}</Text>
        </Pressable>
        <P muted>{cat.examples}</P>
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[type.heading, rtl]} accessibilityRole="header">
          3. להוסיף ל…
        </Text>
        <Segmented
          options={[
            { id: 'current', label: 'הגרסה הנוכחית' },
            { id: 'new', label: 'גרסה חדשה להשוואה' },
          ]}
          value={target}
          onChange={setTarget}
        />
      </View>

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(!showDetails)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={[type.body, rtl, { color: colors.primary, fontWeight: '700' }]}>{showDetails ? '− ' : '+ '}שם, חנות ומחיר (לא חובה – אפשר גם אחר כך)</Text>
      </Pressable>
      {showDetails && (
        <View style={{ gap: space.md }}>
          <Field label="שם המוצר" value={details.name} onChangeText={(name) => setDetails({ ...details, name })} placeholder="למשל: ספה תלת-מושבית" />
          <View style={{ flexDirection: ROW, gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field label="חנות" value={details.store} onChangeText={(s) => setDetails({ ...details, store: s })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="מחיר (₪)" keyboardType="numeric" value={details.price} onChangeText={(price) => setDetails({ ...details, price })} />
            </View>
          </View>
        </View>
      )}

      {cat.kind === 'paint' ? (
        <View style={{ gap: space.sm }}>
          <Button label="בחירת צבע בעורך" icon="palette-outline" size="lg" onPress={paintInEditor} testID="paint-editor" />
          <Button label="צילום דוגמת צבע / פחית" icon="camera-outline" variant="secondary" onPress={() => capture('camera')} loading={busy} />
          <Button label="דוגמת צבע מהגלריה" icon="image-outline" variant="ghost" onPress={() => capture('library')} />
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <Tips title="טיפים לצילום מוצר בחנות" tips={PRODUCT_TIPS} initiallyOpen={!storeMode} />
          <Button label={cat.kind === 'pattern' ? 'צילום הדוגמה' : 'צילום המוצר'} icon="camera-outline" size="lg" onPress={() => capture('camera')} loading={busy} testID="product-camera" />
          <Button label="העלאה מהגלריה" icon="image-outline" variant="secondary" size="lg" onPress={() => capture('library')} testID="product-library" />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrapRow: { flexDirection: ROW, flexWrap: 'wrap', gap: space.sm },
  grid: { flexDirection: ROW, flexWrap: 'wrap', gap: space.sm },
  cat: {
    width: '31%',
    flexGrow: 1,
    minHeight: 84,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: space.sm,
  },
  catOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  catLabel: { fontSize: 14, fontWeight: '700', color: colors.ink, textAlign: 'center' },
});

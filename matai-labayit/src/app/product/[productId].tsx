import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useFeedback } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { StoredImage } from '@/components/StoredImage';
import { Banner, Button, Chip, Field, H2, P } from '@/components/ui';
import { CATEGORIES, categoryById } from '@/model/categories';
import type { Product } from '@/model/types';
import { deleteProduct, updateProduct, useDB } from '@/storage/db';
import { colors, radius, ROW, rtl, space, type, LTR } from '@/theme';

const n = (s: string) => {
  const v = parseFloat(s.replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(v) && v > 0 ? v : undefined;
};
const str = (v?: number) => (v == null ? '' : String(v));

/** פרטי מוצר – כל השדות אופציונליים, נשמרים אוטומטית בזמן ההקלדה. */
export default function ProductScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const p = useDB((s) => s.products[productId]);
  const rooms = useDB((s) => s.rooms);
  const { confirm } = useFeedback();
  const [form, setForm] = useState(() => ({
    name: p?.name ?? '',
    store: p?.store ?? '',
    price: str(p?.price),
    url: p?.url ?? '',
    notes: p?.notes ?? '',
    w: str(p?.dims?.widthCm),
    h: str(p?.dims?.heightCm),
    d: str(p?.dims?.depthCm),
  }));

  if (!p) {
    return (
      <Screen>
        <Banner kind="danger" text="המוצר לא נמצא – ייתכן שנמחק." />
      </Screen>
    );
  }
  const cat = categoryById(p.category);

  const change = (k: keyof typeof form, v: string) => {
    const next = { ...form, [k]: v };
    setForm(next);
    const patch: Partial<Product> = {
      name: next.name.trim() || undefined,
      store: next.store.trim() || undefined,
      price: n(next.price),
      url: next.url.trim() || undefined,
      notes: next.notes.trim() || undefined,
      dims: { widthCm: n(next.w), heightCm: n(next.h), depthCm: n(next.d) },
    };
    updateProduct(p.id, patch);
  };

  const openUrl = () => {
    const u = form.url.trim();
    if (!u) return;
    Linking.openURL(/^https?:\/\//.test(u) ? u : `https://${u}`).catch(() => undefined);
  };

  const remove = async () => {
    if (await confirm('למחוק את המוצר?', 'המוצר יוסר גם מכל ההדמיות שבהן הוא מופיע.', 'מחיקה', true)) {
      await deleteProduct(p.id);
      router.back();
    }
  };

  const missingDims = cat.kind !== 'paint' && !p.dims?.widthCm;

  return (
    <Screen>
      <View style={styles.hero}>
        {p.color && cat.kind === 'paint' ? (
          <View style={[styles.img, { backgroundColor: p.color }]} accessibilityLabel={`צבע ${p.color}`} />
        ) : (
          <StoredImage refId={p.cutout ?? p.swatch ?? p.photo} style={styles.img} resizeMode="contain" label={p.name || cat.label} />
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[type.title, rtl]}>{p.name || cat.label}</Text>
          <Text style={[type.small, rtl]}>{cat.label}{p.roomId && rooms[p.roomId] ? ` · ${rooms[p.roomId].name}` : ''}</Text>
          {p.color && <Text style={[type.small, rtl]}>קוד צבע: {p.color}</Text>}
        </View>
      </View>

      <View style={styles.row}>
        <Button label={p.favorite ? 'במועדפים' : 'למועדפים'} icon={p.favorite ? 'heart' : 'heart-outline'} variant={p.favorite ? 'accent' : 'secondary'} onPress={() => updateProduct(p.id, { favorite: !p.favorite })} style={{ flex: 1 }} />
        <Button
          label={p.inShoppingList ? 'ברשימת הקניות' : 'לרשימת הקניות'}
          icon="cart-outline"
          variant={p.inShoppingList ? 'primary' : 'secondary'}
          onPress={() => updateProduct(p.id, { inShoppingList: !p.inShoppingList })}
          style={{ flex: 1 }}
          testID="toggle-list"
        />
      </View>

      <P muted>כל השדות לא חובה – ממלאים רק מה שיודעים. השינויים נשמרים אוטומטית.</P>
      <Field label="שם המוצר" value={form.name} onChangeText={(v) => change('name', v)} testID="product-name" />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="חנות" value={form.store} onChangeText={(v) => change('store', v)} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="מחיר (₪)" keyboardType="numeric" value={form.price} onChangeText={(v) => change('price', v)} testID="product-price" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="קישור למוצר" value={form.url} onChangeText={(v) => change('url', v)} autoCapitalize="none" keyboardType="url" style={{ ...LTR, textAlign: 'left' } as never} />
        </View>
        {!!form.url.trim() && <Button label="פתיחה" variant="secondary" onPress={openUrl} style={{ alignSelf: 'flex-end' }} />}
      </View>

      <H2>מידות (ס״מ)</H2>
      {missingDims && <Banner kind="warning" text="בלי מידות, הגודל בהדמיה הוא הערכה בלבד. עם רוחב המוצר + קנה מידה לחדר – הגודל יחושב אוטומטית." />}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label={cat.kind === 'pattern' ? 'רוחב אריח/לוח' : 'רוחב'} keyboardType="numeric" value={form.w} onChangeText={(v) => change('w', v)} testID="product-width" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={cat.kind === 'pattern' ? 'אורך' : 'גובה'} keyboardType="numeric" value={form.h} onChangeText={(v) => change('h', v)} />
        </View>
        {cat.kind === 'object' && (
          <View style={{ flex: 1 }}>
            <Field label="עומק" keyboardType="numeric" value={form.d} onChangeText={(v) => change('d', v)} />
          </View>
        )}
      </View>
      <Field label="הערות" multiline value={form.notes} onChangeText={(v) => change('notes', v)} placeholder="למשל: זמן אספקה, צבעים נוספים, מבצע" />

      <H2>קטגוריה</H2>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        {CATEGORIES.filter((c) => (c.kind === 'paint') === (cat.kind === 'paint')).map((c) => (
          <Chip key={c.id} label={c.label} selected={c.id === p.category} onPress={() => updateProduct(p.id, { category: c.id })} />
        ))}
      </View>

      {p.photo && (
        <View style={{ gap: space.sm }}>
          <H2>תמונה מקורית</H2>
          <StoredImage refId={p.photo} style={{ width: '100%', aspectRatio: (p.photoW ?? 4) / (p.photoH ?? 3), borderRadius: radius.md }} label="התמונה שצולמה בחנות" />
          {cat.kind === 'object' && (
            <Button label="תיקון החיתוך" icon="crop" variant="secondary" onPress={() => router.push({ pathname: '/cutout/[productId]', params: { productId: p.id, mode: 'object', edit: '1' } })} />
          )}
          {cat.kind === 'pattern' && (
            <Button label="בחירת אזור דוגמה מחדש" icon="crop" variant="secondary" onPress={() => router.push({ pathname: '/cutout/[productId]', params: { productId: p.id, mode: 'swatch', edit: '1' } })} />
          )}
        </View>
      )}
      <Button label="מחיקת המוצר" icon="delete-outline" variant="danger" onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: ROW, gap: space.lg, alignItems: 'center' },
  img: { width: 110, height: 110, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  row: { flexDirection: ROW, gap: space.sm },
});

import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PhotoReview } from '@/components/PhotoReview';
import { Screen } from '@/components/Screen';
import { StoredImage } from '@/components/StoredImage';
import { PRODUCT_TIPS, Tips } from '@/components/Tips';
import { Banner, Button, Chip, Field, Icon, IconButton, P, Segmented } from '@/components/ui';
import { useDraft } from '@/components/useDraft';
import { usePhotoPicker } from '@/components/usePhotoPicker';
import type { QualityIssue } from '@/imaging/quality';
import type { ImportedPhoto } from '@/services/media';
import { deleteImage } from '@/storage/imageStore';
import { openEditorWithProduct } from '@/editor/flow';
import { CATEGORIES, categoriesForPlacement, categoryById, PLACEMENTS } from '@/model/categories';
import type { CategoryId, Placement, Product } from '@/model/types';
import { saveProduct, useDB } from '@/storage/db';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import { uid } from '@/utils/id';

export default function AddProduct() {
  const params = useLocalSearchParams<{ roomId: string; designId: string; placement?: Placement; store?: string; from?: string; pendingRef?: string; pendingW?: string; pendingH?: string }>();
  const room = useDB((s) => s.rooms[params.roomId]);
  const storeMode = params.store === '1';
  // טיוטה שנשמרת אוטומטית: שיחה נכנסת או סגירת האפליקציה לא מוחקות צילומים
  const [draft, setDraft, draftInfo] = useDraft(`product:${params.designId}`, {
    placement: (params.placement ?? 'floor') as Placement,
    categoryId: 'furniture' as CategoryId,
    target: (storeMode ? 'new' : 'current') as 'current' | 'new',
    details: { name: '', store: '', price: '' },
    angles: [] as { ref: string; w: number; h: number; issues?: string[] }[],
    active: 0,
  });
  const { placement, target, details, angles, active } = draft;
  const [showAll, setShowAll] = useState(false);
  const cats = useMemo(() => (showAll ? CATEGORIES : categoriesForPlacement(placement)), [placement, showAll]);
  const categoryId = draft.categoryId;
  const setCategoryId = (c: CategoryId) => setDraft((d) => ({ ...d, categoryId: c }));
  const setPlacement = (p: Placement) => setDraft((d) => ({ ...d, placement: p }));
  const setTarget = (t: 'current' | 'new') => setDraft((d) => ({ ...d, target: t }));
  const setDetails = (v: typeof details) => setDraft((d) => ({ ...d, details: v }));
  const [showDetails, setShowDetails] = useState(false);
  const [review, setReview] = useState<ImportedPhoto | null>(null);
  const [lastIssues, setLastIssues] = useState<QualityIssue[]>([]);
  const { pick, busy } = usePhotoPicker();

  // חזרה אחרי שהמערכת סגרה את האפליקציה בזמן הצילום (אנדרואיד)
  React.useEffect(() => {
    if (params.pendingRef) setReview({ ref: params.pendingRef, width: Number(params.pendingW), height: Number(params.pendingH) });
  }, [params.pendingRef]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const photo = await pick(src, 2048, { purpose: 'product', params: { roomId: params.roomId, designId: params.designId, from: params.from ?? '', store: params.store ?? '' } });
    if (photo) setReview(photo);
  };

  /** אחרי אישור בתצוגה המקדימה – מוסיפים לרשימת הזוויות. */
  const confirmReview = (photo: ImportedPhoto, issues: QualityIssue[]) => {
    setDraft((d) => ({ ...d, angles: [...d.angles, { ref: photo.ref, w: photo.width, h: photo.height, issues: issues.map((i) => i.code) }], active: d.angles.length }));
    setLastIssues(issues.filter((i) => i.severity === 'warn'));
    setReview(null);
  };

  const removeAngle = (i: number) => {
    const a = angles[i];
    deleteImage(a.ref);
    setDraft((d) => ({ ...d, angles: d.angles.filter((_, k) => k !== i), active: Math.max(0, Math.min(d.active, d.angles.length - 2)) }));
  };

  /** יצירת המוצר מהזוויות שצולמו והמשך לחיתוך. */
  const proceed = async () => {
    const a = angles[active];
    if (!a) return;
    const p: Product = { ...baseProduct(), photo: a.ref, photoW: a.w, photoH: a.h, angles, activeAngle: active };
    saveProduct(p);
    await draftInfo.clear();
    const mode = cat.kind === 'paint' ? 'color' : cat.kind === 'pattern' ? 'swatch' : 'object';
    router.push({ pathname: '/cutout/[productId]', params: { productId: p.id, designId: params.designId, placement, mode, target, from: params.from ?? '' } });
  };

  const paintInEditor = () => {
    const p: Product = { ...baseProduct(), color: '#9DB29C', name: details.name.trim() || 'צבע לקיר' };
    saveProduct(p);
    draftInfo.clear();
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

      {draftInfo.restored && angles.length > 0 && <Banner kind="info" text="שחזרנו את הצילומים מהפעם הקודמת – אפשר להמשיך מאיפה שהפסקתם." />}

      {angles.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Text style={[type.heading, rtl]} accessibilityRole="header">
            {angles.length > 1 ? `הזוויות שצולמו (${angles.length}) – בחרו את המתאימה לחדר` : 'התמונה שצולמה'}
          </Text>
          <View style={styles.wrapRow}>
            {angles.map((a, i) => (
              <View key={a.ref} style={[styles.angle, i === active && styles.angleOn]}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: i === active }}
                  accessibilityLabel={`זווית ${i + 1}${a.issues?.length ? ', יש הערות איכות' : ''}`}
                  onPress={() => setDraft((d) => ({ ...d, active: i }))}
                  testID={`angle-${i}`}
                >
                  <StoredImage refId={a.ref} style={styles.angleImg} />
                </Pressable>
                <View style={[styles.wrapRow, { alignItems: 'center', justifyContent: 'space-between' }]}>
                  <Text style={[type.tiny, { fontWeight: '700', color: i === active ? colors.primary : colors.inkSoft }]}>{i === active ? '✓ נבחרה' : `זווית ${i + 1}`}</Text>
                  <IconButton icon="delete-outline" label={`מחיקת זווית ${i + 1}`} onPress={() => removeAngle(i)} size={36} />
                </View>
              </View>
            ))}
          </View>
          {lastIssues.length > 0 && <Banner kind="warning" text={`${lastIssues[0].message}. ${lastIssues[0].tip}`} />}
          {cat.kind === 'object' && <P muted>כדאי לצלם עוד זווית או שתיים (מלפנים ובאלכסון) – ואז לבחור את זו שדומה לזווית שבה רואים את המקום בחדר.</P>}
          <View style={{ flexDirection: ROW, gap: space.sm }}>
            <Button label="צילום זווית נוספת" icon="camera-plus-outline" variant="secondary" onPress={() => capture('camera')} style={{ flex: 1 }} testID="add-angle-camera" />
            <Button label="זווית מהגלריה" icon="image-plus" variant="secondary" onPress={() => capture('library')} style={{ flex: 1 }} testID="add-angle-library" />
          </View>
          <Button label={cat.kind === 'object' ? 'המשך – חיתוך המוצר' : cat.kind === 'pattern' ? 'המשך – בחירת הדוגמה' : 'המשך – דגימת הצבע'} icon="check" size="lg" onPress={proceed} testID="product-continue" />
        </View>
      )}

      {angles.length === 0 &&
        (cat.kind === 'paint' ? (
          <View style={{ gap: space.sm }}>
            <Button label="בחירת צבע בעורך" icon="palette-outline" size="lg" onPress={paintInEditor} testID="paint-editor" />
            <Button label="צילום דוגמת צבע / פחית" icon="camera-outline" variant="secondary" onPress={() => capture('camera')} loading={busy} />
            <Button label="העלאת דוגמת צבע" icon="image-outline" variant="ghost" onPress={() => capture('library')} />
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <Tips title="טיפים לצילום מוצר בחנות" tips={PRODUCT_TIPS} initiallyOpen={!storeMode} />
            <Button label={cat.kind === 'pattern' ? 'צלם דוגמה בחנות' : 'צלם מוצר בחנות'} icon="camera-outline" size="lg" onPress={() => capture('camera')} loading={busy} testID="product-camera" />
            <Button label={cat.kind === 'pattern' ? 'העלה תמונת דוגמה' : 'העלה תמונת מוצר'} icon="image-outline" variant="secondary" size="lg" onPress={() => capture('library')} testID="product-library" />
          </View>
        ))}

      <PhotoReview
        photo={review}
        kind={cat.kind === 'pattern' ? 'swatch' : 'product'}
        title={cat.kind === 'pattern' ? 'בדיקת תמונת הדוגמה' : 'בדיקת תמונת המוצר'}
        onConfirm={confirmReview}
        onChange={setReview}
        onCancel={() => {
          if (review) deleteImage(review.ref);
          setReview(null);
        }}
        onReplace={async (src) => {
          const old = review;
          const p = await pick(src, 2048, { purpose: 'product', params: { roomId: params.roomId, designId: params.designId } });
          if (p) {
            if (old) deleteImage(old.ref);
            setReview(p);
          }
        }}
      />
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
  angle: { width: '31%', gap: 2, padding: 4, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  angleOn: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  angleImg: { width: '100%', aspectRatio: 1, borderRadius: radius.sm },
});

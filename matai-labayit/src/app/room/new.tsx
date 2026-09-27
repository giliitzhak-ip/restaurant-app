import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PhotoReview } from '@/components/PhotoReview';
import { Screen } from '@/components/Screen';
import { useDraft } from '@/components/useDraft';
import type { QualityIssue } from '@/imaging/quality';
import { StoredImage } from '@/components/StoredImage';
import { ROOM_TIPS, Tips } from '@/components/Tips';
import { Banner, Button, Chip, Field, H2, P } from '@/components/ui';
import { usePhotoPicker } from '@/components/usePhotoPicker';
import type { ImportedPhoto } from '@/services/media';
import { saveDesign, saveRoom, updateSettings } from '@/storage/db';
import { deleteImage } from '@/storage/imageStore';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import { uid } from '@/utils/id';

const NAMES = ['סלון', 'חדר שינה', 'מטבח', 'חדר ילדים', 'פינת אוכל', 'מרפסת', 'חדר עבודה', 'אמבטיה'];

const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export default function NewRoom() {
  const params = useLocalSearchParams<{ pendingRef?: string; pendingW?: string; pendingH?: string }>();
  // טיוטה: שם, תמונה ומידות נשמרים אוטומטית עד שהחדר נשמר
  const [draft, setDraft, draftInfo] = useDraft('room', { name: '', photo: null as ImportedPhoto | null, dims: { w: '', l: '', h: '' }, issues: [] as string[] });
  const { name, photo, dims } = draft;
  const setName = (v: string) => setDraft((d) => ({ ...d, name: v }));
  const setDims = (v: typeof dims) => setDraft((d) => ({ ...d, dims: v }));
  const [showDims, setShowDims] = useState(false);
  const [review, setReview] = useState<ImportedPhoto | null>(null);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const { pick, busy } = usePhotoPicker();

  useEffect(() => {
    if (params.pendingRef) setReview({ ref: params.pendingRef, width: Number(params.pendingW), height: Number(params.pendingH) });
  }, [params.pendingRef]);

  const take = async (src: 'camera' | 'library') => {
    const p = await pick(src, 2048, { purpose: 'room', params: {} });
    if (p) setReview(p);
  };

  const confirmReview = (p: ImportedPhoto, found: QualityIssue[]) => {
    if (photo && photo.ref !== p.ref) deleteImage(photo.ref);
    setDraft((d) => ({ ...d, photo: p, issues: found.map((i) => i.code) }));
    setIssues(found.filter((i) => i.severity === 'warn'));
    setReview(null);
  };

  const save = (next: 'product' | 'room') => {
    if (!photo) return;
    draftInfo.clear();
    const now = Date.now();
    const roomId = uid();
    saveRoom({
      id: roomId,
      name: name.trim() || 'החדר שלי',
      photo: photo.ref,
      photoW: photo.width,
      photoH: photo.height,
      dims: { widthCm: num(dims.w), lengthCm: num(dims.l), heightCm: num(dims.h) },
      createdAt: now,
      updatedAt: now,
    });
    const designId = uid();
    saveDesign({ id: designId, roomId, name: 'אפשרות 1', layers: [], ambient: { temperature: 'none', brightness: 0 }, createdAt: now, updatedAt: now });
    updateSettings({ lastRoomId: roomId });
    if (next === 'product') router.replace({ pathname: '/add-product', params: { roomId, designId } });
    else router.replace({ pathname: '/room/[roomId]', params: { roomId } });
  };

  return (
    <Screen
      footer={
        photo ? (
          <View style={{ gap: space.sm }}>
            <Button label="המשך – הוספת מוצר להדמיה" icon="plus" size="lg" onPress={() => save('product')} testID="room-continue" />
            <Button label="שמירת החדר בלבד" variant="ghost" onPress={() => save('room')} />
          </View>
        ) : undefined
      }
    >
      <Field label="שם החדר" placeholder="למשל: סלון" value={name} onChangeText={setName} testID="room-name" returnKeyType="done" />
      <View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: space.sm }}>
        {NAMES.map((n) => (
          <Chip key={n} label={n} selected={name === n} onPress={() => setName(n)} />
        ))}
      </View>

      {photo ? (
        <View style={{ gap: space.sm }}>
          <H2>תמונת החדר</H2>
          {draftInfo.restored && <Banner kind="info" text="שחזרנו את התמונה מהפעם הקודמת." />}
          <StoredImage refId={photo.ref} style={{ width: '100%', aspectRatio: photo.width / photo.height, borderRadius: radius.lg }} resizeMode="cover" label="תמונת החדר שצולמה" />
          {issues[0] && <Banner kind="warning" text={`${issues[0].message}. ${issues[0].tip}`} />}
          <View style={{ flexDirection: ROW, gap: space.sm }}>
            <Button label="צלם חדר מחדש" icon="camera-outline" variant="secondary" onPress={() => take('camera')} style={{ flex: 1 }} loading={busy} />
            <Button label="תמונה אחרת" icon="image-outline" variant="secondary" onPress={() => take('library')} style={{ flex: 1 }} />
          </View>
          <Button label="סיבוב / חיתוך" icon="crop" variant="ghost" onPress={() => setReview(photo)} />
        </View>
      ) : (
        <>
          <Tips title="טיפים לצילום טוב של החדר" tips={ROOM_TIPS} />
          <Button label="צלם חדר" icon="camera-outline" size="lg" onPress={() => take('camera')} loading={busy} testID="room-camera" />
          <Button label="העלה תמונת חדר" icon="image-outline" variant="secondary" size="lg" onPress={() => take('library')} testID="room-library" />
          <P muted>התמונה נשמרת רק בטלפון שלכם.</P>
        </>
      )}

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDims }} onPress={() => setShowDims(!showDims)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={[type.body, rtl, { color: colors.primary, fontWeight: '700' }]}>{showDims ? '− ' : '+ '}מידות החדר (לא חובה)</Text>
      </Pressable>
      {showDims && (
        <View style={{ gap: space.md }}>
          <P muted>מידות עוזרות לנו להציג גודל מציאותי יותר. בלי מידות – הגודל בהדמיה הוא הערכה בלבד.</P>
          <View style={{ flexDirection: ROW, gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field label="רוחב (ס״מ)" keyboardType="numeric" value={dims.w} onChangeText={(w) => setDims({ ...dims, w })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="אורך (ס״מ)" keyboardType="numeric" value={dims.l} onChangeText={(l) => setDims({ ...dims, l })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="גובה (ס״מ)" keyboardType="numeric" value={dims.h} onChangeText={(h) => setDims({ ...dims, h })} />
            </View>
          </View>
          <P muted>טיפ: לדיוק הכי טוב, בעורך אפשר לסמן על התמונה קו של חפץ שמידתו ידועה (״קנה מידה״).</P>
        </View>
      )}
      <PhotoReview
        photo={review}
        kind="room"
        title="בדיקת תמונת החדר"
        onConfirm={confirmReview}
        onChange={(p) => {
          setReview(p);
          // אם עורכים את התמונה שכבר נבחרה – מעדכנים גם אותה
          if (photo && review && photo.ref === review.ref) setDraft((d) => ({ ...d, photo: p }));
        }}
        onCancel={() => {
          if (review && review.ref !== photo?.ref) deleteImage(review.ref);
          setReview(null);
        }}
        onReplace={async (src) => {
          const old = review;
          const p = await pick(src, 2048, { purpose: 'room', params: {} });
          if (p) {
            if (old && old.ref !== photo?.ref) deleteImage(old.ref);
            setReview(p);
          }
        }}
      />
    </Screen>
  );
}

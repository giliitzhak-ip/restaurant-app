import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { StoredImage } from '@/components/StoredImage';
import { ROOM_TIPS, Tips } from '@/components/Tips';
import { Button, Chip, Field, H2, P } from '@/components/ui';
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
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<ImportedPhoto | null>(null);
  const [showDims, setShowDims] = useState(false);
  const [dims, setDims] = useState({ w: '', l: '', h: '' });
  const { pick, busy } = usePhotoPicker();

  const take = async (src: 'camera' | 'library') => {
    const p = await pick(src);
    if (p) {
      if (photo) deleteImage(photo.ref);
      setPhoto(p);
    }
  };

  const save = (next: 'product' | 'room') => {
    if (!photo) return;
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
          <StoredImage refId={photo.ref} style={{ width: '100%', aspectRatio: photo.width / photo.height, borderRadius: radius.lg }} resizeMode="cover" label="תמונת החדר שצולמה" />
          <View style={{ flexDirection: ROW, gap: space.sm }}>
            <Button label="צילום מחדש" icon="camera-outline" variant="secondary" onPress={() => take('camera')} style={{ flex: 1 }} loading={busy} />
            <Button label="תמונה אחרת" icon="image-outline" variant="secondary" onPress={() => take('library')} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <>
          <Tips title="טיפים לצילום טוב של החדר" tips={ROOM_TIPS} />
          <Button label="צילום החדר" icon="camera-outline" size="lg" onPress={() => take('camera')} loading={busy} testID="room-camera" />
          <Button label="בחירה מהגלריה" icon="image-outline" variant="secondary" size="lg" onPress={() => take('library')} testID="room-library" />
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
    </Screen>
  );
}

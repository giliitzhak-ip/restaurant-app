// "מבנה החדר": מישורי קיר/רצפה (להצמדת מוצרים בפרספקטיבה ולגודל אמיתי)
// וחפצים קיימים שיכולים להסתיר מוצרים (שולחן קפה לפני ספה, שידה לפני חיפוי).
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Banner, Button, Chip, IconButton, Segmented, Slider } from '@/components/ui';
import type { Room } from '@/model/types';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import type { EditorMode } from '../EditorCanvas';

type Props = {
  room: Room;
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  selectedPlaneId: string | null;
  setSelectedPlaneId: (id: string | null) => void;
  onAddPlane: (kind: 'floor' | 'wall') => void;
  onDeletePlane: (id: string) => void;
  onPlaneSize: (id: string, widthCm?: number, depthCm?: number) => void;
  onDeleteOccluder: (id: string) => void;
  appendTo: string | null;
  setAppendTo: (id: string | null) => void;
  onFinishBrush: () => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  tol: number;
  setTol: (n: number) => void;
  aiAvailable: boolean;
  useAi: boolean;
  setUseAi: (v: boolean) => void;
  onClose: () => void;
};

export function RoomToolsPanel(p: Props) {
  const [tab, setTab] = useState<'objects' | 'planes'>('objects');
  const plane = p.room.planes?.find((x) => x.id === p.selectedPlaneId);
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.head}>
        <Text style={[type.heading, rtl, { flex: 1 }]}>מבנה החדר</Text>
        <IconButton icon="close" label="סגירה" onPress={p.onClose} />
      </View>
      <Segmented
        options={[
          { id: 'objects', label: 'חפצים קיימים' },
          { id: 'planes', label: 'קירות ורצפה' },
        ]}
        value={tab}
        onChange={(t) => {
          setTab(t);
          p.setMode('select');
        }}
      />
      {p.aiAvailable && (
        <Segmented
          options={[
            { id: 'ai', label: 'זיהוי AI (בשרת)' },
            { id: 'local', label: 'זיהוי מקומי' },
          ]}
          value={p.useAi ? 'ai' : 'local'}
          onChange={(v) => p.setUseAi(v === 'ai')}
        />
      )}

      {tab === 'objects' && (
        <>
          <Text style={[type.tiny, rtl]}>סמנו רהיטים שכבר בחדר. מוצר שתציבו מאחוריהם יוסתר על ידם, ורצפה/קיר חדשים לא יכסו אותם. חשוב לכלול את החלק שנוגע ברצפה (רגליים) – לפיו נקבע מה לפני מה; השתמשו ב"+ חלק".</Text>
          <View style={styles.row}>
            <Button
              label={p.mode === 'occluderTap' ? 'הקישו על החפץ…' : 'בחירה בנגיעה'}
              icon="gesture-tap"
              variant={p.mode === 'occluderTap' ? 'primary' : 'secondary'}
              onPress={() => p.setMode(p.mode === 'occluderTap' ? 'select' : 'occluderTap')}
              style={{ flex: 1 }}
              testID="occluder-tap"
            />
            <Button
              label={p.mode === 'occluderBrush' ? 'סיום סימון' : 'סימון במברשת'}
              icon="brush"
              variant={p.mode === 'occluderBrush' ? 'primary' : 'secondary'}
              onPress={() => (p.mode === 'occluderBrush' ? p.onFinishBrush() : p.setMode('occluderBrush'))}
              style={{ flex: 1 }}
              testID="occluder-brush"
            />
          </View>
          {p.mode === 'occluderTap' && !p.useAi && (
            <Slider label="רגישות הזיהוי" value={p.tol} min={0.1} max={0.9} onChange={p.setTol} format={(v) => (v < 0.3 ? 'מדויק' : v > 0.6 ? 'רחב' : 'בינוני')} />
          )}
          {p.mode === 'occluderBrush' && <Slider label="גודל מברשת" value={p.brushSize} min={6} max={70} step={1} onChange={p.setBrushSize} format={(v) => `${Math.round(v)}`} />}
          {(p.room.occluders ?? []).length === 0 ? (
            <Text style={[type.small, rtl]}>עוד לא סומנו חפצים.</Text>
          ) : (
            <View style={styles.list}>
              {p.room.occluders!.map((o) => (
                <View key={o.id} style={styles.item}>
                  <View style={[styles.dot, { backgroundColor: '#3FA7FF' }]} />
                  <Text style={[type.body, rtl, { flex: 1 }]}>
                    {o.name} <Text style={type.tiny}>({o.source === 'ai' ? 'AI' : o.source === 'wand' ? 'לפי צבע' : 'ידני'})</Text>
                  </Text>
                  <Chip
                    label={p.appendTo === o.id ? 'סיום הוספת חלקים' : '+ חלק'}
                    selected={p.appendTo === o.id}
                    onPress={() => {
                      if (p.appendTo === o.id) {
                        p.setAppendTo(null);
                        p.setMode('select');
                      } else {
                        p.setAppendTo(o.id);
                        p.setMode('occluderTap');
                      }
                    }}
                    testID={`occ-add-part-${o.name}`}
                  />
                  <IconButton icon="delete-outline" label={`מחיקת ${o.name}`} onPress={() => p.onDeleteOccluder(o.id)} />
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {tab === 'planes' && (
        <>
          <Text style={[type.tiny, rtl]}>
            מישור = קיר או רצפה שסימנתם בארבע פינות. מוצרים שמוצמדים אליו מקבלים את הפרספקטיבה שלו, ואם תזינו את רוחבו – גם גודל אמיתי.
          </Text>
          <View style={styles.row}>
            <Button label="רצפה" icon="floor-plan" variant="secondary" onPress={() => p.onAddPlane('floor')} style={{ flex: 1 }} testID="add-floor-plane" />
            <Button label="קיר" icon="wall" variant="secondary" onPress={() => p.onAddPlane('wall')} style={{ flex: 1 }} testID="add-wall-plane" />
          </View>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {(p.room.planes ?? []).map((pl) => (
              <Chip key={pl.id} label={pl.name} selected={pl.id === p.selectedPlaneId} onPress={() => p.setSelectedPlaneId(pl.id === p.selectedPlaneId ? null : pl.id)} />
            ))}
          </View>
          {plane && (
            <View style={styles.box}>
              <Text style={[type.small, rtl]}>גררו את 4 הפינות (בכתום) לפינות האמיתיות של {plane.kind === 'floor' ? 'הרצפה' : 'הקיר'}. אפשר גם לזהות בנגיעה.</Text>
              <Button
                label={p.mode === 'planeTap' ? 'הקישו על המשטח…' : 'זיהוי בנגיעה'}
                icon="magic-staff"
                variant={p.mode === 'planeTap' ? 'primary' : 'secondary'}
                onPress={() => p.setMode(p.mode === 'planeTap' ? 'select' : 'planeTap')}
              />
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[type.tiny, rtl]}>{plane.kind === 'floor' ? 'רוחב הרצפה המסומנת (ס״מ)' : 'רוחב הקיר המסומן (ס״מ)'}</Text>
                  <TextInput
                    accessibilityLabel="רוחב בס״מ"
                    keyboardType="numeric"
                    key={`w-${plane.id}`}
                    defaultValue={plane.widthCm ? String(plane.widthCm) : ''}
                    onChangeText={(t) => p.onPlaneSize(plane.id, parseFloat(t) || undefined, plane.depthCm)}
                    testID="plane-width"
                    style={styles.input}
                    placeholder="לא ידוע"
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[type.tiny, rtl]}>{plane.kind === 'floor' ? 'עומק (ס״מ)' : 'גובה (ס״מ)'}</Text>
                  <TextInput
                    accessibilityLabel={plane.kind === 'floor' ? 'עומק בס״מ' : 'גובה בס״מ'}
                    keyboardType="numeric"
                    key={`d-${plane.id}`}
                    defaultValue={plane.depthCm ? String(plane.depthCm) : ''}
                    onChangeText={(t) => p.onPlaneSize(plane.id, plane.widthCm, parseFloat(t) || undefined)}
                    style={styles.input}
                    placeholder="לא ידוע"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>
              <Button label="מחיקת המישור" icon="delete-outline" variant="danger" onPress={() => p.onDeletePlane(plane.id)} />
            </View>
          )}
          {!p.room.planes?.length && <Banner kind="info" text="טיפ: לטלוויזיה/תמונה – סמנו את הקיר; לשטיח – את הרצפה. אחר כך במוצר ← פרספקטיבה ← הצמדה." />}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: ROW, alignItems: 'center', gap: space.sm },
  row: { flexDirection: ROW, gap: space.sm },
  list: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  item: { flexDirection: ROW, alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, minHeight: 48 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  box: { gap: space.sm, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: space.md },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16, backgroundColor: colors.surface, ...rtl },
});

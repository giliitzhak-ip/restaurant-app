// כלים למשטח (צבע קיר, טפט, חיפוי, אריחים, פרקט): אזור ופינות, זיהוי לפי צבע, מברשת הגנה,
// צבע ושמירת צללים, או דוגמה חוזרת עם קנה מידה, כיוון הנחה ופוגות.
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Chip, Segmented, Slider } from '@/components/ui';
import { pxPerCm } from '@/imaging/geometry';
import type { Product, Room, SurfaceLayer } from '@/model/types';
import { updateProduct } from '@/storage/db';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import type { DesignEditor } from '../useDesignEditor';
import type { EditorMode } from '../EditorCanvas';
import { ColorPicker } from './ColorPicker';

type Tab = 'area' | 'look';

type Props = {
  layer: SurfaceLayer;
  product?: Product;
  room: Room;
  ed: DesignEditor;
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  onResetArea: () => void;
  aiAvailable: boolean;
  useAi: boolean;
  setUseAi: (v: boolean) => void;
  wandTolerance: number;
  setWandTolerance: (v: number) => void;
  onWandToleranceEnd: () => void;
  addRegion: boolean;
  setAddRegion: (v: boolean) => void;
};

const GROUT = ['#F2EEE6', '#D9D4CB', '#9A948A', '#4A4640'];

export function SurfacePanel({ layer, product, room, ed, mode, setMode, brushSize, setBrushSize, onResetArea, aiAvailable, useAi, setUseAi, wandTolerance, setWandTolerance, onWandToleranceEnd, addRegion, setAddRegion }: Props) {
  const [tab, setTab] = useState<Tab>('area');
  const W = room.photoW;
  const cp = ed.checkpoint;
  const set = (patch: Partial<SurfaceLayer>) => ed.updateLayer(layer.id, patch);
  const setPat = (patch: Partial<SurfaceLayer['pattern']>) => ed.updateLayer(layer.id, { pattern: { ...layer.pattern, ...patch } });
  const ppc = pxPerCm(room.scaleRef);
  const isPattern = layer.mode === 'pattern';

  return (
    <View style={{ gap: space.md }}>
      <Segmented
        options={[
          { id: 'area', label: 'אזור' },
          { id: 'look', label: isPattern ? 'דוגמה' : 'צבע' },
        ]}
        value={tab}
        onChange={(t) => {
          setTab(t);
          setMode('select');
        }}
      />
      {tab === 'area' && (
        <>
          <Text style={[type.tiny, rtl]}>
            {layer.regionMask
              ? 'מכוסה רק מה שגם זוהה וגם בתוך ארבע הפינות. גררו את הפינות לפינות הקיר/הרצפה – הן קובעות גם את הפרספקטיבה (ברצפה הן יכולות להיות מחוץ לתמונה).'
              : 'גררו את ארבע הפינות כך שיתאימו לקיר או לרצפה – כך גם הפרספקטיבה של הדוגמה תתאים. אפשר גם לגרור את כל האזור.'}
          </Text>
          {aiAvailable && (
            <Segmented
              options={[
                { id: 'ai', label: 'זיהוי AI (בשרת)' },
                { id: 'local', label: 'זיהוי לפי צבע' },
              ]}
              value={useAi ? 'ai' : 'local'}
              onChange={(v) => setUseAi(v === 'ai')}
            />
          )}
          <Button
            label={mode === 'wand' && !addRegion ? 'הקישו על המשטח…' : aiAvailable && useAi ? 'זיהוי המשטח בנגיעה' : 'זיהוי לפי צבע'}
            icon="magic-staff"
            variant={mode === 'wand' && !addRegion ? 'primary' : 'secondary'}
            onPress={() => {
              setAddRegion(false);
              setMode(mode === 'wand' && !addRegion ? 'select' : 'wand');
            }}
            testID="wand"
          />
          {!!layer.regionMask && (
            <Button
              label={addRegion ? 'סיום הוספת אזורים' : 'הוספת אזור בנגיעה (כתם אור, פינה שחסרה)'}
              icon="plus"
              variant={addRegion ? 'primary' : 'secondary'}
              onPress={() => {
                setAddRegion(!addRegion);
                setMode(addRegion ? 'select' : 'wand');
              }}
              testID="add-region"
            />
          )}
          {!!room.planes?.length && (
            <View style={[styles.row, { alignItems: 'center' }]}>
              <Text style={[type.tiny, rtl]}>התאמה למישור:</Text>
              {room.planes!.map((pl) => (
                <Chip key={pl.id} label={pl.name} selected={layer.planeId === pl.id} onPress={() => ed.updateLayer(layer.id, { quad: pl.quad.map((q) => ({ ...q })) as SurfaceLayer['quad'], planeId: pl.id }, true)} />
              ))}
            </View>
          )}
          <View style={styles.box}>
            <Text style={[type.small, rtl, { fontWeight: '700' }]}>חלונות ודלתות</Text>
            <Text style={[type.tiny, rtl]}>הוסיפו פתח וגררו את 4 הפינות (בכחול) על החלון או הדלת – הם לא ייצבעו ולא יחופו.</Text>
            <View style={styles.row}>
              <Button
                label="הוספת חלון/דלת"
                icon="shape-square-plus"
                variant="secondary"
                onPress={() => {
                  const c = layer.quad.reduce((a, q) => ({ x: a.x + q.x / 4, y: a.y + q.y / 4 }), { x: 0, y: 0 });
                  const d = W * 0.08;
                  const q: SurfaceLayer['quad'] = [{ x: c.x - d, y: c.y - d * 1.3 }, { x: c.x + d, y: c.y - d * 1.3 }, { x: c.x + d, y: c.y + d * 1.3 }, { x: c.x - d, y: c.y + d * 1.3 }];
                  ed.updateLayer(layer.id, { openings: [...(layer.openings ?? []), q] }, true);
                }}
                style={{ flex: 1 }}
                testID="add-opening"
              />
              {!!layer.openings?.length && (
                <Button label="מחיקת פתח אחרון" variant="ghost" onPress={() => ed.updateLayer(layer.id, { openings: layer.openings!.slice(0, -1) }, true)} style={{ flex: 1 }} />
              )}
            </View>
          </View>
          {(mode === 'wand' || layer.regionMask) && (
            <Slider
              label="רגישות הזיהוי"
              value={wandTolerance}
              min={0.1}
              max={0.9}
              onChange={setWandTolerance}
              onEnd={onWandToleranceEnd}
              format={(v) => (v < 0.3 ? 'מדויק' : v > 0.6 ? 'רחב' : 'בינוני')}
            />
          )}
          {layer.regionMask && <Banner kind="success" text="האזור זוהה לפי צבע: חפצים על המשטח (תמונות, רהיטים) נשארים מוגנים. אם נצבע משהו מיותר – הקטינו רגישות או השתמשו במברשת הגנה." />}
          <View style={styles.row}>
            <Button
              label={mode === 'brush' ? 'סיום מברשת' : 'מברשת הגנה'}
              icon="brush"
              variant={mode === 'brush' ? 'primary' : 'secondary'}
              onPress={() => setMode(mode === 'brush' ? 'select' : 'brush')}
              style={{ flex: 1 }}
            />
            <Button label="איפוס אזור" icon="vector-square" variant="secondary" onPress={onResetArea} style={{ flex: 1 }} />
          </View>
          {mode === 'brush' && (
            <>
              <Text style={[type.tiny, rtl]}>העבירו אצבע על מה שלא צריך להיצבע (חלון, רהיט, מסגרת).</Text>
              <Slider label="גודל מברשת" value={brushSize} min={6} max={70} step={1} onChange={setBrushSize} format={(v) => `${Math.round(v)}`} />
            </>
          )}
          {layer.eraseStrokes.length > 0 && <Button label="ניקוי סימוני מברשת" variant="ghost" onPress={() => ed.updateLayer(layer.id, { eraseStrokes: [] }, true)} />}
          {layer.regionMask && <Button label="ביטול זיהוי הצבע (כל המרובע)" variant="ghost" onPress={() => ed.updateLayer(layer.id, { regionMask: undefined }, true)} />}
          <Button label="הסרת המשטח" icon="delete-outline" variant="danger" onPress={() => ed.removeLayer(layer.id)} />
        </>
      )}
      {tab === 'look' && !isPattern && (
        <>
          <ColorPicker
            value={layer.color}
            onStart={cp}
            onChange={(hex, commit) => {
              set({ color: hex });
              if (commit && product) updateProduct(product.id, { color: hex });
            }}
            onEyedropper={() => setMode(mode === 'eyedropper' ? 'select' : 'eyedropper')}
            eyedropperActive={mode === 'eyedropper'}
          />
          <Text style={[type.small, rtl, { fontWeight: '700' }]}>אופן הצביעה</Text>
          <Segmented
            options={[
              { id: 'natural', label: 'טבעי' },
              { id: 'multiply', label: 'הכפלה' },
              { id: 'cover', label: 'כיסוי' },
            ]}
            value={layer.blend}
            onChange={(b) => ed.updateLayer(layer.id, { blend: b }, true)}
          />
          <Text style={[type.tiny, rtl]}>
            {layer.blend === 'natural' ? 'טבעי: שומר על הצללים, האור והמרקם של הקיר.' : layer.blend === 'multiply' ? 'הכפלה: מתאים לקירות בהירים, מכהה בלבד.' : 'כיסוי: צבע אחיד ואטום, בלי צללים.'}
          </Text>
          <Slider label="עוצמת הצבע" value={layer.opacity} min={0.2} max={1} onStart={cp} onChange={(v) => set({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </>
      )}
      {tab === 'look' && isPattern && (
        <>
          {!product?.swatch && <Banner kind="warning" text="חסרה דוגמה למוצר. פתחו את פרטי המוצר ובחרו אזור דוגמה." />}
          <Slider
            label="גודל אריח / לוח"
            value={layer.pattern.tileSize}
            min={W * 0.01}
            max={W * 0.6}
            onStart={cp}
            onChange={(v) => setPat({ tileSize: v })}
            format={(v) => (ppc ? `~${Math.round(v / ppc)} ס״מ` : `${Math.round(v)}`)}
          />
          {ppc && product?.dims?.widthCm ? (
            <Button label={`גודל אמיתי (${product.dims.widthCm} ס״מ)`} icon="tape-measure" variant="secondary" onPress={() => { cp(); setPat({ tileSize: product.dims!.widthCm! * ppc }); }} />
          ) : (
            <Text style={[type.tiny, rtl]}>לקנה מידה אמיתי: סמנו קנה מידה לחדר והזינו את רוחב האריח בפרטי המוצר.</Text>
          )}
          <Text style={[type.small, rtl, { fontWeight: '700' }]}>כיוון הנחה</Text>
          <View style={styles.row}>
            {[0, 45, 90, -45].map((r) => (
              <Chip key={r} label={r === 0 ? 'ישר' : r === 90 ? 'לאורך' : r === 45 ? 'אלכסון' : 'אלכסון הפוך'} selected={Math.round(layer.pattern.rotation) === r} onPress={() => { cp(); setPat({ rotation: r }); }} />
            ))}
          </View>
          <Slider label="סיבוב עדין" value={layer.pattern.rotation} min={-90} max={90} step={1} onStart={cp} onChange={(v) => setPat({ rotation: v })} format={(v) => `${Math.round(v)}°`} />
          <Text style={[type.small, rtl, { fontWeight: '700' }]}>חזרת הדוגמה</Text>
          <Segmented
            options={[
              { id: 'straight', label: 'ישרה (רשת)' },
              { id: 'brick', label: 'בהזחה (לבנים)' },
            ]}
            value={layer.pattern.layout}
            onChange={(v) => { cp(); setPat({ layout: v }); }}
          />
          <Slider label="פוגות (רובה)" value={layer.pattern.groutWidth} min={0} max={0.08} onStart={cp} onChange={(v) => setPat({ groutWidth: v })} format={(v) => (v < 0.002 ? 'ללא' : `${Math.round(v * 1000) / 10}%`)} />
          {layer.pattern.groutWidth > 0.002 && (
            <View style={styles.row}>
              {GROUT.map((g) => (
                <Chip key={g} label={g === '#F2EEE6' ? 'לבן' : g === '#D9D4CB' ? 'בהיר' : g === '#9A948A' ? 'אפור' : 'כהה'} selected={layer.pattern.groutColor === g} onPress={() => { cp(); setPat({ groutColor: g }); }} />
              ))}
            </View>
          )}
          <Slider
            label="שונות טבעית בין לוחות/אריחים"
            value={layer.pattern.variation ?? 0}
            min={0}
            max={1}
            onStart={cp}
            onChange={(v) => setPat({ variation: v })}
            format={(v) => (v < 0.02 ? 'ללא (חזרה מדויקת)' : `${Math.round(v * 100)}%`)}
          />
          {layer.match && (
            <Slider
              label="נאמנות לצבע שצולם ↔ התאמה לתאורת החדר"
              value={layer.harmonize ?? 0.5}
              min={0}
              max={1}
              onStart={cp}
              onChange={(v) => set({ harmonize: v })}
              format={(v) => (v < 0.05 ? 'כמו בחנות' : `${Math.round(v * 100)}%`)}
            />
          )}
          <Slider label="שמירת צללי החדר" value={layer.pattern.shading} min={0} max={1} onStart={cp} onChange={(v) => setPat({ shading: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="אטימות" value={layer.opacity} min={0.2} max={1} onStart={cp} onChange={(v) => set({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: ROW, gap: space.sm, flexWrap: 'wrap' },
  box: { gap: space.sm, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: space.md },
});

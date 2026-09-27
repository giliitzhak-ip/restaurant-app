// כלים למוצר (רהיט, מכשיר, מנורה, שטיח, וילון, תמונה/מראה/טלוויזיה):
// מיקום, פרספקטיבה (חופשית/הצמדה למישור), השתלבות (נאמנות ↔ השתלבות + תוצאות לבחירה),
// צל ואור, הסתרה מאחורי חפצים קיימים, ופרטי מוצר/זוויות.
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Chip, IconButton, Segmented, Slider } from '@/components/ui';
import { TEMPERATURE_LABELS } from '@/imaging/color';
import { imageToPlane, pxPerCm, quadRectSize } from '@/imaging/geometry';
import { categoryById } from '@/model/categories';
import type { ObjectLayer, Plane, Product, Room, Temperature } from '@/model/types';
import { updateProduct } from '@/storage/db';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import type { EditorMode } from '../EditorCanvas';
import { objectCorners } from '../objectGeometry';
import { VARIANTS, type Variant } from '../realism';
import type { DesignEditor } from '../useDesignEditor';

type Tab = 'place' | 'persp' | 'blend' | 'shadow' | 'hide' | 'product';

type Props = {
  layer: ObjectLayer;
  product?: Product;
  room: Room;
  ed: DesignEditor;
  designId: string;
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  onRematch: () => void;
  onOpenRoomTools: () => void;
  renderVariant: (v: Variant) => React.ReactNode;
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'place', label: 'מיקום' },
  { id: 'persp', label: 'פרספקטיבה' },
  { id: 'blend', label: 'השתלבות' },
  { id: 'shadow', label: 'צל ואור' },
  { id: 'hide', label: 'הסתרה' },
  { id: 'product', label: 'מוצר' },
];

export function ObjectPanel({ layer, product, room, ed, designId, mode, setMode, brushSize, setBrushSize, onRematch, onOpenRoomTools, renderVariant }: Props) {
  const [tab, setTab] = useState<Tab>('place');
  const W = room.photoW;
  const set = (patch: Partial<ObjectLayer>) => ed.updateLayer(layer.id, patch);
  const setShadow = (patch: Partial<ObjectLayer['shadow']>) => ed.updateLayer(layer.id, { shadow: { ...layer.shadow, ...patch } });
  const cat = product ? categoryById(product.category) : undefined;
  const light = layer.light ?? { enabled: false, temperature: 'warm' as Temperature, intensity: 0.5, radius: layer.width * 1.6, offsetY: 0.25 };
  const setLight = (patch: Partial<NonNullable<ObjectLayer['light']>>) => ed.updateLayer(layer.id, { light: { ...light, ...patch } });
  const ppc = pxPerCm(room.scaleRef);
  const cp = ed.checkpoint;
  const aspect = product?.cutoutW && product.cutoutH ? product.cutoutH / product.cutoutW : 1;
  const plane = room.planes?.find((p) => p.id === layer.planeId);
  const planes = (room.planes ?? []).filter((p) => (layer.placement === 'floor' && cat?.liesFlat ? p.kind === 'floor' : p.kind === 'wall') || layer.placement === 'free');
  const standing = (layer.placement === 'floor' || layer.placement === 'table') && !cat?.liesFlat;
  const h = layer.harmonize ?? 0.35;

  /** הצמדה למישור: ממירים את המיקום הנוכחי למרחב המישור. */
  const attach = (pl: Plane) => {
    const q = objectCorners(layer, aspect, room.planes);
    const a = imageToPlane(pl.quad, q[3]);
    const b = imageToPlane(pl.quad, q[2]);
    const c = imageToPlane(pl.quad, { x: (q[0].x + q[2].x) / 2, y: (q[0].y + q[2].y) / 2 });
    const w = Math.max(0.02, Math.abs(b.x - a.x));
    const { W: pw, H: phh } = quadRectSize(pl.quad);
    const ratio = pl.widthCm && pl.depthCm ? pl.widthCm / pl.depthCm : pw / phh;
    const hh = w * aspect * ratio;
    let rect = { u: c.x - w / 2, v: c.y - hh / 2, w, h: hh };
    if (pl.widthCm && product?.dims?.widthCm) {
      const rw = product.dims.widthCm / pl.widthCm;
      const rh = pl.depthCm && product.dims.heightCm ? product.dims.heightCm / pl.depthCm : rw * aspect * ratio;
      rect = { u: c.x - rw / 2, v: c.y - rh / 2, w: rw, h: rh };
    }
    ed.updateLayer(layer.id, { planeId: pl.id, planeRect: rect, corners: undefined, flipX: false, sizedFromDims: !!(pl.widthCm && product?.dims?.widthCm) }, true);
  };

  const toggleFree = () => {
    if (layer.corners) ed.updateLayer(layer.id, { corners: undefined }, true);
    else ed.updateLayer(layer.id, { corners: objectCorners(layer, aspect, room.planes), planeId: undefined, planeRect: undefined, flipX: false }, true);
  };

  return (
    <View style={{ gap: space.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, flexDirection: ROW }}>
        {TABS.map((t) => (
          <Chip key={t.id} label={t.label} selected={tab === t.id} onPress={() => { setTab(t.id); if (mode === 'hide') setMode('select'); }} testID={`tab-${t.id}`} />
        ))}
      </ScrollView>

      {tab === 'place' && (
        <>
          <Text style={[type.tiny, rtl]}>
            {plane
              ? `מוצמד ל"${plane.name}" – גררו כדי להזיז לאורך המישור, הידית בפינה משנה גודל.`
              : layer.corners
                ? 'פרספקטיבה חופשית: גררו כל אחת מ-4 הפינות, או את המוצר כולו.'
                : 'גררו את המוצר. צביטה משנה גודל, שתי אצבעות מסובבות, והידית בפינה עושה את שניהם.'}
          </Text>
          {!plane && !layer.corners && (
            <>
              <Slider
                label="גודל"
                value={layer.width}
                min={W * 0.03}
                max={W * 1.5}
                onStart={cp}
                onEnd={onRematch}
                onChange={(v) => set({ width: v, sizedFromDims: false })}
                format={(v) => (ppc ? `${Math.round(v / ppc)} ס״מ רוחב` : `${Math.round((v / W) * 100)}% מהתמונה`)}
              />
              <Slider label="סיבוב" value={layer.rotation} min={-180} max={180} step={1} onStart={cp} onChange={(v) => set({ rotation: v })} format={(v) => `${Math.round(v)}°`} />
            </>
          )}
          <View style={styles.row}>
            <IconButton icon="flip-horizontal" label="היפוך" showLabel onPress={() => ed.updateLayer(layer.id, { flipX: !layer.flipX }, true)} />
            <IconButton icon="arrange-bring-forward" label="קדימה" showLabel onPress={() => ed.reorder(layer.id, 1)} />
            <IconButton icon="arrange-send-backward" label="אחורה" showLabel onPress={() => ed.reorder(layer.id, -1)} />
            <IconButton icon="content-copy" label="שכפול" showLabel onPress={() => ed.addLayer({ ...layer, id: `${layer.id}-c${Date.now()}`, x: layer.x + W * 0.04, y: layer.y + W * 0.02, corners: undefined, planeRect: layer.planeRect ? { ...layer.planeRect, u: layer.planeRect.u + 0.05 } : undefined })} />
            <IconButton icon="delete-outline" label="הסרה" showLabel onPress={() => ed.removeLayer(layer.id)} testID="layer-delete" />
          </View>
          {!plane && !layer.corners && ppc && product?.dims?.widthCm ? (
            <Button
              label={`התאמה לגודל אמיתי (${product.dims.widthCm} ס״מ)`}
              icon="tape-measure"
              variant={layer.sizedFromDims ? 'ghost' : 'secondary'}
              onPress={() => ed.updateLayer(layer.id, { width: product.dims!.widthCm! * ppc, sizedFromDims: true }, true)}
            />
          ) : !plane && !layer.sizedFromDims ? (
            <Banner kind="warning" text={!ppc ? 'אין קנה מידה לחדר – הגודל הוא הערכה. סמנו קנה מידה, או הצמידו למישור עם רוחב ידוע.' : 'חסר רוחב המוצר – הזינו מידות בפרטי המוצר כדי לחשב גודל אמיתי.'} />
          ) : null}
        </>
      )}

      {tab === 'persp' && (
        <>
          <Text style={[type.tiny, rtl]}>התאמה לזווית הצילום של החדר. זו הדמיה דו־ממדית של הצילום שלכם – לא מודל תלת־ממדי.</Text>
          {cat && ['mirrorArt', 'appliance', 'curtains', 'rug', 'decor', 'lighting'].includes(cat.id) || planes.length ? (
            <View style={{ gap: 6 }}>
              <Text style={[type.small, rtl, { fontWeight: '700' }]}>{cat?.liesFlat ? 'הנחה על הרצפה' : 'הצמדה לקיר (שומר על הפרספקטיבה שלו)'}</Text>
              <View style={[styles.row, { justifyContent: 'flex-start' }]}>
                {planes.map((p) => (
                  <Chip key={p.id} label={p.name} selected={layer.planeId === p.id} onPress={() => attach(p)} testID={`attach-${p.id}`} />
                ))}
                {layer.planeId && <Chip label="ביטול הצמדה" onPress={() => ed.updateLayer(layer.id, { planeId: undefined, planeRect: undefined }, true)} />}
                {!planes.length && <Button label="סימון קיר/רצפה בחדר" icon="vector-square" variant="secondary" onPress={onOpenRoomTools} />}
              </View>
            </View>
          ) : null}
          {!plane && (
            <Button label={layer.corners ? 'חזרה לפרספקטיבה פשוטה' : 'פרספקטיבה חופשית (4 פינות)'} icon="vector-square" variant={layer.corners ? 'primary' : 'secondary'} onPress={toggleFree} testID="free-persp" />
          )}
          {!plane && !layer.corners && (
            <>
              <Slider label="הטיה קדימה/אחורה" value={layer.tiltX} min={-75} max={75} step={1} onStart={cp} onChange={(v) => set({ tiltX: v })} format={(v) => `${Math.round(v)}°`} />
              <Slider label="סיבוב הצידה" value={layer.tiltY} min={-60} max={60} step={1} onStart={cp} onChange={(v) => set({ tiltY: v })} format={(v) => `${Math.round(v)}°`} />
            </>
          )}
          {cat?.id === 'curtains' && (
            <>
              <Slider label="קפלים" value={layer.folds?.count ?? 0} min={0} max={14} step={1} onStart={cp} onChange={(v) => set({ folds: { count: v, depth: layer.folds?.depth ?? 0.4 } })} format={(v) => (v ? `${v}` : 'ללא')} />
              {!!layer.folds?.count && <Slider label="עומק הקפלים" value={layer.folds.depth} min={0.05} max={1} onStart={cp} onChange={(v) => set({ folds: { count: layer.folds!.count, depth: v } })} format={(v) => `${Math.round(v * 100)}%`} />}
            </>
          )}
          <Slider label="שקיפות" value={layer.opacity} min={0.2} max={1} onStart={cp} onChange={(v) => set({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </>
      )}

      {tab === 'blend' && (
        <>
          <View style={styles.fidelity}>
            <Text style={[type.small, rtl, { fontWeight: '700', color: colors.ink }]}>נאמנות למוצר המקורי ↔ שיפור השתלבות בחדר</Text>
            <Slider
              label={h < 0.15 ? 'המוצר בדיוק כפי שצולם' : h < 0.6 ? 'התאמת תאורה עדינה' : 'השתלבות מלאה בתאורת החדר'}
              value={h}
              min={0}
              max={1}
              onStart={cp}
              onChange={(v) => set({ harmonize: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Text style={[type.tiny, rtl]}>משנה רק תאורה, איזון לבן, ניגודיות, חדות וגרעיניות כדי להתאים לצילום החדר. הצורה, החומרים והפרטים של המוצר לא משתנים; הגוון משתנה רק כמו שהיה נראה בתאורת החדר. ב-0% – בדיוק כפי שצולם.</Text>
            {layer.match ? (
              <Text style={[type.tiny, rtl, { color: colors.inkSoft }]}>
                נמדד: חשיפה ×{((layer.match.gains[0] + layer.match.gains[1] + layer.match.gains[2]) / 3).toFixed(2)} · ניגודיות ×{layer.match.contrast.toFixed(2)} · טשטוש {layer.match.blur.toFixed(1)}px · גרעיניות {(layer.match.grain * 255).toFixed(1)}
              </Text>
            ) : (
              <Text style={[type.tiny, rtl]}>עוד לא חושבה התאמה.</Text>
            )}
            <Button label="מדידה מחדש לפי המיקום הנוכחי" icon="magic-staff" variant="secondary" onPress={onRematch} />
          </View>
          <Text style={[type.small, rtl, { fontWeight: '700' }]}>תוצאות לבחירה</Text>
          <View style={styles.variants}>
            {VARIANTS.map((v) => (
              <Pressable
                key={v.key}
                accessibilityRole="button"
                accessibilityLabel={`${v.label}: ${v.hint}`}
                onPress={() => ed.updateLayer(layer.id, (l) => v.apply(l as ObjectLayer), true)}
                style={({ pressed }) => [styles.variant, pressed && { opacity: 0.8 }]}
                testID={`variant-${v.key}`}
              >
                <View style={styles.variantImg}>{renderVariant(v)}</View>
                <Text style={[type.small, { fontWeight: '700', color: colors.ink, textAlign: 'center' }]}>{v.label}</Text>
                <Text style={[type.tiny, { textAlign: 'center' }]}>{v.hint}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {tab === 'shadow' && (
        <>
          {standing ? (
            <>
              <Slider label="צל מגע (מתחת לרגליים)" value={layer.shadow.contact} min={0} max={1} onStart={cp} onChange={(v) => setShadow({ contact: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="צל מוקרן על הרצפה" value={layer.shadow.cast ?? 0} min={0} max={1} onStart={cp} onChange={(v) => setShadow({ cast: v })} format={(v) => `${Math.round(v * 100)}%`} />
              {(layer.shadow.cast ?? 0) > 0 && (
                <>
                  <Slider label="כיוון הצל" value={layer.shadow.angle ?? -35} min={-90} max={90} step={1} onStart={cp} onChange={(v) => setShadow({ angle: v })} format={(v) => (v > 5 ? 'ימינה' : v < -5 ? 'שמאלה' : 'לאחור')} />
                  <Slider label="אורך הצל" value={layer.shadow.length ?? 0.45} min={0.1} max={1.5} onStart={cp} onChange={(v) => setShadow({ length: v })} format={(v) => `${Math.round(v * 100)}%`} />
                </>
              )}
            </>
          ) : (
            <>
              <Slider label="צל על הקיר" value={layer.shadow.opacity} min={0} max={0.8} onStart={cp} onChange={(v) => setShadow({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="מרחק הצל" value={layer.shadow.dy} min={0} max={W * 0.02} onStart={cp} onChange={(v) => setShadow({ dy: v, dx: v * 0.5 })} format={(v) => `${Math.round(v)}`} />
            </>
          )}
          <Slider label="ריכוך הצל" value={layer.shadow.blur} min={1} max={W * 0.04} onStart={cp} onChange={(v) => setShadow({ blur: v })} format={(v) => `${Math.round(v)}`} />
          <Slider label="בהירות המוצר" value={layer.brightness} min={-0.6} max={0.6} onStart={cp} onChange={(v) => set({ brightness: v })} format={(v) => `${Math.round(v * 100)}`} />
          <Slider label="ניגודיות" value={layer.contrast} min={-0.6} max={0.6} onStart={cp} onChange={(v) => set({ contrast: v })} format={(v) => `${Math.round(v * 100)}`} />
          <Slider label="חום צבע" value={layer.warmth} min={-1} max={1} onStart={cp} onChange={(v) => set({ warmth: v })} format={(v) => (v > 0.05 ? 'חם יותר' : v < -0.05 ? 'קר יותר' : 'ללא')} />
          {(cat?.emitsLight || layer.light) && (
            <View style={{ gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
              <Banner kind="info" text="הדמיית אור להמחשה חזותית בלבד – לא מדידה של עוצמת התאורה." icon="lightbulb-on-outline" />
              <Segmented
                options={[
                  { id: 'off', label: 'כבוי' },
                  { id: 'warm', label: TEMPERATURE_LABELS.warm },
                  { id: 'neutral', label: TEMPERATURE_LABELS.neutral },
                  { id: 'cool', label: TEMPERATURE_LABELS.cool },
                ]}
                value={light.enabled ? light.temperature : 'off'}
                onChange={(v) => {
                  cp();
                  if (v === 'off') setLight({ enabled: false });
                  else setLight({ enabled: true, temperature: v as Temperature });
                }}
              />
              {light.enabled && (
                <>
                  <Slider label="עוצמה (חזותית)" value={light.intensity} min={0.05} max={1} onStart={cp} onChange={(v) => setLight({ intensity: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label="פיזור האור" value={light.radius} min={layer.width * 0.3} max={W * 0.9} onStart={cp} onChange={(v) => setLight({ radius: v })} format={(v) => `${Math.round(v)}`} />
                  <Slider label="מיקום מקור האור" value={light.offsetY} min={-0.5} max={1.5} onStart={cp} onChange={(v) => setLight({ offsetY: v })} format={(v) => `${Math.round(v * 100)}`} />
                </>
              )}
            </View>
          )}
        </>
      )}

      {tab === 'hide' && (
        <>
          <Text style={[type.tiny, rtl]}>
            כשהמוצר עומד מאחורי רהיט קיים (שולחן, כורסה), הרהיט צריך להסתיר אותו. חפצים שסימנתם ב"מבנה החדר" ושעומדים קרוב יותר למצלמה – מסתירים אוטומטית.
          </Text>
          <Segmented
            options={[
              { id: 'auto', label: 'הסתרה אוטומטית' },
              { id: 'off', label: 'ללא הסתרה' },
            ]}
            value={layer.occlusion ?? 'auto'}
            onChange={(v) => ed.updateLayer(layer.id, { occlusion: v }, true)}
          />
          <Text style={[type.tiny, rtl]}>{(room.occluders ?? []).length ? `${room.occluders!.length} חפצים מסומנים בחדר.` : 'עוד לא סומנו חפצים בחדר.'}</Text>
          <Button label="סימון חפצים קיימים בחדר" icon="sofa-outline" variant="secondary" onPress={onOpenRoomTools} />
          <Button label={mode === 'hide' ? 'סיום מברשת הסתרה' : 'מברשת: הסתרת חלק מהמוצר'} icon="brush" variant={mode === 'hide' ? 'primary' : 'secondary'} onPress={() => setMode(mode === 'hide' ? 'select' : 'hide')} testID="hide-brush" />
          {mode === 'hide' && <Slider label="גודל מברשת" value={brushSize} min={6} max={70} step={1} onChange={setBrushSize} format={(v) => `${Math.round(v)}`} />}
          {!!layer.hideStrokes?.length && <Button label="ניקוי סימוני ההסתרה" variant="ghost" onPress={() => ed.updateLayer(layer.id, { hideStrokes: [] }, true)} />}
        </>
      )}

      {tab === 'product' && product && (
        <>
          <Text style={[type.heading, rtl]}>{product.name || cat?.label || 'מוצר'}</Text>
          {(product.store || product.price) && (
            <Text style={[type.small, rtl]}>{[product.store, product.price ? `₪${product.price.toLocaleString('he-IL')}` : null].filter(Boolean).join(' · ')}</Text>
          )}
          {(product.angles?.length ?? 0) > 1 && (
            <View style={{ gap: 6 }}>
              <Text style={[type.small, rtl, { fontWeight: '700' }]}>זווית צילום</Text>
              <View style={[styles.row, { justifyContent: 'flex-start' }]}>
                {product.angles!.map((a, i) => (
                  <Chip
                    key={a.ref}
                    label={`זווית ${i + 1}`}
                    selected={(product.activeAngle ?? 0) === i}
                    onPress={() => {
                      if ((product.activeAngle ?? 0) === i) return;
                      updateProduct(product.id, { activeAngle: i, photo: a.ref, photoW: a.w, photoH: a.h, cutout: undefined, mask: undefined, selection: undefined, sceneStats: undefined });
                      router.push({ pathname: '/cutout/[productId]', params: { productId: product.id, designId, mode: 'object', edit: '1' } });
                    }}
                  />
                ))}
              </View>
              <Text style={[type.tiny, rtl]}>בחרו את הזווית שדומה ביותר לזווית שבה רואים את המקום בחדר.</Text>
            </View>
          )}
          <View style={styles.row}>
            <Button label="פרטים ומידות" icon="pencil-outline" variant="secondary" onPress={() => router.push({ pathname: '/product/[productId]', params: { productId: product.id } })} style={{ flex: 1 }} />
            {product.photo && (
              <Button
                label="תיקון חיתוך"
                icon="crop"
                variant="secondary"
                onPress={() => router.push({ pathname: '/cutout/[productId]', params: { productId: product.id, designId, mode: 'object', edit: '1' } })}
                style={{ flex: 1 }}
              />
            )}
          </View>
          <View style={styles.row}>
            <Button
              label={product.inShoppingList ? 'ברשימת הקניות ✓' : 'לרשימת הקניות'}
              icon="cart-outline"
              variant={product.inShoppingList ? 'primary' : 'secondary'}
              onPress={() => updateProduct(product.id, { inShoppingList: !product.inShoppingList })}
              style={{ flex: 1 }}
            />
            <Button
              label={product.favorite ? 'במועדפים' : 'למועדפים'}
              icon={product.favorite ? 'heart' : 'heart-outline'}
              variant={product.favorite ? 'accent' : 'secondary'}
              onPress={() => updateProduct(product.id, { favorite: !product.favorite })}
              style={{ flex: 1 }}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: ROW, gap: space.sm, flexWrap: 'wrap', justifyContent: 'space-between' },
  fidelity: { gap: space.sm, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: space.md },
  variants: { flexDirection: ROW, flexWrap: 'wrap', gap: space.sm },
  variant: { width: '48%', flexGrow: 1, gap: 4, padding: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  variantImg: { width: '100%', aspectRatio: 1.3, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.canvasBg },
});

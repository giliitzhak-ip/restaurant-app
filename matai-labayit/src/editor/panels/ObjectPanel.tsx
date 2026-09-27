// כלים לאובייקט (רהיט, מנורה, שטיח, אביזר): מיקום וגודל, פרספקטיבה, צל ותאורה, פרטי מוצר.
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, IconButton, Segmented, Slider } from '@/components/ui';
import { TEMPERATURE_LABELS } from '@/imaging/color';
import { pxPerCm } from '@/imaging/geometry';
import { categoryById } from '@/model/categories';
import type { ObjectLayer, Product, Room, Temperature } from '@/model/types';
import { updateProduct } from '@/storage/db';
import { colors, ROW, rtl, space, type } from '@/theme';
import type { DesignEditor } from '../useDesignEditor';

type Tab = 'place' | 'persp' | 'light' | 'product';

export function ObjectPanel({ layer, product, room, ed, designId }: { layer: ObjectLayer; product?: Product; room: Room; ed: DesignEditor; designId: string }) {
  const [tab, setTab] = useState<Tab>('place');
  const W = room.photoW;
  const set = (patch: Partial<ObjectLayer>) => ed.updateLayer(layer.id, patch);
  const setShadow = (patch: Partial<ObjectLayer['shadow']>) => ed.updateLayer(layer.id, { shadow: { ...layer.shadow, ...patch } });
  const cat = product ? categoryById(product.category) : undefined;
  const light = layer.light ?? { enabled: false, temperature: 'warm' as Temperature, intensity: 0.5, radius: layer.width * 1.6, offsetY: 0.25 };
  const setLight = (patch: Partial<NonNullable<ObjectLayer['light']>>) => ed.updateLayer(layer.id, { light: { ...light, ...patch } });
  const ppc = pxPerCm(room.scaleRef);
  const canTrueSize = !!(ppc && product?.dims?.widthCm);
  const cp = ed.checkpoint;

  return (
    <View style={{ gap: space.md }}>
      <Segmented
        options={[
          { id: 'place', label: 'מיקום' },
          { id: 'persp', label: 'פרספקטיבה' },
          { id: 'light', label: 'צל ואור' },
          { id: 'product', label: 'מוצר' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'place' && (
        <>
          <Text style={[type.tiny, rtl]}>גררו את המוצר בתמונה. צביטה משנה גודל, שתי אצבעות מסובבות, והידית בפינה עושה את שניהם.</Text>
          <Slider
            label="גודל"
            value={layer.width}
            min={W * 0.03}
            max={W * 1.5}
            onStart={cp}
            onChange={(v) => set({ width: v, sizedFromDims: false })}
            format={(v) => (ppc ? `${Math.round(v / ppc)} ס״מ רוחב` : `${Math.round((v / W) * 100)}% מהתמונה`)}
          />
          <Slider label="סיבוב" value={layer.rotation} min={-180} max={180} step={1} onStart={cp} onChange={(v) => set({ rotation: v })} format={(v) => `${Math.round(v)}°`} />
          <View style={styles.row}>
            <IconButton icon="flip-horizontal" label="היפוך" showLabel onPress={() => ed.updateLayer(layer.id, { flipX: !layer.flipX }, true)} />
            <IconButton icon="arrange-bring-forward" label="קדימה" showLabel onPress={() => ed.reorder(layer.id, 1)} />
            <IconButton icon="arrange-send-backward" label="אחורה" showLabel onPress={() => ed.reorder(layer.id, -1)} />
            <IconButton icon="content-copy" label="שכפול" showLabel onPress={() => ed.addLayer({ ...layer, id: `${layer.id}-c${Date.now()}`, x: layer.x + W * 0.04, y: layer.y + W * 0.02 })} />
            <IconButton icon="delete-outline" label="הסרה" showLabel onPress={() => ed.removeLayer(layer.id)} testID="layer-delete" />
          </View>
          {canTrueSize ? (
            <Button
              label={`התאמה לגודל אמיתי (${product!.dims!.widthCm} ס״מ)`}
              icon="tape-measure"
              variant={layer.sizedFromDims ? 'ghost' : 'secondary'}
              onPress={() => ed.updateLayer(layer.id, { width: product!.dims!.widthCm! * ppc! * cutoutPad(product!), sizedFromDims: true }, true)}
            />
          ) : (
            <Banner kind="warning" text={!ppc ? 'אין קנה מידה לחדר – הגודל הוא הערכה בלבד. סמנו קנה מידה במסך הראשי של העורך.' : 'חסר רוחב המוצר – הזינו מידות בפרטי המוצר כדי לחשב גודל אמיתי.'} />
          )}
        </>
      )}
      {tab === 'persp' && (
        <>
          <Text style={[type.tiny, rtl]}>התאמה בסיסית לזווית הצילום. זו הדמיה דו־ממדית – לא מדידה מדויקת ולא מציאות רבודה.</Text>
          <Slider label="הטיה קדימה/אחורה" value={layer.tiltX} min={-75} max={75} step={1} onStart={cp} onChange={(v) => set({ tiltX: v })} format={(v) => `${Math.round(v)}°`} />
          <Slider label="סיבוב הצידה" value={layer.tiltY} min={-60} max={60} step={1} onStart={cp} onChange={(v) => set({ tiltY: v })} format={(v) => `${Math.round(v)}°`} />
          <Slider label="שקיפות" value={layer.opacity} min={0.2} max={1} onStart={cp} onChange={(v) => set({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Button label="איפוס פרספקטיבה" variant="ghost" onPress={() => ed.updateLayer(layer.id, { tiltX: cat?.liesFlat ? 58 : 0, tiltY: 0 }, true)} />
        </>
      )}
      {tab === 'light' && (
        <>
          <Slider label="צל מגע (על הרצפה)" value={layer.shadow.contact} min={0} max={1} onStart={cp} onChange={(v) => setShadow({ contact: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="צל מוטל" value={layer.shadow.opacity} min={0} max={0.8} onStart={cp} onChange={(v) => setShadow({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="ריכוך הצל" value={layer.shadow.blur} min={0} max={W * 0.04} onStart={cp} onChange={(v) => setShadow({ blur: v })} format={(v) => `${Math.round(v)}`} />
          <Slider label="כיוון הצל" value={layer.shadow.dx} min={-W * 0.03} max={W * 0.03} onStart={cp} onChange={(v) => setShadow({ dx: v })} format={(v) => (v > 1 ? 'שמאלה' : v < -1 ? 'ימינה' : 'ישר')} />
          <Slider label="בהירות המוצר" value={layer.brightness} min={-0.6} max={0.6} onStart={cp} onChange={(v) => set({ brightness: v })} format={(v) => `${Math.round(v * 100)}`} />
          <Slider label="ניגודיות" value={layer.contrast} min={-0.6} max={0.6} onStart={cp} onChange={(v) => set({ contrast: v })} format={(v) => `${Math.round(v * 100)}`} />
          <Slider label="חום צבע (התאמה לתאורת החדר)" value={layer.warmth} min={-1} max={1} onStart={cp} onChange={(v) => set({ warmth: v })} format={(v) => (v > 0.05 ? 'חם יותר' : v < -0.05 ? 'קר יותר' : 'ללא')} />
          {(cat?.emitsLight || layer.light) && (
            <View style={{ gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
              <Banner kind="info" text="הדמיית אור להמחשה בלבד – לא מדידה של עוצמת התאורה." icon="lightbulb-on-outline" />
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
      {tab === 'product' && product && (
        <>
          <Text style={[type.heading, rtl]}>{product.name || cat?.label || 'מוצר'}</Text>
          {(product.store || product.price) && (
            <Text style={[type.small, rtl]}>
              {[product.store, product.price ? `₪${product.price.toLocaleString('he-IL')}` : null].filter(Boolean).join(' · ')}
            </Text>
          )}
          <View style={styles.row}>
            <Button label="פרטי מוצר ומידות" icon="pencil-outline" variant="secondary" onPress={() => router.push({ pathname: '/product/[productId]', params: { productId: product.id } })} style={{ flex: 1 }} />
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

/** החיתוך כולל שוליים קטנים סביב המוצר; מתקנים כדי שהרוחב יתאים למידה האמיתית. */
function cutoutPad(p: Product) {
  return p.cutoutW && p.cutoutW > 40 ? p.cutoutW / (p.cutoutW - 4) : 1;
}

const styles = StyleSheet.create({
  row: { flexDirection: ROW, gap: space.sm, flexWrap: 'wrap', justifyContent: 'space-between' },
});

import { Canvas, Group, Line, vec, type SkImage } from '@shopify/react-native-skia';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useFeedback } from '@/components/Feedback';
import { Banner, Button, Chip, IconButton, Segmented, Slider } from '@/components/ui';
import { Composition, designImageRefs } from '@/editor/Composition';
import { exportBeforeAfter, exportComparison } from '@/editor/exporter';
import { useSkImage, useSkImages } from '@/imaging/skiaImage';
import { designTotal, shekel } from '@/model/totals';
import type { Design, Product, Room } from '@/model/types';
import { shareImage } from '@/services/share';
import { designsForRoom, saveDesign, useDB, type DBState } from '@/storage/db';
import { colors, radius, ROW, rtl, space, type, LTR } from '@/theme';

type View_ = 'side' | 'beforeAfter';

export default function Compare() {
  const params = useLocalSearchParams<{ roomId: string; a?: string; b?: string }>();
  const room = useDB((s) => s.rooms[params.roomId]);
  const designs = useDB((s: DBState) => designsForRoom(s, params.roomId));
  const products = useDB((s) => s.products);
  const [aId, setA] = useState(params.a ?? designs[0]?.id);
  const [bId, setB] = useState(params.b ?? designs.find((d) => d.id !== (params.a ?? designs[0]?.id))?.id);
  const [view, setView] = useState<View_>(designs.length < 2 ? 'beforeAfter' : 'side');
  const [split, setSplit] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  const A = designs.find((d) => d.id === aId);
  const B = designs.find((d) => d.id === bId);
  const roomImg = useSkImage(room?.photo);
  const refs = useMemo(() => [...designImageRefs(A?.layers ?? [], products, room), ...designImageRefs(B?.layers ?? [], products)], [A, B, products, room]);
  const images = useSkImages(refs);

  if (!room) return <Banner kind="danger" text="החדר לא נמצא" />;

  const share = async () => {
    if (!A) return;
    setBusy(true);
    try {
      const b64 = view === 'side' && B ? await exportComparison(room, A, B) : await exportBeforeAfter(room, A);
      await shareImage(b64, view === 'side' ? 'השוואה.jpg' : 'לפני-אחרי.jpg');
    } catch (e) {
      if (!/cancel|abort/i.test(String((e as Error).message))) toast(`הייצוא נכשל: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const landscape = room.photoW >= room.photoH;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      <View style={styles.inner}>
        <Segmented
          options={[
            { id: 'side', label: 'שתי אפשרויות' },
            { id: 'beforeAfter', label: 'לפני ואחרי' },
          ]}
          value={view}
          onChange={setView}
        />
        <Picker label={view === 'side' ? 'אפשרות א' : 'הגרסה'} designs={designs} value={aId} onChange={setA} />
        {view === 'side' && <Picker label="אפשרות ב" designs={designs} value={bId} onChange={setB} />}

        {!roomImg ? null : view === 'side' ? (
          designs.length < 2 ? (
            <Banner kind="info" text="יש רק גרסה אחת לחדר. צרו גרסה נוספת בעורך (״גרסה חדשה״) כדי להשוות." />
          ) : (
            <View style={{ flexDirection: landscape ? 'column' : ROW, gap: space.sm }}>
              {[A, B].map((d, i) =>
                d ? (
                  <View key={d.id + i} style={{ flex: landscape ? undefined : 1, gap: 6 }}>
                    <Preview room={room} roomImg={roomImg} design={d} products={products} images={images} />
                    <Summary d={d} products={products} tag={i === 0 ? 'א' : 'ב'} />
                  </View>
                ) : null,
              )}
            </View>
          )
        ) : A ? (
          <View style={{ gap: space.sm }}>
            <BeforeAfter room={room} roomImg={roomImg} design={A} products={products} images={images} split={split} onSplit={setSplit} />
            <Slider label="קו החיתוך" value={split} min={0} max={1} onChange={setSplit} format={(v) => `${Math.round(v * 100)}% לפני`} />
            <Summary d={A} products={products} />
          </View>
        ) : null}

        <Text style={[type.tiny, rtl]}>הדמיה להמחשה בלבד. הגודל והצבעים עשויים להיות שונים במציאות.</Text>
        <Button label={view === 'side' ? 'שיתוף תמונת השוואה' : 'שיתוף לפני / אחרי'} icon="share-variant" onPress={share} loading={busy} disabled={!A || (view === 'side' && !B)} testID="share-compare" />
      </View>
    </ScrollView>
  );
}

function Picker({ label, designs, value, onChange }: { label: string; designs: Design[]; value?: string; onChange: (id: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.small, rtl, { fontWeight: '700', color: colors.ink }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: ROW }}>
        {designs.map((d) => (
          <Chip key={d.id} label={d.name} selected={d.id === value} onPress={() => onChange(d.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

function Summary({ d, products, tag }: { d: Design; products: Record<string, Product>; tag?: string }) {
  const total = designTotal(d, products);
  return (
    <View style={styles.summary}>
      <View style={{ flex: 1 }}>
        <Text style={[type.heading, rtl, { fontSize: 15 }]} numberOfLines={1}>
          {tag ? `${tag}. ` : ''}
          {d.name}
        </Text>
        <Text style={[type.tiny, rtl]}>
          {d.layers.length} פריטים{total ? ` · סה״כ ${shekel(total)}` : ''}
        </Text>
      </View>
      <IconButton icon={d.favorite ? 'heart' : 'heart-outline'} label={d.favorite ? 'הסרה מהמועדפים' : 'סימון כמועדפת'} active={d.favorite} onPress={() => saveDesign({ ...d, favorite: !d.favorite })} />
      <Button label="עריכה" variant="secondary" onPress={() => router.push({ pathname: '/editor/[designId]', params: { designId: d.id } })} />
    </View>
  );
}

function Preview({ room, roomImg, design, products, images }: { room: Room; roomImg: SkImage; design: Design; products: Record<string, Product>; images: Record<string, SkImage> }) {
  const [w, setW] = useState(0);
  const s = w / room.photoW;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: '100%', aspectRatio: room.photoW / room.photoH, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.canvasBg }}>
      {w > 0 && (
        <Canvas style={StyleSheet.absoluteFill} accessibilityLabel={`הדמיה של ${design.name}`}>
          <Group transform={[{ scale: s }]}>
            <Composition room={roomImg} roomW={room.photoW} roomH={room.photoH} layers={design.layers} ambient={design.ambient} products={products} images={images} planes={room.planes} occluders={room.occluders} />
          </Group>
        </Canvas>
      )}
    </View>
  );
}

function BeforeAfter({ room, roomImg, design, products, images, split, onSplit }: { room: Room; roomImg: SkImage; design: Design; products: Record<string, Product>; images: Record<string, SkImage>; split: number; onSplit: (v: number) => void }) {
  const [w, setW] = useState(0);
  const s = w / room.photoW;
  const H = room.photoH * s;
  // "לפני" בצד ימין (תחילת הקריאה בעברית), "אחרי" משמאל
  const x = w * (1 - split);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => onSplit(Math.max(0, Math.min(1, 1 - e.x / w))));
  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: '100%', aspectRatio: room.photoW / room.photoH, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.canvasBg, ...LTR }}>
        {w > 0 && (
          <Canvas style={StyleSheet.absoluteFill}>
            <Group transform={[{ scale: s }]}>
              <Composition room={roomImg} roomW={room.photoW} roomH={room.photoH} layers={design.layers} ambient={design.ambient} products={products} images={images} planes={room.planes} occluders={room.occluders} />
            </Group>
            <Group clip={{ x, y: 0, width: w - x, height: H }}>
              <Group transform={[{ scale: s }]}>
                <Composition room={roomImg} roomW={room.photoW} roomH={room.photoH} layers={[]} products={products} images={images} before />
              </Group>
            </Group>
            <Line p1={vec(x, 0)} p2={vec(x, H)} color="#FFFFFF" strokeWidth={3} />
          </Canvas>
        )}
        <View style={[styles.tag, { right: 8 }]} pointerEvents="none">
          <Text style={styles.tagText}>לפני</Text>
        </View>
        <View style={[styles.tag, { left: 8, backgroundColor: colors.primary }]} pointerEvents="none">
          <Text style={styles.tagText}>אחרי</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  inner: { width: '100%', maxWidth: 900, alignSelf: 'center', gap: space.md },
  summary: { flexDirection: ROW, alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: colors.line },
  tag: { position: 'absolute', top: 8, backgroundColor: 'rgba(20,18,16,0.72)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

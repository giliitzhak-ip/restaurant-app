// עורך ההדמיה.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedback } from '@/components/Feedback';
import { Banner, Button, Icon, IconButton, Segmented, Slider } from '@/components/ui';
import { rgbToHex, sampleColor, TEMPERATURE_LABELS } from '@/imaging/color';
import { lumaInQuad, maskToPixels, regionGrow } from '@/imaging/cutout';
import { defaultQuad, pxPerCm } from '@/imaging/geometry';
import { imageFromPixels, loadSkImageFromUri, readPixels, saveSkImage, useSkImage, useSkImages, type Pixels } from '@/imaging/skiaImage';
import { categoryById } from '@/model/categories';
import type { Layer, ObjectLayer, Placement, Pt, SurfaceLayer, Temperature } from '@/model/types';
import { cloudConfigured, segmentSurfaceCloud } from '@/services/cloud';
import { PermissionDeniedError } from '@/services/media';
import { saveToGallery, shareImage } from '@/services/share';
import { getState, saveDesign, saveRoom, updateProduct, useDB } from '@/storage/db';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import { designImageRefs } from '@/editor/Composition';
import { EditorCanvas, type EditorMode } from '@/editor/EditorCanvas';
import { exportBeforeAfter, exportFinal, updateThumbnail } from '@/editor/exporter';
import { duplicateDesign } from '@/editor/flow';
import { newObjectLayer, newSurfaceLayer } from '@/editor/layerFactory';
import { ObjectPanel } from '@/editor/panels/ObjectPanel';
import { SurfacePanel } from '@/editor/panels/SurfacePanel';
import { useDesignEditor } from '@/editor/useDesignEditor';

type SidePanel = null | 'layers' | 'ambient' | 'measure';

const scalePts = (s: number) => (p: Pt) => ({ x: p.x * s, y: p.y * s });

export default function Editor() {
  const params = useLocalSearchParams<{ designId: string; add?: string; placement?: Placement }>();
  const designId = params.designId;
  const design = useDB((s) => s.designs[designId]);
  const room = useDB((s) => (design ? s.rooms[design.roomId] : undefined));
  const products = useDB((s) => s.products);
  const ed = useDesignEditor(designId);
  const insets = useSafeAreaInsets();
  const { toast, ask, confirm } = useFeedback();

  const roomImg = useSkImage(room?.photo);
  const refs = useMemo(() => designImageRefs(ed.layers, products), [ed.layers, products]);
  const images = useSkImages(refs);
  const [roomPx, setRoomPx] = useState<Pixels | null>(null);
  const [mode, setMode] = useState<EditorMode>('select');
  const [before, setBefore] = useState(false);
  const [panel, setPanel] = useState<SidePanel>(null);
  const [brushSize, setBrushSize] = useState(24);
  const [measure, setMeasure] = useState<{ a: Pt; b: Pt } | null>(null);
  const [measureCm, setMeasureCm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [wandTol, setWandTol] = useState(0.35);
  const lastSeed = useRef<Pt | null>(null);
  const handled = useRef(new Set<string>());

  // פיקסלים של החדר (מוקטן) לדגימת צבע, זיהוי משטח וחישוב צללים
  useEffect(() => {
    if (roomImg) setRoomPx(readPixels(roomImg, 640));
  }, [roomImg]);

  // עדכון תמונה ממוזערת כמה שניות אחרי השינוי האחרון, וגם ביציאה מהעורך
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      ed.flush();
      updateThumbnail(designId).catch(() => undefined);
    }, 2500);
    return () => clearTimeout(t);
  }, [ed.layers, ed.ambient]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      updateThumbnail(designId).catch(() => undefined);
    },
    [designId],
  );

  // הוספת מוצר שהגיע מזרימת הצילום
  useEffect(() => {
    const pid = params.add;
    if (!pid || !room || !roomPx || handled.current.has(pid)) return;
    const p = getState().products[pid];
    if (!p) return;
    handled.current.add(pid);
    const cat = categoryById(p.category);
    const placement = params.placement ?? cat.defaultPlacement;
    if (cat.kind === 'object') {
      const aspect = p.cutoutW && p.cutoutH ? p.cutoutH / p.cutoutW : p.photoW && p.photoH ? p.photoH / p.photoW : 1;
      ed.addLayer(newObjectLayer(p, room, placement, aspect));
    } else {
      const layer = newSurfaceLayer(p, room, placement, 0.7);
      const s = roomPx.width / room.photoW;
      layer.baseLuma = lumaInQuad(roomPx, layer.quad.map(scalePts(s)));
      ed.addLayer(layer);
      toast(cat.kind === 'paint' ? 'הקישו "זיהוי לפי צבע" ואז על הקיר – או גררו את הפינות' : 'גררו את הפינות כך שיתאימו למשטח', 'info');
    }
    router.setParams({ add: undefined, placement: undefined });
  }, [params.add, room, roomPx]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = ed.selected;
  const selProduct = selected?.productId ? products[selected.productId] : undefined;

  const onSelect = useCallback(
    (id: string | null) => {
      ed.setSelectedId(id);
      setPanel(null);
      if (mode !== 'measure') setMode('select');
    },
    [ed, mode],
  );

  // ----- נגיעה במצבי דגימה/זיהוי -----
  const onTap = async (pt: Pt) => {
    if (!room || !roomPx) return;
    const s = roomPx.width / room.photoW;
    if (mode === 'eyedropper' && selected?.kind === 'surface') {
      const hex = rgbToHex(sampleColor(roomPx.data, roomPx.width, roomPx.height, pt.x * s, pt.y * s, 3));
      ed.updateLayer(selected.id, { color: hex }, true);
      if (selProduct) updateProduct(selProduct.id, { color: hex });
      toast(`נדגם הצבע ${hex}`, 'success');
      setMode('select');
    } else if (mode === 'wand' && selected?.kind === 'surface') {
      lastSeed.current = pt;
      runWand(pt, wandTol);
    }
  };

  /** זיהוי משטח לפי צבע, החל מנקודת הנגיעה. */
  const runWand = (pt: Pt, tol: number) => {
    if (!room || !roomPx || selected?.kind !== 'surface') return;
    const s = roomPx.width / room.photoW;
    const layerId = selected.id;
    setBusy('מזהים את המשטח…');
    setTimeout(async () => {
      try {
        const res = regionGrow(roomPx, pt.x * s, pt.y * s, tol);
        if (!res.bounds || res.bounds.w * res.bounds.h < roomPx.width * roomPx.height * 0.01) {
          toast('האזור שזוהה קטן מדי. נסו להקיש במקום אחר, להגדיל רגישות, או לסמן את הפינות ידנית.', 'error');
          return;
        }
        const maskRef = await saveSkImage(imageFromPixels(maskToPixels(res.mask)), 'png');
        const b = res.bounds;
        const inv = 1 / s;
        const quad: SurfaceLayer['quad'] = [
          { x: b.x * inv, y: b.y * inv },
          { x: (b.x + b.w) * inv, y: b.y * inv },
          { x: (b.x + b.w) * inv, y: (b.y + b.h) * inv },
          { x: b.x * inv, y: (b.y + b.h) * inv },
        ];
        ed.updateLayer(layerId, { regionMask: maskRef, baseLuma: res.baseLuma, quad }, true);
        toast('המשטח זוהה. אפשר לכוונן פינות, רגישות או להשתמש במברשת הגנה.', 'success');
      } catch (e) {
        toast(`הזיהוי נכשל (${(e as Error).message}). אפשר לסמן את הפינות ידנית.`, 'error');
      } finally {
        setBusy(null);
        setMode('select');
      }
    }, 30);
  };

  const onCloudDetect = async () => {
    if (!room || selected?.kind !== 'surface') return;
    const ok = await confirm(
      'זיהוי משטח בענן',
      'כדי לזהות את המשטח, תמונת החדר תישלח לשרת העיבוד שהגדרתם בהגדרות. השרת לא שומר את התמונה. אפשר תמיד להשתמש בזיהוי המקומי במקום. לשלוח?',
      'שליחה',
    );
    if (!ok) return;
    setBusy('מזהים בענן…');
    try {
      const c = selected.quad.reduce((a, q) => ({ x: a.x + q.x / 4, y: a.y + q.y / 4 }), { x: 0, y: 0 });
      const b64 = await segmentSurfaceCloud(room.photo, { x: c.x / room.photoW, y: c.y / room.photoH }, selected.target);
      const img = await loadSkImageFromUri(`data:image/png;base64,${b64}`);
      const ref = await saveSkImage(img, 'png');
      ed.updateLayer(selected.id, { regionMask: ref }, true);
      toast('המשטח זוהה בענן', 'success');
    } catch (e) {
      toast(`${(e as Error).message} אפשר להמשיך בזיהוי מקומי או ידני.`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const resetArea = () => {
    if (!room || selected?.kind !== 'surface' || !roomPx) return;
    const quad = defaultQuad(selected.target, room.photoW, room.photoH);
    const s = roomPx.width / room.photoW;
    ed.updateLayer(selected.id, { quad, regionMask: undefined, eraseStrokes: [], baseLuma: lumaInQuad(roomPx, quad.map(scalePts(s))) }, true);
  };

  const onBrushEnd = (points: number[], radiusImg: number) => {
    if (selected?.kind !== 'surface') return;
    ed.updateLayer(selected.id, (l) => ({ ...(l as SurfaceLayer), eraseStrokes: [...(l as SurfaceLayer).eraseStrokes, { points: points.map((v) => Math.round(v * 10) / 10), radius: radiusImg }] }), true);
  };

  // ----- קנה מידה -----
  const saveScale = () => {
    const cm = parseFloat(measureCm.replace(',', '.'));
    if (!room || !measure || !(cm > 0)) {
      toast('הזינו אורך בס״מ', 'error');
      return;
    }
    saveRoom({ ...room, scaleRef: { ...measure, lengthCm: cm } });
    const ppc = Math.hypot(measure.a.x - measure.b.x, measure.a.y - measure.b.y) / cm;
    // עדכון גודל אוטומטי לכל המוצרים שיש להם רוחב ידוע
    let n = 0;
    ed.commit((s) => ({
      ...s,
      layers: s.layers.map((l) => {
        const w = l.productId ? getState().products[l.productId]?.dims?.widthCm : undefined;
        if (l.kind === 'object' && w) {
          n++;
          return { ...l, width: w * ppc, sizedFromDims: true };
        }
        return l;
      }),
    }));
    toast(n ? `קנה המידה נשמר. ${n} מוצרים הותאמו לגודל אמיתי.` : 'קנה המידה נשמר לחדר.', 'success');
    setMeasure(null);
    setMeasureCm('');
    setMode('select');
    setPanel(null);
  };

  // ----- פעולות גרסה וייצוא -----
  const saveVersion = async () => {
    ed.flush();
    setBusy('שומרים…');
    try {
      await updateThumbnail(designId);
      toast('הגרסה נשמרה', 'success');
    } finally {
      setBusy(null);
    }
  };

  const newVersion = async () => {
    ed.flush();
    const copy = duplicateDesign(designId);
    if (!copy) return;
    updateThumbnail(designId).catch(() => undefined);
    toast(`נוצרה "${copy.name}". הגרסה הקודמת נשמרה כמו שהיא.`, 'success');
    router.replace({ pathname: '/editor/[designId]', params: { designId: copy.id } });
  };

  const doExport = async () => {
    if (!room || !design) return;
    const choice = await ask('ייצוא ושיתוף', 'התמונה תכלול סימון "הדמיה להמחשה בלבד".', [
      { label: 'שיתוף תמונה סופית', value: 'final' },
      { label: 'שיתוף לפני / אחרי', value: 'ba', style: 'secondary' },
      { label: 'שמירה לגלריה', value: 'gallery', style: 'secondary' },
      { label: 'ביטול', value: 'cancel', style: 'secondary' },
    ]);
    if (!choice || choice === 'cancel') return;
    ed.flush();
    setBusy('מכינים תמונה…');
    try {
      const current = { ...design, layers: ed.layers, ambient: ed.ambient };
      const safe = (design.name || 'הדמיה').replace(/[^\p{L}\p{N}]+/gu, '-');
      if (choice === 'ba') await shareImage(await exportBeforeAfter(room, current), `${safe}-לפני-אחרי.jpg`);
      else if (choice === 'gallery') {
        await saveToGallery(await exportFinal(room, current), `${safe}.jpg`);
        toast('נשמר בגלריה', 'success');
      } else await shareImage(await exportFinal(room, current), `${safe}.jpg`);
    } catch (e) {
      if (e instanceof PermissionDeniedError) toast(e.message, 'error');
      else if (!/cancel|abort/i.test(String((e as Error).message))) toast(`הייצוא נכשל: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!design || !room) {
    return (
      <View style={{ flex: 1, padding: space.xl, paddingTop: insets.top + space.xl, gap: space.md, backgroundColor: colors.bg }}>
        <Banner kind="danger" text="הגרסה לא נמצאה – ייתכן שנמחקה." />
        <Button label="למסך הבית" onPress={() => router.replace('/home')} />
      </View>
    );
  }

  const ppc = pxPerCm(room.scaleRef);
  const estimated = ed.layers.some((l) => l.kind === 'object' && !(ppc && products[l.productId]?.dims?.widthCm));
  const modeHint =
    mode === 'eyedropper' ? 'הקישו על נקודה בתמונה כדי לדגום ממנה צבע' :
    mode === 'wand' ? 'הקישו על הקיר / הרצפה שרוצים לצבוע או לחפות' :
    mode === 'brush' ? 'העבירו אצבע על אזורים שלא צריך לכסות' :
    mode === 'measure' ? 'גררו קו לאורך חפץ שמידתו ידועה (דלת, חלון, שולחן)' : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* סרגל עליון */}
      <View style={styles.top}>
        <IconButton dark icon="arrow-right" label="חזרה" onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/room/[roomId]', params: { roomId: room.id } }))} testID="editor-back" />
        <Pressable accessibilityRole="button" accessibilityLabel={`שם הגרסה: ${design.name}. הקישו לשינוי שם`} onPress={() => setRenaming(design.name)} style={styles.title}>
          <Text style={styles.titleText} numberOfLines={1}>
            {design.name}
          </Text>
          <Text style={styles.subText} numberOfLines={1}>
            {room.name}
          </Text>
        </Pressable>
        <IconButton dark icon="undo" label="ביטול" onPress={ed.undo} disabled={!ed.canUndo} testID="undo" />
        <IconButton dark icon="redo" label="ביצוע מחדש" onPress={ed.redo} disabled={!ed.canRedo} testID="redo" />
      </View>

      {/* קנבס */}
      <View style={{ flex: 1 }}>
        {roomImg ? (
          <EditorCanvas
            room={roomImg}
            roomW={room.photoW}
            roomH={room.photoH}
            layers={ed.layers}
            ambient={ed.ambient}
            products={products}
            images={images}
            selectedId={ed.selectedId}
            mode={mode}
            before={before}
            brushRadius={brushSize}
            measure={measure}
            onSelect={onSelect}
            onCheckpoint={ed.checkpoint}
            onLayerChange={(id, fn) => ed.updateLayer(id, fn)}
            onTap={onTap}
            onBrushEnd={onBrushEnd}
            onMeasure={(m, doneM) => {
              setMeasure(m);
              if (doneM) setPanel('measure');
            }}
          />
        ) : (
          <View style={styles.loadingCanvas}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}
        <View style={styles.badges} pointerEvents="box-none">
          <View style={styles.badge} accessibilityRole="text">
            <Text style={styles.badgeText}>הדמיה להמחשה</Text>
          </View>
          {estimated && !before && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="גודל משוער. הקישו להסבר"
              onPress={async () => {
                const c = await ask(
                  'הגודל בהדמיה הוא הערכה',
                  'כדי להציג גודל מציאותי צריך שני דברים: קנה מידה לחדר (קו על חפץ שמידתו ידועה) ורוחב המוצר בס״מ.',
                  [
                    { label: 'סימון קנה מידה', value: 'measure' },
                    { label: 'הבנתי', value: 'ok', style: 'secondary' },
                  ],
                );
                if (c === 'measure') {
                  ed.setSelectedId(null);
                  setMode('measure');
                }
              }}
              style={[styles.badge, { backgroundColor: 'rgba(138,90,0,0.9)' }]}
            >
              <Icon name="alert-outline" size={14} color="#fff" />
              <Text style={styles.badgeText}>גודל משוער</Text>
            </Pressable>
          )}
          {before && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>לפני</Text>
            </View>
          )}
        </View>
        {modeHint && (
          <View style={styles.modeHint}>
            <Text style={[styles.modeHintText, rtl]}>{modeHint}</Text>
            <Button label="סיום" variant="secondary" onPress={() => { setMode('select'); setMeasure(null); setPanel(null); }} />
          </View>
        )}
        {busy && (
          <View style={styles.busy}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{busy}</Text>
          </View>
        )}
      </View>

      {/* פאנל תחתון */}
      <View style={[styles.panel, { paddingBottom: insets.bottom + space.sm }]}>
        {selected ? (
          <>
            <View style={styles.panelHead}>
              <Text style={[type.heading, rtl, { flex: 1 }]} numberOfLines={1}>
                {selProduct?.name || (selProduct ? categoryById(selProduct.category).label : 'שכבה')}
              </Text>
              <IconButton icon="close" label="סגירת הכלים" onPress={() => onSelect(null)} />
            </View>
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingBottom: space.sm }} keyboardShouldPersistTaps="handled">
              {selected.kind === 'object' ? (
                <ObjectPanel layer={selected} product={selProduct} room={room} ed={ed} designId={designId} />
              ) : (
                <SurfacePanel
                  layer={selected}
                  product={selProduct}
                  room={room}
                  ed={ed}
                  mode={mode}
                  setMode={setMode}
                  brushSize={brushSize}
                  setBrushSize={setBrushSize}
                  onResetArea={resetArea}
                  onCloudDetect={cloudConfigured() ? onCloudDetect : undefined}
                  wandTolerance={wandTol}
                  setWandTolerance={setWandTol}
                  onWandToleranceEnd={() => lastSeed.current && runWand(lastSeed.current, wandTol)}
                />
              )}
            </ScrollView>
          </>
        ) : panel === 'measure' ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ gap: space.sm }}>
            <Text style={[type.heading, rtl]}>מה האורך האמיתי של הקו?</Text>
            <View style={{ flexDirection: ROW, gap: space.sm, alignItems: 'center' }}>
              <TextInput
                accessibilityLabel="אורך בסנטימטרים"
                keyboardType="numeric"
                value={measureCm}
                onChangeText={setMeasureCm}
                placeholder="למשל 80"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoFocus
              />
              <Text style={type.body}>ס״מ</Text>
              <Button label="שמירה" icon="check" onPress={saveScale} />
            </View>
            <Text style={[type.tiny, rtl]}>דלת פנים סטנדרטית: כ־80 ס״מ רוחב, כ־210 ס״מ גובה.</Text>
          </KeyboardAvoidingView>
        ) : panel === 'layers' ? (
          <LayersList layers={ed.layers} products={products} onPick={(id) => onSelect(id)} onClose={() => setPanel(null)} />
        ) : panel === 'ambient' ? (
          <View style={{ gap: space.sm }}>
            <View style={styles.panelHead}>
              <Text style={[type.heading, rtl, { flex: 1 }]}>תאורת החדר</Text>
              <IconButton icon="close" label="סגירה" onPress={() => setPanel(null)} />
            </View>
            <Banner kind="info" text="המחשה חזותית בלבד – לא מדידה של עוצמת תאורה." icon="lightbulb-on-outline" />
            <Segmented
              options={[
                { id: 'none', label: 'ללא' },
                { id: 'warm', label: TEMPERATURE_LABELS.warm },
                { id: 'neutral', label: TEMPERATURE_LABELS.neutral },
                { id: 'cool', label: TEMPERATURE_LABELS.cool },
              ]}
              value={ed.ambient.temperature}
              onChange={(t) => ed.setAmbient({ ...ed.ambient, temperature: t as Temperature | 'none' }, true)}
            />
            <Slider label="בהירות כללית" value={ed.ambient.brightness} min={-0.6} max={0.6} onStart={ed.checkpoint} onChange={(b) => ed.setAmbient({ ...ed.ambient, brightness: b })} format={(v) => `${Math.round(v * 100)}`} />
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            {ed.layers.length === 0 && <Text style={[type.small, rtl]}>הוסיפו מוצר ראשון להדמיה – רהיט, צבע לקיר, ריצוף ועוד.</Text>}
            <Button
              label="הוספת מוצר"
              icon="plus"
              size="lg"
              testID="add-product"
              onPress={() => {
                ed.flush();
                router.push({ pathname: '/add-product', params: { roomId: room.id, designId, from: 'editor' } });
              }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tools}>
              <IconButton showLabel icon="layers-outline" label="שכבות" onPress={() => setPanel('layers')} size={60} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="לפני ואחרי"
                accessibilityHint="החזיקו כדי לראות את החדר לפני השינוי"
                onPressIn={() => setBefore(true)}
                onPressOut={() => setBefore(false)}
                style={({ pressed }) => [styles.holdBtn, pressed && { backgroundColor: colors.accentSoft }]}
                testID="hold-before"
              >
                <Icon name="compare" />
                <Text style={styles.toolLabel}>לפני (החזיקו)</Text>
              </Pressable>
              <IconButton showLabel icon="weather-sunny" label="תאורה" onPress={() => setPanel('ambient')} size={60} />
              <IconButton showLabel icon="ruler-square" label="קנה מידה" onPress={() => { setMode('measure'); setMeasure(null); }} size={60} testID="measure" />
              <IconButton showLabel icon="content-save-outline" label="שמירה" onPress={saveVersion} size={60} testID="save-version" />
              <IconButton showLabel icon="content-copy" label="גרסה חדשה" onPress={newVersion} size={60} testID="new-version" />
              <IconButton showLabel icon="view-split-vertical" label="השוואה" onPress={() => { ed.flush(); router.push({ pathname: '/compare', params: { roomId: room.id, a: designId } }); }} size={60} testID="compare" />
              <IconButton showLabel icon="export-variant" label="ייצוא" onPress={doExport} size={60} testID="export" />
            </ScrollView>
          </View>
        )}
      </View>

      <Modal visible={renaming !== null} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={styles.modalBack}>
          <View style={styles.modal}>
            <Text style={[type.heading, rtl]}>שם הגרסה</Text>
            <TextInput accessibilityLabel="שם הגרסה" value={renaming ?? ''} onChangeText={setRenaming} style={[styles.input, { flex: 0 }]} autoFocus />
            <View style={{ flexDirection: ROW, gap: space.sm }}>
              <Button label="ביטול" variant="secondary" onPress={() => setRenaming(null)} style={{ flex: 1 }} />
              <Button
                label="שמירה"
                onPress={() => {
                  const d = getState().designs[designId];
                  if (d && renaming?.trim()) saveDesign({ ...d, name: renaming.trim(), layers: ed.layers, ambient: ed.ambient });
                  setRenaming(null);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function LayersList({ layers, products, onPick, onClose }: { layers: Layer[]; products: Record<string, import('@/model/types').Product>; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.panelHead}>
        <Text style={[type.heading, rtl, { flex: 1 }]}>שכבות בהדמיה</Text>
        <IconButton icon="close" label="סגירה" onPress={onClose} />
      </View>
      {layers.length === 0 && <Text style={[type.small, rtl]}>עדיין אין שכבות.</Text>}
      <ScrollView style={{ maxHeight: 260 }}>
        {[...layers].reverse().map((l) => {
          const p = l.productId ? products[l.productId] : undefined;
          const label = p?.name || (p ? categoryById(p.category).label : 'שכבה');
          return (
            <Pressable key={l.id} accessibilityRole="button" accessibilityLabel={`בחירת ${label}`} onPress={() => onPick(l.id)} style={({ pressed }) => [styles.layerRow, pressed && { backgroundColor: colors.surfaceAlt }]}>
              {l.kind === 'surface' && l.mode === 'paint' ? (
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: l.color, borderWidth: 1, borderColor: colors.line }} />
              ) : (
                <Icon name={(p ? categoryById(p.category).icon : 'shape-square-plus') as never} color={colors.primary} />
              )}
              <Text style={[type.body, rtl, { flex: 1 }]} numberOfLines={1}>
                {label}
              </Text>
              <Text style={type.tiny}>{l.kind === 'object' ? (l as ObjectLayer).placement === 'wall' ? 'על הקיר' : 'אובייקט' : (l as SurfaceLayer).target === 'floor' ? 'רצפה' : (l as SurfaceLayer).target === 'ceiling' ? 'תקרה' : 'קיר'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasBg },
  top: { flexDirection: ROW, alignItems: 'center', paddingHorizontal: space.sm, gap: 2, minHeight: 56 },
  title: { flex: 1, paddingHorizontal: space.sm, minHeight: 48, justifyContent: 'center' },
  titleText: { color: '#F4F1EA', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  subText: { color: '#BDB5A8', fontSize: 12, textAlign: 'center' },
  loadingCanvas: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badges: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: ROW, gap: 6, flexWrap: 'wrap' },
  badge: { flexDirection: ROW, alignItems: 'center', gap: 4, backgroundColor: 'rgba(20,18,16,0.62)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, minHeight: 28 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modeHint: { position: 'absolute', bottom: 10, left: 10, right: 10, flexDirection: ROW, alignItems: 'center', gap: space.sm, backgroundColor: 'rgba(20,18,16,0.85)', borderRadius: radius.md, padding: space.sm },
  modeHintText: { color: '#fff', flex: 1, fontSize: 14 },
  busy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,18,16,0.55)', alignItems: 'center', justifyContent: 'center', gap: space.md },
  panel: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
  panelHead: { flexDirection: ROW, alignItems: 'center', gap: space.sm },
  tools: { gap: 4, paddingVertical: 2, flexDirection: ROW },
  holdBtn: { minWidth: 60, minHeight: 60, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, paddingHorizontal: 6, gap: 2 },
  toolLabel: { fontSize: 11, fontWeight: '600', color: colors.ink },
  input: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 17, color: colors.ink, backgroundColor: colors.surface, ...rtl },
  layerRow: { flexDirection: ROW, alignItems: 'center', gap: space.md, minHeight: 52, paddingHorizontal: space.sm, borderRadius: radius.md },
  modalBack: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.xl },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.md, width: '100%', maxWidth: 420, alignSelf: 'center' },
});

// מסך חיתוך המוצר: בחירת האובייקט במלבן ← הסרת רקע אוטומטית ← תיקון במברשת.
// מצבים נוספים: בחירת דוגמת טקסטורה (אריחים/פרקט/טפט) ודגימת צבע מתמונה.
import { Canvas, Circle, Group, Image, ImageShader, Path, Rect, type SkImage } from '@shopify/react-native-skia';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedback } from '@/components/Feedback';
import { Banner, Button, Segmented, Slider } from '@/components/ui';
import { frameOutside, strokePath } from '@/editor/paths';
import { openEditorWithProduct } from '@/editor/flow';
import { rgbToHex, sampleColor } from '@/imaging/color';
import { alphaToMask, autoMask, maskCoverage, rectMask, stampStroke, type Mask, type Rect as R } from '@/imaging/cutout';
import { checkerTile, previewCutout, saveCutout, saveSwatch } from '@/imaging/process';
import { forgetSkImage, loadSkImage, loadSkImageFromUri, readPixels, type Pixels } from '@/imaging/skiaImage';
import type { Placement } from '@/model/types';
import { cloudConfigured, removeBackgroundCloud } from '@/services/cloud';
import { getState, updateProduct, useDB } from '@/storage/db';
import { deleteImage } from '@/storage/imageStore';
import { colors, ROW, rtl, space, type, LTR } from '@/theme';

type Mode = 'object' | 'swatch' | 'color';
const WORK = 800;

export default function Cutout() {
  const params = useLocalSearchParams<{ productId: string; designId?: string; placement?: Placement; mode?: Mode; target?: 'current' | 'new'; edit?: string; from?: string }>();
  const product = useDB((s) => s.products[params.productId]);
  const mode: Mode = params.mode ?? 'object';
  const editing = params.edit === '1';
  const insets = useSafeAreaInsets();
  const { toast, confirm } = useFeedback();

  const [photo, setPhoto] = useState<SkImage | null>(null);
  const [px, setPx] = useState<Pixels | null>(null);
  const [sel, setSel] = useState<R | null>(null);
  const [phase, setPhase] = useState<'select' | 'refine'>('select');
  const [mask, setMask] = useState<Mask | null>(null);
  const [preview, setPreview] = useState<SkImage | null>(null);
  const history = useRef<Uint8Array[]>([]);
  const [brush, setBrush] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(22);
  const [tolerance, setTolerance] = useState(0.5);
  const tolRef = useRef(0.5);
  const [showOrig, setShowOrig] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [stroke, setStroke] = useState<number[] | null>(null);
  const [picked, setPicked] = useState<string | null>(product?.color ?? null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [loadError, setLoadError] = useState<string | null>(null);

  // טעינת התמונה והכנת פיקסלים לעבודה
  useEffect(() => {
    if (!product?.photo) return;
    let alive = true;
    (async () => {
      try {
        const img = await loadSkImage(product.photo!);
        const p = readPixels(img, WORK);
        if (!alive) return;
        setPhoto(img);
        setPx(p);
        const def = product.selection ?? (mode === 'swatch' ? squareCenter(p.width, p.height) : { x: p.width * 0.06, y: p.height * 0.06, w: p.width * 0.88, h: p.height * 0.88 });
        setSel(def);
        if (editing && product.mask) {
          const mimg = await loadSkImage(product.mask);
          const mp = readPixels(mimg, Math.max(p.width, p.height));
          const m = alphaToMask(mp);
          if (m.width === p.width && m.height === p.height) {
            setMask(m);
            setPhase('refine');
          }
        }
      } catch (e) {
        setLoadError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [product?.photo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (px && mask) setPreview(previewCutout(px, mask));
  }, [px, mask]);

  // ----- גאומטריה של התצוגה -----
  const W = px?.width ?? 1;
  const H = px?.height ?? 1;
  const fit = Math.min(size.w / W, size.h / H);
  const ox = (size.w - W * fit) / 2;
  const oy = (size.h - H * fit) / 2;
  const geo = useRef({ fit, ox, oy });
  geo.current = { fit, ox, oy };
  const toImg = (x: number, y: number) => ({ x: (x - geo.current.ox) / geo.current.fit, y: (y - geo.current.oy) / geo.current.fit });
  const st = useRef({ sel, phase, mask, brush, brushSize, mode });
  st.current = { sel, phase, mask, brush, brushSize, mode };
  const drag = useRef<{ kind: 'corner'; idx: number; s0: R } | { kind: 'move'; s0: R; start: { x: number; y: number } } | { kind: 'new'; start: { x: number; y: number } } | { kind: 'brush'; pts: number[] } | null>(null);

  const applyStroke = (pts: number[]) => {
    const m = st.current.mask;
    if (!m) return;
    history.current.push(new Uint8Array(m.data));
    if (history.current.length > 30) history.current.shift();
    const next = { ...m, data: new Uint8Array(m.data) };
    stampStroke(next, pts, st.current.brushSize / geo.current.fit, st.current.brush === 'erase' ? 0 : 255);
    setMask(next);
    setStroke(null);
  };

  const undoStroke = () => {
    const prev = history.current.pop();
    if (prev && mask) setMask({ ...mask, data: prev });
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(2)
    .maxPointers(1)
    .onStart((e) => {
      const s = st.current;
      const start = toImg(e.x - e.translationX, e.y - e.translationY);
      if (s.phase === 'refine' && s.mode === 'object') {
        drag.current = { kind: 'brush', pts: [start.x, start.y] };
        setStroke([start.x, start.y]);
        return;
      }
      if (s.mode === 'color' || !s.sel) return;
      const r = s.sel;
      const corners = [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
        { x: r.x, y: r.y + r.h },
      ];
      const hr = 30 / geo.current.fit;
      const idx = corners.findIndex((c) => Math.hypot(c.x - start.x, c.y - start.y) < hr);
      if (idx >= 0) drag.current = { kind: 'corner', idx, s0: r };
      else if (start.x > r.x && start.x < r.x + r.w && start.y > r.y && start.y < r.y + r.h) drag.current = { kind: 'move', s0: r, start };
      else drag.current = { kind: 'new', start };
    })
    .onUpdate((e) => {
      const d = drag.current;
      if (!d) return;
      const cur = toImg(e.x, e.y);
      const clampR = (r: R): R => {
        const x = Math.max(0, Math.min(W - 8, r.x));
        const y = Math.max(0, Math.min(H - 8, r.y));
        return { x, y, w: Math.max(8, Math.min(W - x, r.w)), h: Math.max(8, Math.min(H - y, r.h)) };
      };
      if (d.kind === 'brush') {
        d.pts.push(cur.x, cur.y);
        setStroke([...d.pts]);
      } else if (d.kind === 'move') {
        setSel(clampR({ ...d.s0, x: d.s0.x + cur.x - d.start.x, y: d.s0.y + cur.y - d.start.y }));
      } else if (d.kind === 'new') {
        setSel(clampR({ x: Math.min(d.start.x, cur.x), y: Math.min(d.start.y, cur.y), w: Math.abs(cur.x - d.start.x), h: Math.abs(cur.y - d.start.y) }));
      } else if (d.kind === 'corner') {
        const r = d.s0;
        let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
        if (d.idx === 0 || d.idx === 3) x0 = cur.x;
        else x1 = cur.x;
        if (d.idx === 0 || d.idx === 1) y0 = cur.y;
        else y1 = cur.y;
        setSel(clampR({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }));
      }
    })
    .onEnd(() => {
      const d = drag.current;
      if (d?.kind === 'brush') applyStroke(d.pts);
      drag.current = null;
    })
    .onFinalize(() => {
      drag.current = null;
      setStroke(null);
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e, ok) => {
      if (!ok) return;
      const s = st.current;
      const p = toImg(e.x, e.y);
      if (s.mode === 'color' && px) {
        setPicked(rgbToHex(sampleColor(px.data, px.width, px.height, p.x, p.y, 4)));
      } else if (s.phase === 'refine' && s.mode === 'object') {
        applyStroke([p.x, p.y]);
      }
    });

  const runAuto = (tol = tolerance) => {
    if (!px || !sel) return;
    setBusy('מסירים את הרקע…');
    setTimeout(() => {
      try {
        const m = autoMask(px, sel, tol, true);
        const cov = maskCoverage(m);
        history.current = [];
        setMask(m);
        setPhase('refine');
        if (cov < 0.01) toast('לא זוהה מוצר בבירור. נסו להגדיל את הרגישות או להשתמש במברשת "שחזור".', 'error');
      } catch (e) {
        toast(`הסרת הרקע נכשלה: ${(e as Error).message}. אפשר להשתמש בתמונה כמו שהיא.`, 'error');
      } finally {
        setBusy(null);
      }
    }, 30);
  };

  const useAsIs = () => {
    if (!px || !sel) return;
    history.current = [];
    setMask(rectMask(px.width, px.height, sel));
    setPhase('refine');
  };

  const runCloud = async () => {
    if (!px || !product?.photo) return;
    const ok = await confirm(
      'הסרת רקע בענן',
      'תמונת המוצר בלבד (לא תמונות הבית) תישלח לשרת העיבוד שהגדרתם, לצורך הסרת הרקע. השרת לא שומר את התמונה. להמשיך?',
      'שליחה',
    );
    if (!ok) return;
    setBusy('שולחים לעיבוד בענן…');
    try {
      const b64 = await removeBackgroundCloud(product.photo);
      const img = await loadSkImageFromUri(`data:image/png;base64,${b64}`);
      const p = readPixels(img, Math.max(px.width, px.height));
      if (p.width !== px.width || p.height !== px.height) throw new Error('מידות התוצאה לא תואמות');
      history.current = [];
      setMask(alphaToMask(p));
      setPhase('refine');
    } catch (e) {
      toast(`${(e as Error).message} עוברים להסרה מקומית.`, 'error');
      runAuto();
    } finally {
      setBusy(null);
    }
  };

  const finishObject = async () => {
    if (!photo || !mask || !product) return;
    setBusy('שומרים את החיתוך…');
    try {
      const old = { cutout: product.cutout, mask: product.mask };
      const res = await saveCutout(photo, mask);
      updateProduct(product.id, { ...res, selection: sel ?? undefined });
      if (old.cutout) {
        forgetSkImage(old.cutout);
        deleteImage(old.cutout);
      }
      if (old.mask) deleteImage(old.mask);
      done();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const finishSwatch = async () => {
    if (!photo || !sel || !px || !product) return;
    setBusy('שומרים את הדוגמה…');
    try {
      const res = await saveSwatch(photo, sel, px.width);
      if (product.swatch && product.swatch !== product.photo) deleteImage(product.swatch);
      updateProduct(product.id, { ...res, selection: sel });
      done();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const finishColor = () => {
    if (!picked || !product) return;
    updateProduct(product.id, { color: picked });
    done();
  };

  const done = () => {
    if (editing || !params.designId) {
      router.back();
      return;
    }
    const p = getState().products[params.productId];
    if (!p) return;
    openEditorWithProduct({ designId: params.designId, productId: p.id, placement: params.placement ?? 'floor', target: params.target ?? 'current', fromEditor: params.from === 'editor' });
  };

  if (!product) return <Banner kind="danger" text="המוצר לא נמצא" />;
  if (loadError) {
    return (
      <View style={{ padding: space.lg, gap: space.md }}>
        <Banner kind="danger" text={`לא הצלחנו לטעון את התמונה: ${loadError}`} />
        <Button label="חזרה" onPress={() => router.back()} />
      </View>
    );
  }

  const checker = checkerTile();
  const k = 1 / fit;
  const selPath = sel ? frameOutside(W, H, sel) : null;

  let title = '';
  let hint = '';
  if (mode === 'object' && phase === 'select') {
    title = 'סמנו את המוצר';
    hint = 'גררו את פינות המלבן כך שיקיף את המוצר בלבד. מדפים ואנשים מחוץ למלבן יוסרו.';
  } else if (mode === 'object') {
    title = 'בדקו ותקנו את החיתוך';
    hint = brush === 'erase' ? 'מברשת מחיקה: העבירו אצבע על שאריות רקע.' : 'מברשת שחזור: העבירו אצבע על חלקי מוצר שנמחקו.';
  } else if (mode === 'swatch') {
    title = 'בחרו אזור דוגמה';
    hint = 'סמנו אזור ישר ונקי של האריח / הפרקט / הטפט. הוא יחזור על עצמו על המשטח.';
  } else {
    title = 'דגימת צבע';
    hint = 'הקישו על הצבע בתמונה (למשל על דוגמת הצבע או הפחית).';
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.head}>
        <Text style={[type.heading, rtl]}>{title}</Text>
        <Text style={[type.small, rtl]}>{hint}</Text>
      </View>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View style={styles.canvasWrap} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} collapsable={false}>
          {photo && px ? (
            <Canvas style={StyleSheet.absoluteFill}>
              <Group transform={[{ translateX: ox }, { translateY: oy }, { scale: fit }]}>
                {phase === 'refine' && mode === 'object' && preview ? (
                  <>
                    <Rect x={0} y={0} width={W} height={H}>
                      <ImageShader image={checker} tx="repeat" ty="repeat" fit="none" rect={{ x: 0, y: 0, width: 24 * k, height: 24 * k }} />
                    </Rect>
                    {showOrig && <Image image={photo} x={0} y={0} width={W} height={H} fit="fill" opacity={0.3} />}
                    <Image image={preview} x={0} y={0} width={W} height={H} fit="fill" />
                    {stroke && (
                      <Path path={strokePath(stroke)} style="stroke" strokeWidth={brushSize * 2 * k} strokeCap="round" strokeJoin="round" color={brush === 'erase' ? 'rgba(165,50,43,0.45)' : 'rgba(47,107,69,0.45)'} />
                    )}
                  </>
                ) : (
                  <>
                    <Image image={photo} x={0} y={0} width={W} height={H} fit="fill" />
                    {mode !== 'color' && selPath && sel && (
                      <>
                        <Path path={selPath} color="rgba(20,18,16,0.55)" fillType="evenOdd" />
                        <Rect x={sel.x} y={sel.y} width={sel.w} height={sel.h} style="stroke" strokeWidth={3 * k} color={colors.selection} />
                        {[
                          [sel.x, sel.y],
                          [sel.x + sel.w, sel.y],
                          [sel.x + sel.w, sel.y + sel.h],
                          [sel.x, sel.y + sel.h],
                        ].map(([x, y], i) => (
                          <Circle key={i} cx={x} cy={y} r={12 * k} color="#fff" style="fill" />
                        ))}
                      </>
                    )}
                  </>
                )}
              </Group>
            </Canvas>
          ) : (
            <ActivityIndicator color="#fff" size="large" style={{ flex: 1 }} />
          )}
          {busy && (
            <View style={styles.busy} accessibilityLiveRegion="polite">
              <ActivityIndicator color="#fff" size="large" />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{busy}</Text>
            </View>
          )}
        </View>
      </GestureDetector>

      <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
        {mode === 'object' && phase === 'select' && (
          <>
            <Button label="הסרת רקע אוטומטית" icon="magic-staff" size="lg" onPress={() => runAuto()} disabled={!px} testID="auto-remove" />
            <View style={styles.row}>
              <Button label="תמונה נקייה – בלי הסרה" variant="secondary" onPress={useAsIs} style={{ flex: 1 }} disabled={!px} />
              {cloudConfigured() && <Button label="הסרה בענן" icon="cloud-outline" variant="secondary" onPress={runCloud} style={{ flex: 1 }} />}
            </View>
          </>
        )}
        {mode === 'object' && phase === 'refine' && (
          <>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Segmented
                  options={[
                    { id: 'erase', label: 'מחיקה' },
                    { id: 'restore', label: 'שחזור' },
                  ]}
                  value={brush}
                  onChange={setBrush}
                />
              </View>
              <Button label="ביטול" icon="undo" variant="secondary" onPress={undoStroke} disabled={!history.current.length} />
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Slider label="גודל מברשת" value={brushSize} min={6} max={60} step={1} onChange={setBrushSize} format={(v) => `${Math.round(v)}`} />
              </View>
              <View style={{ flex: 1 }}>
                <Slider label="רגישות הסרה" value={tolerance} min={0.1} max={1} onChange={(v) => {
                    tolRef.current = v;
                    setTolerance(v);
                  }}
                  onEnd={() => runAuto(tolRef.current)} format={(v) => `${Math.round(v * 100)}%`} />
              </View>
            </View>
            <View style={styles.row}>
              <Button label={showOrig ? 'הסתר מקור' : 'הצג מקור'} variant="ghost" onPress={() => setShowOrig(!showOrig)} style={{ flex: 1 }} />
              <Button label="בחירה מחדש" variant="ghost" onPress={() => setPhase('select')} style={{ flex: 1 }} />
            </View>
            <Button label={editing ? 'שמירת החיתוך' : 'סיום – להדמיה'} icon="check" size="lg" onPress={finishObject} disabled={!!busy} testID="cutout-done" />
          </>
        )}
        {mode === 'swatch' && <Button label="שימוש כדוגמה חוזרת" icon="check" size="lg" onPress={finishSwatch} disabled={!px || !!busy} testID="swatch-done" />}
        {mode === 'color' && (
          <View style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: picked ?? '#ccc' }]} accessibilityLabel={picked ? `הצבע שנבחר ${picked}` : 'עוד לא נבחר צבע'} />
            <Button label="שימוש בצבע" icon="check" size="lg" onPress={finishColor} disabled={!picked} style={{ flex: 1 }} />
          </View>
        )}
      </View>
    </View>
  );
}

function squareCenter(w: number, h: number): R {
  const s = Math.min(w, h) * 0.6;
  return { x: (w - s) / 2, y: (h - s) / 2, w: s, h: s };
}


const styles = StyleSheet.create({
  head: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: 2 },
  canvasWrap: { flex: 1, backgroundColor: colors.canvasBg, ...LTR, overflow: 'hidden' },
  busy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,18,16,0.6)', alignItems: 'center', justifyContent: 'center', gap: space.md },
  panel: { padding: space.lg, gap: space.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  row: { flexDirection: ROW, gap: space.sm, alignItems: 'center' },
  swatch: { width: 58, height: 58, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
});

// עורך ההדמיה.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedback } from '@/components/Feedback';
import { Banner, Button, Icon, IconButton, Segmented, Slider } from '@/components/ui';
import { rgbToHex, sampleColor, TEMPERATURE_LABELS } from '@/imaging/color';
import { alphaToMask, closeSeams, lumaInQuad, maskArea, regionGrow, type Mask } from '@/imaging/cutout';
import { defaultQuad, pxPerCm } from '@/imaging/geometry';
import { imageFromPixels, loadSkImage, loadSkImageFromUri, readPixels, saveSkImage, useSkImage, useSkImages, type Pixels } from '@/imaging/skiaImage';
import { categoryById } from '@/model/categories';
import type { Layer, ObjectLayer, Placement, Plane, Pt, Quad, SurfaceLayer, Temperature } from '@/model/types';
import { cloudConfigured, serverCapabilities } from '@/services/cloud';
import { PermissionDeniedError } from '@/services/media';
import { saveToGallery, shareImage } from '@/services/share';
import { getState, saveDesign, saveRoom, updateProduct, useDB } from '@/storage/db';
import { deleteImage } from '@/storage/imageStore';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import { Canvas, Group } from '@shopify/react-native-skia';
import { Composition, designImageRefs } from '@/editor/Composition';
import { EditorCanvas, type EditQuad, type EditorMode } from '@/editor/EditorCanvas';
import { objectCorners } from '@/editor/objectGeometry';
import { RoomToolsPanel } from '@/editor/panels/RoomToolsPanel';
import { computeLayerMatch, computeSurfaceMatch, type Variant } from '@/editor/realism';
import { detectAt, mergeIntoOccluder, occluderFromMask, planeQuadFromMask, resampleMask, saveMask, strokesBottom, surfaceQuadFromMask } from '@/editor/roomTools';
import { uid } from '@/utils/id';
import { exportBeforeAfter, exportFinal, exportHarmonizedAI, updateThumbnail } from '@/editor/exporter';
import { duplicateDesign } from '@/editor/flow';
import { newObjectLayer, newSurfaceLayer } from '@/editor/layerFactory';
import { ObjectPanel } from '@/editor/panels/ObjectPanel';
import { SurfacePanel } from '@/editor/panels/SurfacePanel';
import { useDesignEditor } from '@/editor/useDesignEditor';

type SidePanel = null | 'layers' | 'ambient' | 'measure' | 'room';

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
  const refs = useMemo(() => designImageRefs(ed.layers, products, room), [ed.layers, products, room]);
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
  const [selectedPlaneId, setSelectedPlaneId] = useState<string | null>(null);
  const [occTol, setOccTol] = useState(0.3);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const roomUploadOk = useRef(false);
  const brushOccluder = useRef<string | null>(null);
  const [appendTo, setAppendTo] = useState<string | null>(null);
  const [addRegion, setAddRegion] = useState(false);

  // האם יש שרת עם מודלי AI (SAM) – רק אם המשתמש הפעיל ואישר עיבוד בענן בהגדרות
  useEffect(() => {
    serverCapabilities().then((c) => setAiAvailable(!!c?.segment));
  }, []);

  /** אישור שליחת תמונת החדר לשרת – פעם אחת לכל כניסה לעורך, עם הסבר מלא. */
  const allowRoomUpload = async () => {
    if (roomUploadOk.current) return true;
    const ok = await confirm(
      'שליחת תמונת החדר לעיבוד',
      'לזיהוי AI, תמונת החדר תישלח לשרת העיבוד שהגדרתם (לא לצד שלישי), תעובד בזיכרון ולא תישמר שם. אפשר לבחור "זיהוי מקומי" במקום. לאשר עד שתצאו מהעורך?',
      'אישור',
    );
    roomUploadOk.current = ok;
    return ok;
  };

  /** מדידת התאמת התאורה של מוצר למקום שלו בחדר (אחרי הוספה/הזזה). */
  const rematch = useCallback(
    async (id: string) => {
      const r = getState().rooms[design?.roomId ?? ''];
      const l = latestLayers.current.find((x) => x.id === id);
      if (!r || !roomPx || !l || l.kind !== 'object') return;
      const m = await computeLayerMatch(l, r, roomPx, r.planes);
      if (m) ed.updateLayer(id, { match: m });
    },
    [roomPx, design?.roomId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const latestLayers = useRef(ed.layers);
  latestLayers.current = ed.layers;

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
      const layer = newObjectLayer(p, room, placement, aspect);
      ed.addLayer(layer);
      setTimeout(() => rematch(layer.id), 50);
    } else {
      const layer = newSurfaceLayer(p, room, placement, 0.7);
      // אם סומן מישור מתאים בחדר – מתחילים ממנו
      const pl = room.planes?.find((x) => x.kind === (layer.target === 'floor' ? 'floor' : 'wall'));
      if (pl && (layer.target === 'floor' || layer.target === 'wall')) {
        layer.quad = pl.quad.map((q) => ({ ...q })) as SurfaceLayer['quad'];
        layer.planeId = pl.id;
      }
      const s = roomPx.width / room.photoW;
      layer.baseLuma = lumaInQuad(roomPx, layer.quad.map(scalePts(s)));
      ed.addLayer(layer);
      if (layer.mode === 'pattern')
        computeSurfaceMatch(layer, roomPx).then((match) => match && ed.updateLayer(layer.id, { match, harmonize: 0.5 }));
      toast(cat.kind === 'paint' ? 'הקישו "זיהוי לפי צבע" ואז על הקיר – או גררו את הפינות' : 'הקישו "זיהוי המשטח בנגיעה" ואז על המשטח – או גררו את הפינות', 'info');
    }
    router.setParams({ add: undefined, placement: undefined });
  }, [params.add, room, roomPx]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = ed.selected;
  const selProduct = selected?.productId ? products[selected.productId] : undefined;

  const onSelect = useCallback(
    (id: string | null) => {
      ed.setSelectedId(id);
      setPanel(null);
      setAddRegion(false);
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
    } else if (mode === 'occluderTap') {
      await addOccluderAt(pt);
    } else if (mode === 'planeTap' && selectedPlaneId) {
      await detectPlaneAt(pt);
    }
  };

  const wantAi = async () => aiAvailable && useAi && (await allowRoomUpload());

  /** סימון חפץ קיים בנגיעה (AI או לפי צבע). */
  // פעולות על חפצים רצות בתור: שתי נגיעות מהירות לא ידרסו זו את זו באיחוד המסכות
  const occQueue = useRef<Promise<void>>(Promise.resolve());
  const addOccluderAt = (pt: Pt) => {
    const run = occQueue.current.then(() => addOccluderNow(pt));
    occQueue.current = run.catch(() => undefined);
    return run;
  };
  const addOccluderNow = async (pt: Pt) => {
    if (!room || !roomPx) return;
    const ai = await wantAi();
    setBusy(ai ? 'מזהים את החפץ (AI)…' : 'מזהים את החפץ…');
    try {
      const d = await detectAt(room, roomPx, pt, occTol, ai);
      const cur = getState().rooms[room.id];
      const target = appendTo ? cur.occluders?.find((o) => o.id === appendTo) : undefined;
      // הגנה: נגיעה שפספסה חלק דק (רגל) בוחרת לפעמים את כל הרצפה/הקיר – זה לא "חפץ"
      const area = maskArea(d.mask);
      if (area > (target ? 0.12 : 0.3)) {
        toast('נבחר אזור גדול מדי (כנראה רצפה או קיר). הקישו בדיוק על החפץ, או סמנו אותו במברשת.', 'error');
        return;
      }
      if (target) {
        const merged = await mergeIntoOccluder(cur, target, d.mask, async (ref) => alphaToMask(readPixels(await loadSkImage(ref), Math.max(roomPx.width, roomPx.height))));
        saveRoom({ ...cur, occluders: (cur.occluders ?? []).map((o) => (o.id === target.id ? merged : o)) });
        if (target.mask && target.mask !== merged.mask) deleteImage(target.mask);
        toast(`החלק נוסף ל"${target.name}".`, 'success');
        return;
      }
      const occ = await occluderFromMask(room, d.mask, d.method, (room.occluders?.length ?? 0) + 1);
      if (!occ) {
        toast('לא זוהה חפץ ברור. נסו להקיש במרכזו, או סמנו במברשת.', 'error');
        return;
      }
      saveRoom({ ...getState().rooms[room.id], occluders: [...(getState().rooms[room.id].occluders ?? []), occ] });
      toast(`"${occ.name}" סומן. מוצרים מאחוריו יוסתרו.`, 'success');
    } catch (e) {
      toast(`הזיהוי נכשל: ${(e as Error).message}. אפשר לסמן במברשת.`, 'error');
    } finally {
      setBusy(null);
    }
  };

  /** זיהוי קיר/רצפה בנגיעה והתאמת מרובע המישור. */
  const detectPlaneAt = async (pt: Pt) => {
    if (!room || !roomPx || !selectedPlaneId) return;
    const ai = await wantAi();
    setBusy('מזהים את המשטח…');
    try {
      const d = await detectAt(room, roomPx, pt, 0.3, ai);
      const kind = room.planes?.find((p) => p.id === selectedPlaneId)?.kind ?? 'wall';
      const q = planeQuadFromMask(room, d.mask, kind);
      if (!q) throw new Error('לא זוהה משטח');
      updatePlane(selectedPlaneId, { quad: q });
      toast('המישור זוהה – כוונו פינות אם צריך.', 'success');
    } catch (e) {
      toast(`${(e as Error).message}. גררו את הפינות ידנית.`, 'error');
    } finally {
      setBusy(null);
      setMode('select');
    }
  };

  const updatePlane = (id: string, patch: Partial<Plane>) => {
    const r = getState().rooms[room!.id];
    saveRoom({ ...r, planes: (r.planes ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };

  const addPlane = (kind: 'floor' | 'wall') => {
    if (!room) return;
    const r = getState().rooms[room.id];
    const n = (r.planes ?? []).filter((p) => p.kind === kind).length;
    const plane: Plane = { id: uid(), kind, name: kind === 'floor' ? (n ? `רצפה ${n + 1}` : 'רצפה') : `קיר ${n + 1}`, quad: defaultQuad(kind, room.photoW, room.photoH) };
    saveRoom({ ...r, planes: [...(r.planes ?? []), plane] });
    setSelectedPlaneId(plane.id);
  };

  /** שינוי מרובע שבעריכה (מישור / פתח / פרספקטיבה חופשית של מוצר). */
  const onQuadChange = (key: string, quad: Pt[], done: boolean) => {
    const [kind, id, idx] = key.split(':');
    if (kind === 'plane') {
      updatePlane(id, { quad: quad as Quad });
    } else if (kind === 'obj') {
      ed.updateLayer(id, { corners: quad as Quad });
    } else if (kind === 'open') {
      ed.updateLayer(id, (l) => {
        const s0 = l as SurfaceLayer;
        return { ...s0, openings: (s0.openings ?? []).map((o, i) => (i === Number(idx) ? (quad as Quad) : o)) };
      });
    }
    if (done && kind === 'obj') rematch(id);
  };

  /**
   * זיהוי משטח מנקודת נגיעה (AI בשרת או לפי צבע). במצב "הוספת אזור" המסכה החדשה מתאחדת עם הקיימת
   * (למשל כתמי שמש על הרצפה שהזיהוי השאיר בחוץ). המרובע קובע את הפרספקטיבה: לרצפה – לפי קווי הקיר-רצפה;
   * משטח שמוצמד למישור שומר על מרובע המישור.
   */
  const runWand = async (pt: Pt, tol: number) => {
    if (!room || !roomPx || selected?.kind !== 'surface') return;
    const s = roomPx.width / room.photoW;
    const layer = selected;
    const append = addRegion && !!layer.regionMask;
    const ai = await wantAi();
    setBusy(ai ? 'מזהים את המשטח (AI)…' : 'מזהים את המשטח…');
    await new Promise((r) => setTimeout(r, 30));
    try {
      let mask: Mask;
      if (ai) mask = (await detectAt(room, roomPx, pt, tol, true)).mask;
      else {
        const res = regionGrow(roomPx, pt.x * s, pt.y * s, tol);
        if (!res.bounds || (!append && res.bounds.w * res.bounds.h < roomPx.width * roomPx.height * 0.01)) {
          toast('האזור שזוהה קטן מדי. נסו להקיש במקום אחר, להגדיל רגישות, או לסמן את הפינות ידנית.', 'error');
          return;
        }
        mask = res.mask;
      }
      if (append) {
        const prev = resampleMask(alphaToMask(readPixels(await loadSkImage(layer.regionMask!), Math.max(roomPx.width, roomPx.height))), mask.width, mask.height);
        if (maskArea(mask) > 0.3) {
          toast('נבחר אזור גדול מדי – לא נוסף. הקישו בדיוק על החלק החסר.', 'error');
          return;
        }
        const u = new Uint8Array(mask.data.length);
        for (let i = 0; i < u.length; i++) u[i] = Math.max(prev.data[i], mask.data[i]);
        closeSeams(u, mask.width, mask.height, 2);
        ed.updateLayer(layer.id, { regionMask: await saveMask({ data: u, width: mask.width, height: mask.height }) }, true);
        toast('האזור נוסף למשטח.', 'success');
        return;
      }
      let luma = 0;
      let n = 0;
      for (let i = 0; i < mask.data.length; i++)
        if (mask.data[i] > 128) {
          luma += 0.299 * roomPx.data[i * 4] + 0.587 * roomPx.data[i * 4 + 1] + 0.114 * roomPx.data[i * 4 + 2];
          n++;
        }
      const plane = layer.planeId ? room.planes?.find((p) => p.id === layer.planeId) : undefined;
      const quad = plane ? undefined : surfaceQuadFromMask(mask, s, layer.target);
      ed.updateLayer(layer.id, { regionMask: await saveMask(mask), baseLuma: n ? luma / n / 255 : 0.7, ...(quad ? { quad } : {}) }, true);
      toast(
        ai ? 'המשטח זוהה (AI). חלק חסר (כתם אור, פינה)? "הוספת אזור" והקישו עליו.' : 'המשטח זוהה. אפשר להוסיף אזורים, לכוונן רגישות או להשתמש במברשת הגנה.',
        'success',
      );
    } catch (e) {
      toast(`הזיהוי נכשל (${(e as Error).message}). ${ai ? 'עוברים לזיהוי מקומי.' : 'אפשר לסמן את הפינות ידנית.'}`, 'error');
      if (ai) setUseAi(false);
    } finally {
      setBusy(null);
      if (!addRegion) setMode('select');
    }
  };

  const resetArea = () => {
    if (!room || selected?.kind !== 'surface' || !roomPx) return;
    const quad = defaultQuad(selected.target, room.photoW, room.photoH);
    const s = roomPx.width / room.photoW;
    ed.updateLayer(selected.id, { quad, regionMask: undefined, eraseStrokes: [], baseLuma: lumaInQuad(roomPx, quad.map(scalePts(s))) }, true);
  };

  const onBrushEnd = (points: number[], radiusImg: number) => {
    const stroke = { points: points.map((v) => Math.round(v * 10) / 10), radius: radiusImg };
    if (mode === 'occluderBrush' && room) {
      const r = getState().rooms[room.id];
      let occs = r.occluders ?? [];
      let id = brushOccluder.current;
      if (!id || !occs.some((o) => o.id === id)) {
        id = uid();
        brushOccluder.current = id;
        occs = [...occs, { id, name: `חפץ ${occs.length + 1}`, strokes: [], bottomY: 0, source: 'brush' }];
      }
      saveRoom({ ...r, occluders: occs.map((o) => (o.id === id ? { ...o, strokes: [...o.strokes, stroke], bottomY: strokesBottom([...o.strokes, stroke]) } : o)) });
      return;
    }
    if (mode === 'hide' && selected?.kind === 'object') {
      ed.updateLayer(selected.id, (l) => ({ ...(l as ObjectLayer), hideStrokes: [...((l as ObjectLayer).hideStrokes ?? []), stroke] }), true);
      return;
    }
    if (selected?.kind !== 'surface') return;
    ed.updateLayer(selected.id, (l) => ({ ...(l as SurfaceLayer), eraseStrokes: [...(l as SurfaceLayer).eraseStrokes, stroke] }), true);
  };

  /** תצוגה מקדימה קטנה של "תוצאה" – חיתוך סביב המוצר עם הווריאנט. */
  const renderVariant = (v: Variant) => {
    if (!roomImg || !room || selected?.kind !== 'object') return null;
    const vl = v.apply(selected);
    const layers = ed.layers.map((l) => (l.id === selected.id ? vl : l));
    const pr = products[selected.productId];
    const q = objectCorners(vl, pr?.cutoutW && pr.cutoutH ? pr.cutoutH / pr.cutoutW : 1, room.planes);
    const xs = q.map((c) => c.x);
    const ys = q.map((c) => c.y);
    const bw = (Math.max(...xs) - Math.min(...xs)) * 1.5;
    const bh = (Math.max(...ys) - Math.min(...ys)) * 1.5;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2 + bh * 0.08;
    const PW = 150;
    const k = Math.min(PW / bw, (PW / 1.3) / bh);
    return (
      <Canvas style={{ flex: 1 }}>
        <Group transform={[{ translateX: PW / 2 }, { translateY: PW / 1.3 / 2 }, { scale: k }, { translateX: -cx }, { translateY: -cy }]}>
          <Composition room={roomImg} roomW={room.photoW} roomH={room.photoH} layers={layers} ambient={ed.ambient} products={products} images={images} planes={room.planes} occluders={room.occluders} />
        </Group>
      </Canvas>
    );
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
    const caps = await serverCapabilities();
    const choice = await ask('ייצוא ושיתוף', 'התמונה תכלול סימון "הדמיה להמחשה בלבד".', [
      { label: 'שיתוף תמונה סופית', value: 'final' },
      ...(caps?.harmonize ? [{ label: 'שיפור השתלבות AI (ניסיוני)', value: 'ai', style: 'secondary' as const }] : []),
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
      if (choice === 'ai') {
        if (!(await allowRoomUpload())) return;
        setBusy('משפרים השתלבות ב-AI (המוצר נשמר כמו שהוא)…');
        await shareImage(await exportHarmonizedAI(room, current), `${safe}-AI.jpg`);
      } else if (choice === 'ba') await shareImage(await exportBeforeAfter(room, current), `${safe}-לפני-אחרי.jpg`);
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
    mode === 'wand' ? (addRegion ? 'הקישו על חלק שחסר במשטח (כתם אור, פינה). בסיום – "סיום הוספת אזורים"' : 'הקישו על הקיר / הרצפה שרוצים לצבוע או לחפות') :
    mode === 'brush' ? 'העבירו אצבע על אזורים שלא צריך לכסות' :
    mode === 'measure' ? 'גררו קו לאורך חפץ שמידתו ידועה (דלת, חלון, שולחן)' :
    mode === 'hide' ? 'העבירו אצבע על חלקי המוצר שצריכים להיות מוסתרים' :
    mode === 'occluderTap' ? (appendTo ? 'הקישו על חלקים נוספים של החפץ (למשל רגליים). בסיום – "סיום הוספת חלקים"' : 'הקישו על רהיט קיים בחדר (למשל שולחן או כורסה)') :
    mode === 'occluderBrush' ? 'צבעו על רהיט קיים כדי לסמן אותו' :
    mode === 'planeTap' ? 'הקישו על הקיר או הרצפה שרוצים לסמן' : null;
  const editQuads: EditQuad[] = [];
  if (selected?.kind === 'object' && selected.corners) editQuads.push({ key: `obj:${selected.id}`, quad: selected.corners });
  if (panel === 'room' && selectedPlaneId) {
    const pl = room.planes?.find((x) => x.id === selectedPlaneId);
    if (pl) editQuads.push({ key: `plane:${pl.id}`, quad: pl.quad, color: '#FF8A3D' });
  }
  if (selected?.kind === 'surface') (selected.openings ?? []).forEach((o, i) => editQuads.push({ key: `open:${selected.id}:${i}`, quad: o, color: '#3FA7FF' }));

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
            planes={room.planes}
            occluders={room.occluders}
            editQuads={editQuads}
            showOccluders={panel === 'room' || mode === 'hide'}
            onQuadChange={onQuadChange}
            onObjectGestureEnd={rematch}
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
        {busy && (
          <View style={styles.busy}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{busy}</Text>
          </View>
        )}
      </View>

      {/* הנחיה למצב הנוכחי – מחוץ לתמונה, כדי לא להסתיר אזור שצריך להקיש עליו */}
      {modeHint && (
        <View style={styles.modeHint}>
          <Text style={[styles.modeHintText, rtl]}>{modeHint}</Text>
          <Button label="סיום" variant="secondary" onPress={() => { if (mode !== 'occluderBrush' && mode !== 'occluderTap' && mode !== 'planeTap') setPanel(null); brushOccluder.current = null; setAppendTo(null); setAddRegion(false); setMode('select'); setMeasure(null); }} />
        </View>
      )}
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
                <ObjectPanel
                  layer={selected}
                  product={selProduct}
                  room={room}
                  ed={ed}
                  designId={designId}
                  mode={mode}
                  setMode={setMode}
                  brushSize={brushSize}
                  setBrushSize={setBrushSize}
                  onRematch={() => rematch(selected.id)}
                  onOpenRoomTools={() => {
                    onSelect(null);
                    setPanel('room');
                  }}
                  renderVariant={renderVariant}
                />
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
                  aiAvailable={aiAvailable}
                  useAi={useAi}
                  setUseAi={setUseAi}
                  wandTolerance={wandTol}
                  setWandTolerance={setWandTol}
                  onWandToleranceEnd={() => lastSeed.current && !addRegion && runWand(lastSeed.current, wandTol)}
                  addRegion={addRegion}
                  setAddRegion={setAddRegion}
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
        ) : panel === 'room' ? (
          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            <RoomToolsPanel
              room={room}
              mode={mode}
              setMode={setMode}
              selectedPlaneId={selectedPlaneId}
              setSelectedPlaneId={setSelectedPlaneId}
              onAddPlane={addPlane}
              onDeletePlane={(id) => {
                const r = getState().rooms[room.id];
                saveRoom({ ...r, planes: (r.planes ?? []).filter((p) => p.id !== id) });
                setSelectedPlaneId(null);
              }}
              onPlaneSize={(id, widthCm, depthCm) => updatePlane(id, { widthCm, depthCm })}
              appendTo={appendTo}
              setAppendTo={setAppendTo}
              onDeleteOccluder={(id) => {
                const r = getState().rooms[room.id];
                saveRoom({ ...r, occluders: (r.occluders ?? []).filter((o) => o.id !== id) });
              }}
              onFinishBrush={() => {
                brushOccluder.current = null;
                setMode('select');
              }}
              brushSize={brushSize}
              setBrushSize={setBrushSize}
              tol={occTol}
              setTol={setOccTol}
              aiAvailable={aiAvailable}
              useAi={useAi}
              setUseAi={setUseAi}
              onClose={() => {
                setPanel(null);
                setMode('select');
                setSelectedPlaneId(null);
              }}
            />
          </ScrollView>
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
              <IconButton showLabel icon="vector-square" label="מבנה החדר" onPress={() => setPanel('room')} size={60} testID="room-tools" />
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
  modeHint: { flexDirection: ROW, marginHorizontal: space.sm, marginBottom: space.xs, alignItems: 'center', gap: space.sm, backgroundColor: 'rgba(20,18,16,0.85)', borderRadius: radius.md, padding: space.sm },
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

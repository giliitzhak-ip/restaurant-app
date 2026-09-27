// קנבס העורך: מציג את ההדמיה ומטפל במחוות – גרירה, צביטה לשינוי גודל, סיבוב בשתי אצבעות,
// ידית פינה לגודל+סיבוב, גרירת פינות (משטח / פרספקטיבה חופשית / מישור / פתח), גרירה על מישור,
// מברשות (הגנה על משטח, הסתרת חלק ממוצר, סימון חפץ קיים), קו ייחוס ונגיעה לדגימה/זיהוי.
import { Canvas, Circle, DashPathEffect, Group, Image, Line, Path, vec, type SkImage } from '@shopify/react-native-skia';
import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { imageToPlane } from '@/imaging/geometry';
import { pointInPoly } from '@/imaging/cutout';
import type { Ambient, Layer, ObjectLayer, Occluder, Plane, Product, Pt, Quad, SurfaceLayer } from '@/model/types';
import { colors, LTR } from '@/theme';
import { Composition, objectImageRef } from './Composition';
import { objectCorners } from './objectGeometry';
import { polygonPath, strokePath } from './paths';

export type EditorMode = 'select' | 'eyedropper' | 'wand' | 'brush' | 'measure' | 'hide' | 'occluderTap' | 'occluderBrush' | 'planeTap';

export type EditQuad = { key: string; quad: Pt[]; color?: string };

type Props = {
  room: SkImage;
  roomW: number;
  roomH: number;
  layers: Layer[];
  ambient: Ambient;
  products: Record<string, Product>;
  images: Record<string, SkImage>;
  planes?: Plane[];
  occluders?: Occluder[];
  selectedId: string | null;
  mode: EditorMode;
  before: boolean;
  brushRadius: number; // בפיקסלים של המסך
  measure: { a: Pt; b: Pt } | null;
  /** מרובעים שניתן לערוך כרגע (פינות + גרירה): מישורים, פתחים, פרספקטיבה חופשית */
  editQuads?: EditQuad[];
  /** הדגשת חפצים קיימים (במצבי סימון חפצים) */
  showOccluders?: boolean;
  onSelect: (id: string | null) => void;
  onCheckpoint: () => void;
  onLayerChange: (id: string, fn: (l: Layer) => Layer) => void;
  onTap: (p: Pt) => void;
  onBrushEnd: (points: number[], radiusImg: number) => void;
  onMeasure: (m: { a: Pt; b: Pt }, done: boolean) => void;
  onQuadChange?: (key: string, quad: Pt[], done: boolean) => void;
  /** נקרא אחרי שמחווה על אובייקט הסתיימה (לחישוב מחדש של התאמת התאורה) */
  onObjectGestureEnd?: (id: string) => void;
};

type Drag =
  | { kind: 'move'; id: string; x0: number; y0: number; start: Pt }
  | { kind: 'handle'; id: string; w0: number; r0: number; c: Pt; start: Pt }
  | { kind: 'planeMove'; id: string; r0: NonNullable<ObjectLayer['planeRect']>; s0: Pt; quad: Pt[] }
  | { kind: 'planeScale'; id: string; r0: NonNullable<ObjectLayer['planeRect']>; quad: Pt[] }
  | { kind: 'quadCorner'; key: string; idx: number; q0: Pt[] }
  | { kind: 'quadMove'; key: string; q0: Pt[]; start: Pt }
  | { kind: 'corner'; id: string; idx: number }
  | { kind: 'surfaceMove'; id: string; q0: Pt[]; start: Pt }
  | { kind: 'brush' }
  | { kind: 'measure'; a: Pt }
  | null;

const HANDLE = 16; // רדיוס ידית במסך
const BRUSH_MODES: EditorMode[] = ['brush', 'hide', 'occluderBrush'];

export function EditorCanvas(p: Props) {
  const [size, setSize] = useState({ w: 1, h: 1 });
  const fit = Math.min(size.w / p.roomW, size.h / p.roomH);
  const ox = (size.w - p.roomW * fit) / 2;
  const oy = (size.h - p.roomH * fit) / 2;
  const drag = useRef<Drag>(null);
  const pinch = useRef<{ id: string; w0: number; rect0?: ObjectLayer['planeRect']; corners0?: Quad } | null>(null);
  const rot = useRef<{ id: string; r0: number } | null>(null);
  const [stroke, setStroke] = useState<number[] | null>(null);
  const strokeRef = useRef<number[]>([]);
  const propsRef = useRef(p);
  propsRef.current = p;
  const geo = useRef({ fit, ox, oy });
  geo.current = { fit, ox, oy };

  const toImg = (x: number, y: number): Pt => ({ x: (x - geo.current.ox) / geo.current.fit, y: (y - geo.current.oy) / geo.current.fit });

  const cornersOf = (l: ObjectLayer): Quad => {
    const P = propsRef.current;
    const ref = objectImageRef(P.products[l.productId]);
    const img = ref ? P.images[ref] : undefined;
    const pr = P.products[l.productId];
    const aspect = img ? img.height() / img.width() : pr?.cutoutW && pr.cutoutH ? pr.cutoutH / pr.cutoutW : 1;
    return objectCorners(l, aspect, P.planes);
  };
  const planeOf = (l: ObjectLayer) => propsRef.current.planes?.find((pl) => pl.id === l.planeId);

  const hitTest = (pt: Pt): Layer | null => {
    const { layers } = propsRef.current;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (l.kind === 'object' && pointInPoly(pt.x, pt.y, cornersOf(l))) return l;
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (l.kind === 'surface' && pointInPoly(pt.x, pt.y, l.quad)) return l;
    }
    return null;
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(3)
    .maxPointers(1)
    .onStart((e) => {
      const P = propsRef.current;
      const start = toImg(e.x - e.translationX, e.y - e.translationY);
      const hr = (HANDLE * 1.6) / geo.current.fit;
      drag.current = null;
      if (BRUSH_MODES.includes(P.mode)) {
        strokeRef.current = [start.x, start.y];
        setStroke([...strokeRef.current]);
        drag.current = { kind: 'brush' };
        return;
      }
      if (P.mode === 'measure') {
        drag.current = { kind: 'measure', a: start };
        P.onMeasure({ a: start, b: start }, false);
        return;
      }
      if (P.mode !== 'select') return;
      // מרובעים שבעריכה (מישורים, פתחים, פרספקטיבה חופשית)
      for (const eq of P.editQuads ?? []) {
        const idx = eq.quad.findIndex((q) => Math.hypot(q.x - start.x, q.y - start.y) < hr);
        if (idx >= 0) {
          P.onCheckpoint();
          drag.current = { kind: 'quadCorner', key: eq.key, idx, q0: eq.quad.map((q) => ({ ...q })) };
          return;
        }
      }
      for (const eq of P.editQuads ?? []) {
        if (pointInPoly(start.x, start.y, eq.quad)) {
          P.onCheckpoint();
          drag.current = { kind: 'quadMove', key: eq.key, q0: eq.quad.map((q) => ({ ...q })), start };
          return;
        }
      }
      const sel = P.layers.find((l) => l.id === P.selectedId);
      if (sel?.kind === 'surface') {
        const idx = sel.quad.findIndex((q) => Math.hypot(q.x - start.x, q.y - start.y) < hr);
        if (idx >= 0) {
          P.onCheckpoint();
          drag.current = { kind: 'corner', id: sel.id, idx };
          return;
        }
      }
      if (sel?.kind === 'object' && !sel.corners) {
        const q = cornersOf(sel);
        if (Math.hypot(q[2].x - start.x, q[2].y - start.y) < hr) {
          P.onCheckpoint();
          const plane = planeOf(sel);
          if (plane && sel.planeRect) drag.current = { kind: 'planeScale', id: sel.id, r0: { ...sel.planeRect }, quad: plane.quad };
          else drag.current = { kind: 'handle', id: sel.id, w0: sel.width, r0: sel.rotation, c: { x: sel.x, y: sel.y }, start };
          return;
        }
      }
      const hit = hitTest(start);
      if (!hit) return;
      if (hit.id !== P.selectedId) P.onSelect(hit.id);
      P.onCheckpoint();
      if (hit.kind === 'object') {
        const plane = planeOf(hit);
        if (plane && hit.planeRect) drag.current = { kind: 'planeMove', id: hit.id, r0: { ...hit.planeRect }, s0: imageToPlane(plane.quad, start), quad: plane.quad };
        else if (hit.corners) drag.current = { kind: 'quadMove', key: `obj:${hit.id}`, q0: hit.corners.map((q) => ({ ...q })), start };
        else drag.current = { kind: 'move', id: hit.id, x0: hit.x, y0: hit.y, start };
      } else drag.current = { kind: 'surfaceMove', id: hit.id, q0: hit.quad.map((q) => ({ ...q })), start };
    })
    .onUpdate((e) => {
      const P = propsRef.current;
      const d = drag.current;
      if (!d) return;
      const cur = toImg(e.x, e.y);
      switch (d.kind) {
        case 'brush':
          strokeRef.current.push(cur.x, cur.y);
          setStroke([...strokeRef.current]);
          break;
        case 'measure':
          P.onMeasure({ a: d.a, b: cur }, false);
          break;
        case 'move':
          P.onLayerChange(d.id, (l) => ({ ...(l as ObjectLayer), x: d.x0 + cur.x - d.start.x, y: d.y0 + cur.y - d.start.y }));
          break;
        case 'planeMove': {
          const pp = imageToPlane(d.quad, cur);
          P.onLayerChange(d.id, (l) => ({ ...(l as ObjectLayer), planeRect: { ...d.r0, u: d.r0.u + pp.x - d.s0.x, v: d.r0.v + pp.y - d.s0.y } }));
          break;
        }
        case 'planeScale': {
          const pp = imageToPlane(d.quad, cur);
          const k = Math.max(0.05, (pp.x - d.r0.u) / d.r0.w);
          P.onLayerChange(d.id, (l) => ({ ...(l as ObjectLayer), planeRect: { ...d.r0, w: d.r0.w * k, h: d.r0.h * k }, sizedFromDims: false }));
          break;
        }
        case 'handle': {
          const s0 = Math.hypot(d.start.x - d.c.x, d.start.y - d.c.y) || 1;
          const s1 = Math.hypot(cur.x - d.c.x, cur.y - d.c.y);
          const a0 = Math.atan2(d.start.y - d.c.y, d.start.x - d.c.x);
          const a1 = Math.atan2(cur.y - d.c.y, cur.x - d.c.x);
          P.onLayerChange(d.id, (l) => ({
            ...(l as ObjectLayer),
            width: Math.max(12, d.w0 * (s1 / s0)),
            rotation: Math.round((d.r0 + ((a1 - a0) * 180) / Math.PI) * 10) / 10,
            sizedFromDims: false,
          }));
          break;
        }
        case 'corner':
          P.onLayerChange(d.id, (l) => {
            const s = l as SurfaceLayer;
            return { ...s, quad: s.quad.map((q, i) => (i === d.idx ? { x: cur.x, y: cur.y } : q)) as SurfaceLayer['quad'] };
          });
          break;
        case 'surfaceMove':
          P.onLayerChange(d.id, (l) => ({
            ...(l as SurfaceLayer),
            quad: d.q0.map((q) => ({ x: q.x + cur.x - d.start.x, y: q.y + cur.y - d.start.y })) as SurfaceLayer['quad'],
          }));
          break;
        case 'quadCorner':
          P.onQuadChange?.(d.key, d.q0.map((q, i) => (i === d.idx ? cur : q)), false);
          break;
        case 'quadMove':
          P.onQuadChange?.(d.key, d.q0.map((q) => ({ x: q.x + cur.x - d.start.x, y: q.y + cur.y - d.start.y })), false);
          break;
      }
    })
    .onEnd((e) => {
      const P = propsRef.current;
      const d = drag.current;
      if (d?.kind === 'brush') {
        P.onBrushEnd(strokeRef.current, P.brushRadius / geo.current.fit);
        setStroke(null);
      } else if (d?.kind === 'measure') {
        P.onMeasure({ a: d.a, b: toImg(e.x, e.y) }, true);
      } else if (d?.kind === 'quadCorner' || d?.kind === 'quadMove') {
        const cur = toImg(e.x, e.y);
        const q = d.kind === 'quadCorner' ? d.q0.map((pt, i) => (i === d.idx ? cur : pt)) : d.q0.map((pt) => ({ x: pt.x + cur.x - d.start.x, y: pt.y + cur.y - d.start.y }));
        P.onQuadChange?.(d.key, q, true);
        if (d.key.startsWith('obj:')) P.onObjectGestureEnd?.(d.key.slice(4));
      } else if (d && 'id' in d && (d.kind === 'move' || d.kind === 'handle' || d.kind === 'planeMove' || d.kind === 'planeScale')) {
        P.onObjectGestureEnd?.(d.id);
      }
      drag.current = null;
    })
    .onFinalize(() => {
      if (drag.current?.kind === 'brush') setStroke(null);
      drag.current = null;
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(8)
    .onEnd((e, ok) => {
      if (!ok) return;
      const P = propsRef.current;
      const pt = toImg(e.x, e.y);
      if (P.mode === 'eyedropper' || P.mode === 'wand' || P.mode === 'occluderTap' || P.mode === 'planeTap') {
        if (pt.x >= 0 && pt.y >= 0 && pt.x <= P.roomW && pt.y <= P.roomH) P.onTap(pt);
        return;
      }
      if (BRUSH_MODES.includes(P.mode)) {
        P.onBrushEnd([pt.x, pt.y], P.brushRadius / geo.current.fit);
        return;
      }
      if (P.mode !== 'select') return;
      const hit = hitTest(pt);
      P.onSelect(hit ? hit.id : null);
    });

  const pinchG = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      const P = propsRef.current;
      const sel = P.layers.find((l) => l.id === P.selectedId);
      if (sel?.kind === 'object' && P.mode === 'select') {
        P.onCheckpoint();
        pinch.current = { id: sel.id, w0: sel.width, rect0: sel.planeRect ? { ...sel.planeRect } : undefined, corners0: sel.corners ? (sel.corners.map((c) => ({ ...c })) as Quad) : undefined };
      }
    })
    .onUpdate((e) => {
      const pc = pinch.current;
      if (!pc) return;
      propsRef.current.onLayerChange(pc.id, (l) => {
        const o = l as ObjectLayer;
        if (pc.rect0 && o.planeRect) {
          const r = pc.rect0;
          const w = r.w * e.scale;
          const h = r.h * e.scale;
          return { ...o, planeRect: { u: r.u + (r.w - w) / 2, v: r.v + (r.h - h), w, h }, sizedFromDims: false };
        }
        if (pc.corners0 && o.corners) {
          const c = pc.corners0.reduce((a, q) => ({ x: a.x + q.x / 4, y: a.y + q.y / 4 }), { x: 0, y: 0 });
          return { ...o, corners: pc.corners0.map((q) => ({ x: c.x + (q.x - c.x) * e.scale, y: c.y + (q.y - c.y) * e.scale })) as Quad };
        }
        return { ...o, width: Math.max(12, pc.w0 * e.scale), sizedFromDims: false };
      });
    })
    .onFinalize(() => {
      if (pinch.current) propsRef.current.onObjectGestureEnd?.(pinch.current.id);
      pinch.current = null;
    });

  const rotG = Gesture.Rotation()
    .runOnJS(true)
    .onStart(() => {
      const P = propsRef.current;
      const sel = P.layers.find((l) => l.id === P.selectedId);
      if (sel?.kind === 'object' && P.mode === 'select' && !sel.planeId && !sel.corners) rot.current = { id: sel.id, r0: sel.rotation };
    })
    .onUpdate((e) => {
      const rc = rot.current;
      if (!rc) return;
      propsRef.current.onLayerChange(rc.id, (l) => ({ ...(l as ObjectLayer), rotation: Math.round((rc.r0 + (e.rotation * 180) / Math.PI) * 10) / 10 }));
    })
    .onFinalize(() => {
      rot.current = null;
    });

  const gesture = Gesture.Simultaneous(Gesture.Exclusive(pan, tap), pinchG, rotG);

  const sel = p.layers.find((l) => l.id === p.selectedId);
  const k = 1 / fit;
  const selCorners = sel?.kind === 'object' ? cornersOf(sel) : null;

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.wrap} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} collapsable={false}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={[{ translateX: ox }, { translateY: oy }, { scale: fit }]}>
            <Composition
              room={p.room}
              roomW={p.roomW}
              roomH={p.roomH}
              layers={p.layers}
              ambient={p.ambient}
              products={p.products}
              images={p.images}
              planes={p.planes}
              occluders={p.occluders}
              before={p.before}
            />
            {p.showOccluders &&
              (p.occluders ?? []).map((o) => (
                <Group key={o.id} opacity={0.45}>
                  {o.mask && p.images[o.mask] && (
                    <Group layer>
                      <Image image={p.images[o.mask]} x={0} y={0} width={p.roomW} height={p.roomH} fit="fill" />
                      <Path path={polygonPath([{ x: 0, y: 0 }, { x: p.roomW, y: 0 }, { x: p.roomW, y: p.roomH }, { x: 0, y: p.roomH }])} color="#3FA7FF" blendMode="srcIn" />
                    </Group>
                  )}
                  {o.strokes.map((s, i) => (
                    <Path key={i} path={strokePath(s.points)} style="stroke" strokeWidth={s.radius * 2} strokeCap="round" strokeJoin="round" color="#3FA7FF" />
                  ))}
                </Group>
              ))}
            {!p.before && selCorners && !(sel?.kind === 'object' && sel.corners) && <ObjectOutline q={selCorners} k={k} handle />}
            {!p.before && sel?.kind === 'surface' && <QuadOutline quad={sel.quad} k={k} />}
            {(p.editQuads ?? []).map((eq) => (
              <QuadOutline key={eq.key} quad={eq.quad} k={k} color={eq.color} />
            ))}
            {stroke && (
              <Path
                path={strokePath(stroke)}
                style="stroke"
                strokeWidth={(p.brushRadius * 2) / fit}
                strokeCap="round"
                strokeJoin="round"
                color={p.mode === 'occluderBrush' ? 'rgba(63,167,255,0.55)' : p.mode === 'hide' ? 'rgba(165,50,43,0.5)' : 'rgba(231,179,90,0.55)'}
              />
            )}
            {p.measure && (
              <>
                <Line p1={vec(p.measure.a.x, p.measure.a.y)} p2={vec(p.measure.b.x, p.measure.b.y)} color={colors.selection} strokeWidth={3 * k} />
                <Circle cx={p.measure.a.x} cy={p.measure.a.y} r={7 * k} color={colors.selection} />
                <Circle cx={p.measure.b.x} cy={p.measure.b.y} r={7 * k} color={colors.selection} />
              </>
            )}
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}

function ObjectOutline({ q, k, handle }: { q: Quad; k: number; handle?: boolean }) {
  const hp = q[2];
  return (
    <>
      <Path path={polygonPath(q)} style="stroke" strokeWidth={2 * k} color={colors.selection}>
        <DashPathEffect intervals={[8 * k, 6 * k]} />
      </Path>
      {handle && (
        <>
          <Circle cx={hp.x} cy={hp.y} r={HANDLE * k} color="#FFFFFF" />
          <Circle cx={hp.x} cy={hp.y} r={HANDLE * k} color={colors.selection} style="stroke" strokeWidth={3 * k} />
          <Circle cx={hp.x} cy={hp.y} r={5 * k} color={colors.selection} />
        </>
      )}
    </>
  );
}

function QuadOutline({ quad, k, color = colors.selection }: { quad: Pt[]; k: number; color?: string }) {
  return (
    <>
      <Path path={polygonPath(quad)} style="stroke" strokeWidth={2 * k} color={color}>
        <DashPathEffect intervals={[10 * k, 6 * k]} />
      </Path>
      {quad.map((q, i) => (
        <React.Fragment key={i}>
          <Circle cx={q.x} cy={q.y} r={HANDLE * k} color="rgba(255,255,255,0.9)" />
          <Circle cx={q.x} cy={q.y} r={HANDLE * k} color={color} style="stroke" strokeWidth={3 * k} />
        </React.Fragment>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.canvasBg, ...LTR, overflow: 'hidden' },
});

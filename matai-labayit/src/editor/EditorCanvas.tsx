// קנבס העורך: מציג את ההדמיה ומטפל במחוות – גרירה, צביטה לשינוי גודל, סיבוב בשתי אצבעות,
// ידית פינה לגודל+סיבוב, גרירת פינות משטח, מברשת הגנה, קו ייחוס למידות, ונגיעה לדגימת צבע.
import { Canvas, Circle, DashPathEffect, Group, Line, Path, vec, type SkImage } from '@shopify/react-native-skia';
import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { hitRotatedRect, rotatePt } from '@/imaging/geometry';
import { pointInPoly } from '@/imaging/cutout';
import type { Ambient, Layer, ObjectLayer, Product, Pt, SurfaceLayer } from '@/model/types';
import { colors, LTR } from '@/theme';
import { Composition, objectImageRef, objectSize } from './Composition';
import { polygonPath, strokePath } from './paths';

export type EditorMode = 'select' | 'eyedropper' | 'wand' | 'brush' | 'measure';

type Props = {
  room: SkImage;
  roomW: number;
  roomH: number;
  layers: Layer[];
  ambient: Ambient;
  products: Record<string, Product>;
  images: Record<string, SkImage>;
  selectedId: string | null;
  mode: EditorMode;
  before: boolean;
  brushRadius: number; // בפיקסלים של המסך
  measure: { a: Pt; b: Pt } | null;
  onSelect: (id: string | null) => void;
  onCheckpoint: () => void;
  onLayerChange: (id: string, fn: (l: Layer) => Layer) => void;
  onTap: (p: Pt) => void;
  onBrushEnd: (points: number[], radiusImg: number) => void;
  onMeasure: (m: { a: Pt; b: Pt }, done: boolean) => void;
};

type Drag =
  | { kind: 'move'; id: string; x0: number; y0: number; start: Pt }
  | { kind: 'handle'; id: string; w0: number; r0: number; c: Pt; start: Pt }
  | { kind: 'corner'; id: string; idx: number }
  | { kind: 'quad'; id: string; q0: Pt[]; start: Pt }
  | { kind: 'brush' }
  | { kind: 'measure'; a: Pt }
  | null;

const HANDLE = 16; // רדיוס ידית במסך

export function EditorCanvas(p: Props) {
  const [size, setSize] = useState({ w: 1, h: 1 });
  const fit = Math.min(size.w / p.roomW, size.h / p.roomH);
  const ox = (size.w - p.roomW * fit) / 2;
  const oy = (size.h - p.roomH * fit) / 2;
  const drag = useRef<Drag>(null);
  const pinch = useRef<{ id: string; w0: number } | null>(null);
  const rot = useRef<{ id: string; r0: number } | null>(null);
  const [stroke, setStroke] = useState<number[] | null>(null);
  const strokeRef = useRef<number[]>([]);
  const propsRef = useRef(p);
  propsRef.current = p;
  const geo = useRef({ fit, ox, oy });
  geo.current = { fit, ox, oy };

  const toImg = (x: number, y: number): Pt => ({ x: (x - geo.current.ox) / geo.current.fit, y: (y - geo.current.oy) / geo.current.fit });

  const objGeom = (l: ObjectLayer) => {
    const ref = objectImageRef(propsRef.current.products[l.productId]);
    const img = ref ? propsRef.current.images[ref] : undefined;
    const { w, h } = objectSize(l, img);
    return { w: w * Math.cos((l.tiltY * Math.PI) / 180), h: h * Math.cos((l.tiltX * Math.PI) / 180) };
  };
  const handlePos = (l: ObjectLayer) => {
    const { w, h } = objGeom(l);
    const r = rotatePt(w / 2, h / 2, l.rotation);
    return { x: l.x + r.x, y: l.y + r.y };
  };

  const hitTest = (pt: Pt): Layer | null => {
    const { layers } = propsRef.current;
    const pad = 8 / geo.current.fit;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (l.kind !== 'object') continue;
      const { w, h } = objGeom(l);
      if (hitRotatedRect(pt.x, pt.y, l.x, l.y, w, h, l.rotation, pad)) return l;
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
      const hr = HANDLE * 1.6 / geo.current.fit;
      drag.current = null;
      if (P.mode === 'brush') {
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
      const sel = P.layers.find((l) => l.id === P.selectedId);
      if (sel?.kind === 'surface') {
        const idx = sel.quad.findIndex((q) => Math.hypot(q.x - start.x, q.y - start.y) < hr);
        if (idx >= 0) {
          P.onCheckpoint();
          drag.current = { kind: 'corner', id: sel.id, idx };
          return;
        }
      }
      if (sel?.kind === 'object') {
        const hp = handlePos(sel);
        if (Math.hypot(hp.x - start.x, hp.y - start.y) < hr) {
          P.onCheckpoint();
          drag.current = { kind: 'handle', id: sel.id, w0: sel.width, r0: sel.rotation, c: { x: sel.x, y: sel.y }, start };
          return;
        }
      }
      const hit = hitTest(start);
      if (!hit) return;
      if (hit.id !== P.selectedId) P.onSelect(hit.id);
      P.onCheckpoint();
      if (hit.kind === 'object') drag.current = { kind: 'move', id: hit.id, x0: hit.x, y0: hit.y, start };
      else drag.current = { kind: 'quad', id: hit.id, q0: hit.quad.map((q) => ({ ...q })), start };
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
            const quad = s.quad.map((q, i) => (i === d.idx ? { x: cur.x, y: cur.y } : q)) as SurfaceLayer['quad'];
            return { ...s, quad };
          });
          break;
        case 'quad':
          P.onLayerChange(d.id, (l) => ({
            ...(l as SurfaceLayer),
            quad: d.q0.map((q) => ({ x: q.x + cur.x - d.start.x, y: q.y + cur.y - d.start.y })) as SurfaceLayer['quad'],
          }));
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
      if (P.mode === 'eyedropper' || P.mode === 'wand') {
        if (pt.x >= 0 && pt.y >= 0 && pt.x <= P.roomW && pt.y <= P.roomH) P.onTap(pt);
        return;
      }
      if (P.mode === 'brush') {
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
        pinch.current = { id: sel.id, w0: sel.width };
      }
    })
    .onUpdate((e) => {
      const pc = pinch.current;
      if (!pc) return;
      propsRef.current.onLayerChange(pc.id, (l) => ({ ...(l as ObjectLayer), width: Math.max(12, pc.w0 * e.scale), sizedFromDims: false }));
    })
    .onFinalize(() => {
      pinch.current = null;
    });

  const rotG = Gesture.Rotation()
    .runOnJS(true)
    .onStart(() => {
      const P = propsRef.current;
      const sel = P.layers.find((l) => l.id === P.selectedId);
      if (sel?.kind === 'object' && P.mode === 'select') rot.current = { id: sel.id, r0: sel.rotation };
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

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.wrap} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} collapsable={false}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={[{ translateX: ox }, { translateY: oy }, { scale: fit }]}>
            <Composition room={p.room} roomW={p.roomW} roomH={p.roomH} layers={p.layers} ambient={p.ambient} products={p.products} images={p.images} before={p.before} />
            {!p.before && sel?.kind === 'object' && <ObjectOutline l={sel} geom={objGeom(sel)} k={k} />}
            {!p.before && sel?.kind === 'surface' && <QuadOutline l={sel} k={k} />}
            {stroke && <Path path={strokePath(stroke)} style="stroke" strokeWidth={(p.brushRadius * 2) / fit} strokeCap="round" strokeJoin="round" color="rgba(231,179,90,0.55)" />}
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

function ObjectOutline({ l, geom, k }: { l: ObjectLayer; geom: { w: number; h: number }; k: number }) {
  const { w, h } = geom;
  const corners = [
    rotatePt(-w / 2, -h / 2, l.rotation),
    rotatePt(w / 2, -h / 2, l.rotation),
    rotatePt(w / 2, h / 2, l.rotation),
    rotatePt(-w / 2, h / 2, l.rotation),
  ].map((c) => ({ x: c.x + l.x, y: c.y + l.y }));
  const path = polygonPath(corners);
  const hp = corners[2];
  return (
    <>
      <Path path={path} style="stroke" strokeWidth={2 * k} color={colors.selection}>
        <DashPathEffect intervals={[8 * k, 6 * k]} />
      </Path>
      <Circle cx={hp.x} cy={hp.y} r={HANDLE * k} color="#FFFFFF" />
      <Circle cx={hp.x} cy={hp.y} r={HANDLE * k} color={colors.selection} style="stroke" strokeWidth={3 * k} />
      <Circle cx={hp.x} cy={hp.y} r={5 * k} color={colors.selection} />
    </>
  );
}

function QuadOutline({ l, k }: { l: SurfaceLayer; k: number }) {
  const path = polygonPath(l.quad);
  return (
    <>
      <Path path={path} style="stroke" strokeWidth={2 * k} color={colors.selection}>
        <DashPathEffect intervals={[10 * k, 6 * k]} />
      </Path>
      {l.quad.map((q, i) => (
        <React.Fragment key={i}>
          <Circle cx={q.x} cy={q.y} r={HANDLE * k} color="rgba(255,255,255,0.9)" />
          <Circle cx={q.x} cy={q.y} r={HANDLE * k} color={colors.selection} style="stroke" strokeWidth={3 * k} />
        </React.Fragment>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.canvasBg, ...LTR, overflow: 'hidden' },
});

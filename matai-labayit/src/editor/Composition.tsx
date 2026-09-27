// הרכבת ההדמיה: תמונת החדר + משטחים (צבע/דוגמה) + אובייקטים (מוצרים) + תאורה.
// הרכיב "טהור" – כל התמונות נטענות מראש ומועברות פנימה, כך שאותו רכיב משמש
// לעורך, להשוואה ולייצוא ברזולוציה מלאה (drawAsImage).
import {
  BlendMode,
  BlurMask,
  Circle,
  ColorMatrix,
  Group,
  Image,
  ImageShader,
  Oval,
  Path,
  RadialGradient,
  Rect,
  Shadow,
  Skia,
  vec,
  type SkImage,
} from '@shopify/react-native-skia';
import React from 'react';
import { hexToRgb, TEMPERATURE_COLORS } from '@/imaging/color';
import { quadRectSize, rectToQuad } from '@/imaging/geometry';
import type { Ambient, Design, Layer, ObjectLayer, Product, SurfaceLayer } from '@/model/types';
import { polygonPath, strokePath } from './paths';
import { patternTile } from './patterns';

export type CompositionProps = {
  room: SkImage;
  roomW: number;
  roomH: number;
  layers: Layer[];
  ambient?: Ambient;
  products: Record<string, Product>;
  images: Record<string, SkImage>;
  /** הצגת "לפני" – תמונת החדר בלבד */
  before?: boolean;
};

const deg = (d: number) => (d * Math.PI) / 180;

/** תמונה שמייצגת אובייקט: החיתוך אם יש, אחרת התמונה המקורית. */
export const objectImageRef = (p?: Product) => p?.cutout ?? p?.photo;

export function designImageRefs(layers: Layer[], products: Record<string, Product>): string[] {
  const refs: string[] = [];
  for (const l of layers) {
    const p = l.productId ? products[l.productId] : undefined;
    if (l.kind === 'object') {
      const r = objectImageRef(p);
      if (r) refs.push(r);
    } else {
      if (p?.swatch) refs.push(p.swatch);
      if (l.regionMask) refs.push(l.regionMask);
    }
  }
  return refs;
}

export function objectSize(l: ObjectLayer, img?: SkImage) {
  const aspect = img ? img.height() / img.width() : 1;
  return { w: l.width, h: l.width * aspect };
}

// ---------- מטריצות צבע ----------
function adjustMatrix(b: number, c: number, warm: number): number[] {
  const k = 1 + c * 0.6;
  const t = (1 - k) / 2 + b * 0.22;
  return [
    k, 0, 0, 0, t + warm * 0.07,
    0, k, 0, 0, t + warm * 0.02,
    0, 0, k, 0, t - warm * 0.08,
    0, 0, 0, 1, 0,
  ];
}

/** צביעה "טבעית": הצבע החדש × (בהירות מקומית / בהירות ממוצעת) – שומר צללים ומרקם. */
function recolorMatrix(hex: string, baseLuma: number): number[] {
  const { r, g, b } = hexToRgb(hex);
  const L = Math.max(0.15, baseLuma);
  const row = (c: number) => [(c / 255) * 0.299 / L, (c / 255) * 0.587 / L, (c / 255) * 0.114 / L, 0, 0];
  return [...row(r), ...row(g), ...row(b), 0, 0, 0, 1, 0];
}

/** מפת הצללה אפורה (1 = בהירות ממוצעת) להכפלה מעל דוגמה. */
function shadingMatrix(baseLuma: number): number[] {
  const L = Math.max(0.15, baseLuma);
  const row = [0.299 / L, 0.587 / L, 0.114 / L, 0, 0];
  return [...row, ...row, ...row, 0, 0, 0, 1, 0];
}


function layerPaint(blend: BlendMode, opacity: number) {
  const paint = Skia.Paint();
  paint.setBlendMode(blend);
  paint.setAlphaf(Math.max(0, Math.min(1, opacity)));
  return paint;
}

// ---------- משטח ----------
const SurfaceView = ({ l, room, roomW, roomH, product, images }: { l: SurfaceLayer; room: SkImage; roomW: number; roomH: number; product?: Product; images: Record<string, SkImage> }) => {
  const clip = polygonPath(l.quad);
  const mask = l.regionMask ? images[l.regionMask] : undefined;
  const swatch = product?.swatch ? images[product.swatch] : undefined;
  let content: React.ReactNode;
  let blend = BlendMode.SrcOver;
  if (l.mode === 'pattern' && swatch) {
    const { W, H } = quadRectSize(l.quad);
    const m = Skia.Matrix(rectToQuad(W, H, l.quad));
    const tile = patternTile(swatch, l.pattern.layout, l.pattern.groutWidth, l.pattern.groutColor);
    const ts = Math.max(4, l.pattern.tileSize);
    const th = (ts * tile.height()) / tile.width();
    content = (
      <>
        <Group matrix={m}>
          <Rect x={-W} y={-H} width={W * 3} height={H * 3}>
            <ImageShader image={tile} tx="repeat" ty="repeat" fit="fill" rect={{ x: 0, y: 0, width: ts, height: th }} transform={[{ rotate: deg(l.pattern.rotation) }]} />
          </Rect>
        </Group>
        {l.pattern.shading > 0 && (
          <Image image={room} x={0} y={0} width={roomW} height={roomH} fit="fill" blendMode="multiply" opacity={l.pattern.shading}>
            <ColorMatrix matrix={shadingMatrix(l.baseLuma)} />
          </Image>
        )}
      </>
    );
  } else if (l.blend === 'natural') {
    content = (
      <Image image={room} x={0} y={0} width={roomW} height={roomH} fit="fill">
        <ColorMatrix matrix={recolorMatrix(l.color, l.baseLuma)} />
      </Image>
    );
  } else {
    content = <Rect x={0} y={0} width={roomW} height={roomH} color={l.color} />;
    if (l.blend === 'multiply') blend = BlendMode.Multiply;
  }
  return (
    <Group layer={layerPaint(blend, l.opacity)}>
      <Group clip={clip}>{content}</Group>
      {mask && <Image image={mask} x={0} y={0} width={roomW} height={roomH} fit="fill" blendMode="dstIn" />}
      {l.eraseStrokes.map((s, i) => (
        <Path key={i} path={strokePath(s.points)} style="stroke" strokeWidth={s.radius * 2} strokeCap="round" strokeJoin="round" color="black" blendMode="dstOut" />
      ))}
    </Group>
  );
};

// ---------- אובייקט ----------
const ObjectView = ({ l, img }: { l: ObjectLayer; img: SkImage }) => {
  const { w, h } = objectSize(l, img);
  const persp = Math.max(w, h) * 2.5;
  const transform = [
    { translateX: l.x },
    { translateY: l.y },
    { perspective: persp },
    { rotateX: deg(l.tiltX) },
    { rotateY: deg(l.tiltY) },
    { rotate: deg(l.rotation) },
    { scaleX: l.flipX ? -1 : 1 },
  ];
  const s = l.shadow;
  return (
    <Group transform={transform}>
      {s.contact > 0 && (
        <Oval x={-w * 0.46} y={h / 2 - h * 0.06} width={w * 0.92} height={Math.max(4, h * 0.1)} color={`rgba(0,0,0,${s.contact * 0.7})`}>
          <BlurMask blur={Math.max(2, w * 0.03)} style="normal" />
        </Oval>
      )}
      <Image image={img} x={-w / 2} y={-h / 2} width={w} height={h} fit="fill" opacity={l.opacity}>
        <ColorMatrix matrix={adjustMatrix(l.brightness, l.contrast, l.warmth)} />
        {s.opacity > 0 && <Shadow dx={s.dx} dy={s.dy} blur={s.blur} color={`rgba(0,0,0,${s.opacity})`} />}
      </Image>
    </Group>
  );
};

const LightGlow = ({ l, h }: { l: ObjectLayer; h: number }) => {
  const light = l.light!;
  const c = hexToRgb(TEMPERATURE_COLORS[light.temperature]);
  const cx = l.x;
  const cy = l.y + light.offsetY * h;
  const r = Math.max(10, light.radius);
  const a = Math.max(0, Math.min(1, light.intensity));
  return (
    <Circle cx={cx} cy={cy} r={r} blendMode="screen">
      <RadialGradient
        c={vec(cx, cy)}
        r={r}
        colors={[`rgba(${c.r},${c.g},${c.b},${a})`, `rgba(${c.r},${c.g},${c.b},${a * 0.35})`, `rgba(${c.r},${c.g},${c.b},0)`]}
        positions={[0, 0.35, 1]}
      />
    </Circle>
  );
};

const AmbientView = ({ a, w, h }: { a: Ambient; w: number; h: number }) => (
  <>
    {a.temperature !== 'none' && <Rect x={0} y={0} width={w} height={h} color={TEMPERATURE_COLORS[a.temperature]} opacity={0.35} blendMode="softLight" />}
    {a.brightness !== 0 && (
      <Rect x={0} y={0} width={w} height={h} color={a.brightness > 0 ? '#FFFFFF' : '#000000'} opacity={Math.abs(a.brightness) * 0.45} blendMode="softLight" />
    )}
  </>
);

const ORDER = { floor: 0, wall: 1, other: 2, ceiling: 3 } as const;

export function Composition({ room, roomW, roomH, layers, ambient, products, images, before }: CompositionProps) {
  const surfaces = layers.filter((l): l is SurfaceLayer => l.kind === 'surface').sort((a, b) => ORDER[a.target] - ORDER[b.target]);
  const objects = layers.filter((l): l is ObjectLayer => l.kind === 'object');
  return (
    <Group clip={{ x: 0, y: 0, width: roomW, height: roomH }}>
      <Image image={room} x={0} y={0} width={roomW} height={roomH} fit="fill" />
      {!before && (
        <>
          {surfaces.map((l) => (
            <SurfaceView key={l.id} l={l} room={room} roomW={roomW} roomH={roomH} product={l.productId ? products[l.productId] : undefined} images={images} />
          ))}
          {ambient && <AmbientView a={ambient} w={roomW} h={roomH} />}
          {objects.map((l) => {
            const ref = objectImageRef(products[l.productId]);
            const img = ref ? images[ref] : undefined;
            return img ? <ObjectView key={l.id} l={l} img={img} /> : null;
          })}
          {objects.map((l) => {
            if (!l.light?.enabled) return null;
            const ref = objectImageRef(products[l.productId]);
            const img = ref ? images[ref] : undefined;
            return <LightGlow key={`g-${l.id}`} l={l} h={objectSize(l, img).h} />;
          })}
        </>
      )}
    </Group>
  );
}

export type DesignLike = Pick<Design, 'layers' | 'ambient'>;

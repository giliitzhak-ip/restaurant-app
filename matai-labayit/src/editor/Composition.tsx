// הרכבת ההדמיה: תמונת החדר + משטחים (צבע/דוגמה) + מוצרים + תאורה.
// הרכיב "טהור" – כל התמונות נטענות מראש ומועברות פנימה, כך שאותו רכיב משמש
// לעורך, להשוואה ולייצוא ברזולוציה מלאה (drawAsImage).
//
// שכבות של כל מוצר (מלמטה למעלה):
//   צל מוקרן (צללית המוצר על הרצפה) → צל מגע → המוצר עצמו (התאמת תאורה, טשטוש וגרעיניות
//   לפי מחוון "נאמנות ↔ השתלבות", קפלים לווילון) → הסתרה ע"י חפצים קיימים שקרובים יותר למצלמה.
// המוצר מצויר תמיד מתוך הצילום המקורי שלו דרך הומוגרפיה – הצורה והפרטים לא משתנים.
import {
  BlendMode,
  Blur,
  BlurMask,
  Circle,
  ColorMatrix,
  FractalNoise,
  Group,
  Image,
  ImageShader,
  LinearGradient,
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
import { quadCentroid, quadRectSize, rectToQuad } from '@/imaging/geometry';
import { objectColorMatrix } from '@/imaging/harmonize';
import { categoryById } from '@/model/categories';
import type { Ambient, Design, Layer, ObjectLayer, Occluder, Plane, Product, Quad, Room, SurfaceLayer } from '@/model/types';
import { castShadowQuad, edgeLen, objectBottomY, objectCorners, objectDisplayWidth } from './objectGeometry';
import { polygonPath, strokePath } from './paths';
import { atlasCells, patternTile } from './patterns';

export type CompositionProps = {
  room: SkImage;
  roomW: number;
  roomH: number;
  layers: Layer[];
  ambient?: Ambient;
  products: Record<string, Product>;
  images: Record<string, SkImage>;
  planes?: Plane[];
  occluders?: Occluder[];
  /** הצגת "לפני" – תמונת החדר בלבד */
  before?: boolean;
  /** מסכת הגנה: רק צלליות המוצרים בלבן על שקוף (לשירות השתלבות AI – אסור לשנות אותם) */
  protect?: boolean;
};

const deg = (d: number) => (d * Math.PI) / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** תמונה שמייצגת אובייקט: החיתוך אם יש, אחרת התמונה המקורית. */
export const objectImageRef = (p?: Product) => p?.cutout ?? p?.photo;

export function designImageRefs(layers: Layer[], products: Record<string, Product>, room?: Pick<Room, 'occluders'>): string[] {
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
  room?.occluders?.forEach((o) => o.mask && refs.push(o.mask));
  return refs;
}

export function objectAspect(l: ObjectLayer, img?: SkImage, p?: Product) {
  if (img) return img.height() / img.width();
  if (p?.cutoutW && p.cutoutH) return p.cutoutH / p.cutoutW;
  return 1;
}

export function objectSize(l: ObjectLayer, img?: SkImage) {
  const aspect = img ? img.height() / img.width() : 1;
  return { w: l.width, h: l.width * aspect };
}

// ---------- מטריצות צבע ----------
/** צביעה "טבעית": הצבע החדש × (בהירות מקומית / בהירות ממוצעת) – שומר צללים ומרקם. */
function recolorMatrix(hex: string, baseLuma: number): number[] {
  const { r, g, b } = hexToRgb(hex);
  const L = Math.max(0.15, baseLuma);
  const row = (c: number) => [(c / 255) * 0.299 / L, (c / 255) * 0.587 / L, (c / 255) * 0.114 / L, 0, 0];
  return [...row(r), ...row(g), ...row(b), 0, 0, 0, 1, 0];
}

/**
 * מפת הצללה אפורה ל-hard light מעל דוגמה: 0.5 = בהירות ממוצעת של המשטח המקורי.
 * מתחת ל-0.5 – הכפלה (צללים), מעל – הבהרה (כתמי שמש/אור) שהכפלה רגילה לא יכולה ליצור.
 */
function shadingMatrix(baseLuma: number): number[] {
  const L = Math.max(0.15, baseLuma);
  const row = [0.5 * 0.299 / L, 0.5 * 0.587 / L, 0.5 * 0.114 / L, 0, 0];
  return [...row, ...row, ...row, 0, 0, 0, 1, 0];
}

/** צללית שחורה בשקיפות a (לצל מוקרן). */
const silhouetteMatrix = (a: number) => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, a, 0];

function layerPaint(blend: BlendMode, opacity: number) {
  const paint = Skia.Paint();
  paint.setBlendMode(blend);
  paint.setAlphaf(clamp01(opacity));
  return paint;
}

/** חפצים קיימים שמסתירים מה שמאחוריהם (לפי מיקום הבסיס שלהם בתמונה). */
const Occlusion = ({ occluders, images, roomW, roomH }: { occluders: Occluder[]; images: Record<string, SkImage>; roomW: number; roomH: number }) => (
  <>
    {occluders.map((o) => (
      <React.Fragment key={o.id}>
        {o.mask && images[o.mask] && (
          <Image image={images[o.mask]} x={0} y={0} width={roomW} height={roomH} fit="fill" blendMode="dstOut">
            <Blur blur={0.8} />
          </Image>
        )}
        {o.strokes.map((s, i) => (
          <Path key={i} path={strokePath(s.points)} style="stroke" strokeWidth={s.radius * 2} strokeCap="round" strokeJoin="round" color="black" blendMode="dstOut" />
        ))}
      </React.Fragment>
    ))}
  </>
);

// ---------- משטח ----------
const SurfaceView = ({ l, room, roomW, roomH, product, images, occluders }: { l: SurfaceLayer; room: SkImage; roomW: number; roomH: number; product?: Product; images: Record<string, SkImage>; occluders: Occluder[] }) => {
  const mask = l.regionMask ? images[l.regionMask] : undefined;
  // האזור המכוסה = המרובע ∩ מסכת הזיהוי. המרובע קובע גם את הפרספקטיבה (לרצפה פינותיו יכולות לצאת מהתמונה);
  // המסכה מוציאה חלונות, רהיטים ותקרה שהזיהוי הפריד.
  const clip = polygonPath(l.quad);
  const swatch = product?.swatch ? images[product.swatch] : undefined;
  let content: React.ReactNode;
  let blend = BlendMode.SrcOver;
  if (l.mode === 'pattern' && swatch) {
    const { W, H } = quadRectSize(l.quad);
    const hm = rectToQuad(W, H, l.quad);
    const m = Skia.Matrix(hm);
    const wAt = (u: number, v: number) => hm[6] * u + hm[7] * v + hm[8];
    const safe = (f: number) => [[-f, -f], [1 + f, -f], [1 + f, 1 + f], [-f, 1 + f]].every(([u, v]) => wAt(W * u, H * v) > 0.02);
    const pad = safe(0.02) ? 0.02 : 0;
    const variation = l.pattern.variation ?? 0;
    const tile = patternTile(swatch, l.pattern.layout, l.pattern.groutWidth, l.pattern.groutColor, variation);
    const { cx } = atlasCells(variation);
    const ts = Math.max(4, l.pattern.tileSize) * cx;
    const th = (ts * tile.height()) / tile.width();
    content = (
      <>
        <Group matrix={m}>
          {/* רק המרובע עצמו (+שוליים קטנים): מלבן שחוצה את קו האופק של המישור (w≤0) נמרח בציור עם פרספקטיבה */}
          <Rect x={-W * pad} y={-H * pad} width={W * (1 + 2 * pad)} height={H * (1 + 2 * pad)}>
            <ImageShader image={tile} tx="repeat" ty="repeat" fit="fill" rect={{ x: 0, y: 0, width: ts, height: th }} transform={[{ rotate: deg(l.pattern.rotation) }]} />
            {l.match && <ColorMatrix matrix={objectColorMatrix({ brightness: 0, contrast: 0, warmth: 0, harmonize: l.harmonize ?? 0.5, match: { gains: l.match.gains, contrast: 1 } })} />}
          </Rect>
        </Group>
        {l.pattern.shading > 0 && (
          // האור והצללים של החדר – מטושטשים מעט כדי שהמרקם הישן (פוגות אריחים, סיבי עץ) לא יבצבץ דרך החומר החדש
          <Image image={room} x={0} y={0} width={roomW} height={roomH} fit="fill" blendMode="hardLight" opacity={l.pattern.shading}>
            <ColorMatrix matrix={shadingMatrix(l.baseLuma)} />
            <Blur blur={Math.max(roomW, roomH) * 0.004} mode="clamp" />
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
      {mask && (
        // המסכה נשמרת ברזולוציית עבודה – ריכוך קל מונע "מדרגות" בשולי המשטח
        <Image image={mask} x={0} y={0} width={roomW} height={roomH} fit="fill" blendMode="dstIn">
          <Blur blur={Math.max(roomW, roomH) * 0.0012} mode="clamp" />
        </Image>
      )}
      {(l.openings ?? []).map((q, i) => (
        <Path key={`o${i}`} path={polygonPath(q)} color="black" blendMode="dstOut" />
      ))}
      {l.eraseStrokes.map((s, i) => (
        <Path key={i} path={strokePath(s.points)} style="stroke" strokeWidth={s.radius * 2} strokeCap="round" strokeJoin="round" color="black" blendMode="dstOut" />
      ))}
      {/* רהיטים קיימים שסומנו נשארים מעל הרצפה/הקיר החדשים */}
      <Occlusion occluders={occluders} images={images} roomW={roomW} roomH={roomH} />
    </Group>
  );
};

// ---------- אובייקט ----------
type ObjProps = { l: ObjectLayer; img: SkImage; product?: Product; planes?: Plane[]; occluders: Occluder[]; images: Record<string, SkImage>; roomW: number; roomH: number };

const ObjectView = ({ l, img, product, planes, occluders, images, roomW, roomH }: ObjProps) => {
  const iw = img.width();
  const ih = img.height();
  const q = objectCorners(l, ih / iw, planes);
  const M = Skia.Matrix(rectToQuad(iw, ih, q));
  const dispW = Math.max(1, objectDisplayWidth(q));
  const toLocal = iw / dispW; // פיקסל בחדר → יחידות תמונת המוצר
  const cat = product ? categoryById(product.category) : undefined;
  const s = l.shadow;
  const h = l.harmonize ?? 0.35;
  const blur = (l.match?.blur ?? 0) * h;
  const grain = (l.match?.grain ?? 0) * h;
  const standing = (l.placement === 'floor' || l.placement === 'table') && !cat?.liesFlat;
  const castQ = standing && (s.cast ?? 0) > 0 ? castShadowQuad(q, s.angle ?? -35, s.length ?? 0.45) : null;
  const b0 = q[3];
  const b1 = q[2];
  const baseW = edgeLen(b0, b1);
  const baseAng = Math.atan2(b1.y - b0.y, b1.x - b0.x);
  const bottom = objectBottomY(q);
  const hiders = l.occlusion === 'off' ? [] : occluders.filter((o) => o.bottomY > bottom + 2);
  const needsLayer = grain > 0.002 || (l.folds && l.folds.count > 0);
  return (
    <Group layer>
      {/* צל מוקרן: צללית המוצר "מונחת" על הרצפה */}
      {castQ && (
        <Group matrix={Skia.Matrix(rectToQuad(iw, ih, castQ))}>
          <Image image={img} x={0} y={0} width={iw} height={ih} fit="fill">
            <ColorMatrix matrix={silhouetteMatrix((s.cast ?? 0) * 0.55)} />
            <Blur blur={Math.max(2, s.blur * 1.6) * toLocal} />
          </Image>
        </Group>
      )}
      {/* צל מגע: כהה וצר, בדיוק בנקודות המגע */}
      {standing && s.contact > 0 && (
        <Group transform={[{ translateX: (b0.x + b1.x) / 2 }, { translateY: (b0.y + b1.y) / 2 }, { rotate: baseAng }]}>
          <Oval x={-baseW * 0.5} y={-baseW * 0.025} width={baseW} height={Math.max(3, baseW * 0.05)} color={`rgba(0,0,0,${s.contact * 0.75})`}>
            <BlurMask blur={Math.max(1.5, baseW * 0.012)} style="normal" />
          </Oval>
        </Group>
      )}
      <Group matrix={M}>
        <Group layer={needsLayer ? true : undefined}>
          <Image image={img} x={0} y={0} width={iw} height={ih} fit="fill" opacity={l.opacity}>
            <ColorMatrix matrix={objectColorMatrix(l)} />
            {blur > 0.05 && <Blur blur={blur * toLocal} />}
            {s.opacity > 0 && !standing && <Shadow dx={s.dx * toLocal} dy={s.dy * toLocal} blur={s.blur * toLocal} color={`rgba(0,0,0,${s.opacity})`} />}
          </Image>
          {l.folds && l.folds.count > 0 && (
            <Rect x={0} y={0} width={iw} height={ih} blendMode="multiply">
              <LinearGradient
                start={vec(0, 0)}
                end={vec(iw / l.folds.count, 0)}
                mode="repeat"
                colors={['#FFFFFF', `rgba(${Math.round(255 * (1 - l.folds.depth * 0.55))},${Math.round(255 * (1 - l.folds.depth * 0.55))},${Math.round(255 * (1 - l.folds.depth * 0.5))},1)`, '#FFFFFF']}
                positions={[0, 0.55, 1]}
              />
            </Rect>
          )}
          {grain > 0.002 && (
            <Rect x={0} y={0} width={iw} height={ih} blendMode="overlay" opacity={Math.min(0.7, grain * 14)}>
              <FractalNoise freqX={0.9 / toLocal} freqY={0.9 / toLocal} octaves={2} seed={3} />
            </Rect>
          )}
          {needsLayer && <Image image={img} x={0} y={0} width={iw} height={ih} fit="fill" blendMode="dstIn" />}
        </Group>
      </Group>
      {/* הסתרה: חפצים קיימים שקרובים יותר למצלמה, ומברשת הסתרה ידנית */}
      <Occlusion occluders={hiders} images={images} roomW={roomW} roomH={roomH} />
      {(l.hideStrokes ?? []).map((st, i) => (
        <Path key={i} path={strokePath(st.points)} style="stroke" strokeWidth={st.radius * 2} strokeCap="round" strokeJoin="round" color="black" blendMode="dstOut" />
      ))}
    </Group>
  );
};

const LightGlow = ({ l, q }: { l: ObjectLayer; q: Quad }) => {
  const light = l.light!;
  const c = hexToRgb(TEMPERATURE_COLORS[light.temperature]);
  const ctr = quadCentroid(q);
  const h = (edgeLen(q[0], q[3]) + edgeLen(q[1], q[2])) / 2;
  const cx = ctr.x;
  const cy = ctr.y + light.offsetY * h;
  const r = Math.max(10, light.radius);
  const a = clamp01(light.intensity);
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

export function Composition({ room, roomW, roomH, layers, ambient, products, images, planes, occluders = [], before, protect }: CompositionProps) {
  const surfaces = layers.filter((l): l is SurfaceLayer => l.kind === 'surface').sort((a, b) => ORDER[a.target] - ORDER[b.target]);
  // סדר הציור = סדר השכבות; חפצים קיימים בחדר מסתירים מוצרים לפי עומק
  const objects = layers.filter((l): l is ObjectLayer => l.kind === 'object');
  const withQ = objects
    .map((l) => {
      const p = products[l.productId];
      const ref = objectImageRef(p);
      const img = ref ? images[ref] : undefined;
      return { l, img, p, q: img ? objectCorners(l, img.height() / img.width(), planes) : null };
    })
    .filter((o) => o.img && o.q);
  if (protect) {
    return (
      <Group clip={{ x: 0, y: 0, width: roomW, height: roomH }}>
        {withQ.map(({ l, img, q }) => (
          <Group key={l.id} layer>
            <Group matrix={Skia.Matrix(rectToQuad(img!.width(), img!.height(), q!))}>
              <Image image={img!} x={0} y={0} width={img!.width()} height={img!.height()} fit="fill">
                <ColorMatrix matrix={[0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]} />
              </Image>
            </Group>
            <Occlusion occluders={l.occlusion === 'off' ? [] : occluders.filter((o) => o.bottomY > objectBottomY(q!) + 2)} images={images} roomW={roomW} roomH={roomH} />
          </Group>
        ))}
      </Group>
    );
  }
  return (
    <Group clip={{ x: 0, y: 0, width: roomW, height: roomH }}>
      <Image image={room} x={0} y={0} width={roomW} height={roomH} fit="fill" />
      {!before && (
        <>
          {surfaces.map((l) => (
            <SurfaceView key={l.id} l={l} room={room} roomW={roomW} roomH={roomH} product={l.productId ? products[l.productId] : undefined} images={images} occluders={occluders} />
          ))}
          {ambient && <AmbientView a={ambient} w={roomW} h={roomH} />}
          {withQ.map(({ l, img, p }) => (
            <ObjectView key={l.id} l={l} img={img!} product={p} planes={planes} occluders={occluders} images={images} roomW={roomW} roomH={roomH} />
          ))}
          {withQ.map(({ l, q }) => (l.light?.enabled ? <LightGlow key={`g-${l.id}`} l={l} q={q!} /> : null))}
        </>
      )}
    </Group>
  );
}

export type DesignLike = Pick<Design, 'layers' | 'ambient'>;

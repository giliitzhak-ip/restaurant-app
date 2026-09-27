// ייצוא: רינדור ההדמיה ברזולוציה מלאה (מחוץ למסך) לתמונה סופית, לפני/אחרי והשוואה.
import { drawAsImage, Group, Image, Rect, type SkImage } from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';
import React from 'react';
import { encode, loadSkImage, loadSkImageFromUri, resizeImage, saveSkImage } from '@/imaging/skiaImage';
import type { Design, ImageRef, Product, Room } from '@/model/types';
import { deleteImage } from '@/storage/imageStore';
import { getState, saveDesign } from '@/storage/db';
import { Composition, designImageRefs } from './Composition';

const LABELS = {
  watermark: require('../../assets/labels/watermark.png'),
  before: require('../../assets/labels/before.png'),
  after: require('../../assets/labels/after.png'),
  optionA: require('../../assets/labels/optionA.png'),
  optionB: require('../../assets/labels/optionB.png'),
  estimate: require('../../assets/labels/estimate.png'),
};
type LabelKey = keyof typeof LABELS;
const labelCache = new Map<LabelKey, SkImage>();

async function label(k: LabelKey): Promise<SkImage> {
  const hit = labelCache.get(k);
  if (hit) return hit;
  const a = Asset.fromModule(LABELS[k]);
  await a.downloadAsync();
  const img = await loadSkImageFromUri(a.localUri ?? a.uri);
  labelCache.set(k, img);
  return img;
}

export async function loadDesignImages(layers: Design['layers'], products: Record<string, Product>) {
  const refs = [...new Set(designImageRefs(layers, products))];
  const images: Record<string, SkImage> = {};
  await Promise.all(
    refs.map(async (r) => {
      try {
        images[r] = await loadSkImage(r);
      } catch {
        // תמונה חסרה – השכבה פשוט לא תוצג
      }
    }),
  );
  return images;
}

const needsEstimate = (room: Room, design: Pick<Design, 'layers'>, products: Record<string, Product>) =>
  design.layers.some((l) => l.kind === 'object' && !(room.scaleRef && products[l.productId]?.dims?.widthCm));

/** מיקום תווית בפינה, בגודל יחסי לתמונה. */
function Tag({ img, W, H, corner, rel = 0.045 }: { img: SkImage; W: number; H: number; corner: 'tl' | 'tr' | 'bl' | 'br'; rel?: number }) {
  const h = Math.max(18, Math.min(W, H) * rel);
  const w = (h * img.width()) / img.height();
  const m = h * 0.4;
  const x = corner.endsWith('l') ? m : W - w - m;
  const y = corner.startsWith('t') ? m : H - h - m;
  return <Image image={img} x={x} y={y} width={w} height={h} fit="fill" />;
}

async function renderOne(room: Room, design: Pick<Design, 'layers' | 'ambient'>, maxDim: number, opts: { before?: boolean; tag?: LabelKey; watermark?: boolean }) {
  const products = getState().products;
  const roomImg = await loadSkImage(room.photo);
  const images = await loadDesignImages(design.layers, products);
  const s = Math.min(1, maxDim / Math.max(room.photoW, room.photoH));
  const W = Math.round(room.photoW * s);
  const H = Math.round(room.photoH * s);
  const wm = opts.watermark ? await label('watermark') : null;
  const est = opts.watermark && !opts.before && needsEstimate(room, design, products) ? await label('estimate') : null;
  const tag = opts.tag ? await label(opts.tag) : null;
  const el = (
    <Group>
      <Group transform={[{ scale: s }]}>
        <Composition room={roomImg} roomW={room.photoW} roomH={room.photoH} layers={design.layers} ambient={design.ambient} products={products} images={images} before={opts.before} />
      </Group>
      {tag && <Tag img={tag} W={W} H={H} corner="tr" rel={0.06} />}
      {wm && <Tag img={wm} W={W} H={H} corner="bl" rel={0.04} />}
      {est && <Tag img={est} W={W} H={H} corner="br" rel={0.036} />}
    </Group>
  );
  const img = await drawAsImage(el, { width: W, height: H });
  if (!img) throw new Error('הרינדור נכשל');
  return img;
}

/** תמונה סופית לשיתוף (JPEG, base64). */
export async function exportFinal(room: Room, design: Design, maxDim = 2048): Promise<string> {
  const img = await renderOne(room, design, maxDim, { watermark: true });
  return encode(img, 'jpg', 90);
}

/** שתי תמונות זו לצד זו (או זו מעל זו לתמונות רחבות). */
async function combine(a: SkImage, b: SkImage): Promise<string> {
  const W = a.width();
  const H = a.height();
  const gap = Math.round(Math.max(W, H) * 0.012);
  const vertical = W > H; // תמונה רחבה – אחת מעל השנייה, כדי שיתאים למסך טלפון
  const TW = vertical ? W : W * 2 + gap;
  const TH = vertical ? H * 2 + gap : H;
  const el = (
    <Group>
      <Rect x={0} y={0} width={TW} height={TH} color="#F6F3EE" />
      {/* בעברית "א" מימין: במצב אופקי אפשרות א בצד ימין */}
      <Image image={a} x={vertical ? 0 : W + gap} y={0} width={W} height={H} fit="fill" />
      <Image image={b} x={0} y={vertical ? H + gap : 0} width={W} height={H} fit="fill" />
    </Group>
  );
  const img = await drawAsImage(el, { width: TW, height: TH });
  if (!img) throw new Error('הרינדור נכשל');
  return encode(img, 'jpg', 88);
}

export async function exportBeforeAfter(room: Room, design: Design, maxDim = 1400): Promise<string> {
  const before = await renderOne(room, design, maxDim, { before: true, tag: 'before' });
  const after = await renderOne(room, design, maxDim, { tag: 'after', watermark: true });
  return combine(before, after);
}

export async function exportComparison(room: Room, a: Design, b: Design, maxDim = 1400): Promise<string> {
  const ia = await renderOne(room, a, maxDim, { tag: 'optionA', watermark: true });
  const ib = await renderOne(room, b, maxDim, { tag: 'optionB', watermark: true });
  return combine(ia, ib);
}

/** תמונה ממוזערת לגרסה (לרשימות ולמסך הבית). */
export async function updateThumbnail(designId: string): Promise<void> {
  const st = getState();
  const d = st.designs[designId];
  const room = d ? st.rooms[d.roomId] : undefined;
  if (!d || !room) return;
  const img = await renderOne(room, d, 520, {});
  const old: ImageRef | undefined = d.thumbnail;
  const ref = await saveSkImage(resizeImage(img, img.width(), img.height()), 'jpg', 80);
  const fresh = getState().designs[designId];
  if (fresh) saveDesign({ ...fresh, thumbnail: ref });
  if (old) await deleteImage(old);
}

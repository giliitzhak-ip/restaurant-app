// יצירת שכבות חדשות עם ברירות מחדל חכמות לפי קטגוריה ומיקום.
import { categoryById } from '@/model/categories';
import type { ObjectLayer, Placement, Product, Room, SurfaceLayer } from '@/model/types';
import { defaultQuad, pxPerCm } from '@/imaging/geometry';
import { uid } from '@/utils/id';

const WIDTH_BY_CATEGORY: Record<string, number> = {
  furniture: 0.46,
  rug: 0.5,
  lighting: 0.16,
  curtains: 0.28,
  mirrorArt: 0.2,
  decor: 0.12,
  appliance: 0.24,
};

export function newObjectLayer(product: Product, room: Room, placement: Placement, aspect: number): ObjectLayer {
  const W = room.photoW;
  const H = room.photoH;
  const cat = categoryById(product.category);
  const ppc = pxPerCm(room.scaleRef);
  let width = W * (WIDTH_BY_CATEGORY[product.category] ?? 0.3);
  let sizedFromDims = false;
  if (ppc && product.dims?.widthCm) {
    width = product.dims.widthCm * ppc;
    sizedFromDims = true;
  }
  const h = width * aspect;
  let x = W / 2;
  let y = H / 2;
  switch (placement) {
    case 'wall':
      y = H * 0.38;
      break;
    case 'floor':
      y = Math.min(H * 0.92, H * 0.86) - (cat.liesFlat ? h * 0.3 : h / 2);
      break;
    case 'ceiling':
      y = H * 0.01 + h / 2;
      break;
    case 'table':
      y = H * 0.56 - h / 2;
      break;
  }
  const u = Math.max(W, H) / 1000; // יחידת צל יחסית לגודל התמונה
  const onFloor = placement === 'floor' || placement === 'table';
  return {
    kind: 'object',
    id: uid(),
    productId: product.id,
    placement,
    x,
    y,
    width,
    rotation: 0,
    flipX: false,
    tiltX: cat.liesFlat ? 58 : 0,
    tiltY: 0,
    opacity: 1,
    brightness: 0,
    contrast: 0,
    warmth: 0,
    shadow: {
      opacity: cat.liesFlat ? 0 : placement === 'ceiling' ? 0.12 : 0.28,
      blur: 10 * u,
      dx: placement === 'wall' ? 5 * u : 0,
      dy: placement === 'wall' ? 8 * u : 5 * u,
      contact: onFloor && !cat.liesFlat ? 0.55 : 0,
    },
    light: cat.emitsLight ? { enabled: true, temperature: 'warm', intensity: 0.55, radius: width * 1.6, offsetY: 0.25 } : undefined,
    sizedFromDims,
  };
}

export function surfaceTargetFor(placement: Placement): SurfaceLayer['target'] {
  return placement === 'wall' || placement === 'floor' || placement === 'ceiling' ? placement : 'other';
}

export function newSurfaceLayer(product: Product, room: Room, placement: Placement, baseLuma: number): SurfaceLayer {
  const target = surfaceTargetFor(placement);
  const W = room.photoW;
  const H = room.photoH;
  const cat = categoryById(product.category);
  const ppc = pxPerCm(room.scaleRef);
  const tileCm = product.dims?.widthCm;
  const tileSize = ppc && tileCm ? tileCm * ppc : W * (product.category === 'wallpaper' ? 0.16 : product.category === 'flooring' ? 0.18 : 0.08);
  return {
    kind: 'surface',
    id: uid(),
    productId: product.id,
    target,
    mode: cat.kind === 'paint' ? 'paint' : 'pattern',
    color: product.color ?? '#9DB29C',
    blend: 'natural',
    opacity: cat.kind === 'paint' ? 0.95 : 1,
    quad: defaultQuad(target, W, H),
    pattern: {
      tileSize,
      rotation: 0,
      layout: product.category === 'flooring' || product.category === 'wallCladding' ? 'brick' : 'straight',
      groutWidth: product.category === 'tiles' ? 0.02 : 0,
      groutColor: '#D9D4CB',
      shading: 0.85,
    },
    eraseStrokes: [],
    baseLuma,
  };
}

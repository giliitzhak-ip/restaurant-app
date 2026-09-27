// נתוני הדגמה – ניתנים להסרה בלחיצה (הגדרות ← נתוני הדגמה). כל הישויות מסומנות demo: true.
import { Asset } from 'expo-asset';
import { maskToPixels, regionGrow } from '@/imaging/cutout';
import { imageFromPixels, loadSkImageFromUri, readPixels, saveSkImage } from '@/imaging/skiaImage';
import type { Design, ObjectLayer, Product, Room, SurfaceLayer } from '@/model/types';
import { deleteDesign, deleteProduct, deleteRoom, getState, saveDesign, saveProduct, saveRoom } from '@/storage/db';
import { uid } from '@/utils/id';

const A = {
  room: require('../../assets/demo/room.jpg'),
  sofaStore: require('../../assets/demo/sofa-store.jpg'),
  sofaCut: require('../../assets/demo/sofa-cutout.png'),
  lampStore: require('../../assets/demo/lamp-store.jpg'),
  lampCut: require('../../assets/demo/lamp-cutout.png'),
  oak: require('../../assets/demo/oak-plank.jpg'),
  tile: require('../../assets/demo/cement-tile.jpg'),
};

async function importAsset(mod: number, fmt: 'jpg' | 'png') {
  const a = Asset.fromModule(mod);
  await a.downloadAsync();
  const img = await loadSkImageFromUri(a.localUri ?? a.uri);
  const ref = await saveSkImage(img, fmt, 88);
  return { ref, w: img.width(), h: img.height(), img };
}

export const hasDemo = () => Object.values(getState().rooms).some((r) => r.demo);

export async function loadDemo(): Promise<{ roomId: string; designId: string }> {
  const now = Date.now();
  const room = await importAsset(A.room, 'jpg');
  const roomId = uid();
  const r: Room = {
    id: roomId,
    name: 'סלון לדוגמה',
    photo: room.ref,
    photoW: room.w,
    photoH: room.h,
    dims: { widthCm: 420, lengthCm: 520, heightCm: 270 },
    // רוחב החלון בתמונה (380 פיקסלים) = 120 ס"מ
    scaleRef: { a: { x: 1060, y: 660 }, b: { x: 1440, y: 660 }, lengthCm: 120 },
    createdAt: now,
    updatedAt: now,
    demo: true,
  };
  saveRoom(r);

  const [sofaStore, sofaCut, lampStore, lampCut, oak, tile] = await Promise.all([
    importAsset(A.sofaStore, 'jpg'),
    importAsset(A.sofaCut, 'png'),
    importAsset(A.lampStore, 'jpg'),
    importAsset(A.lampCut, 'png'),
    importAsset(A.oak, 'jpg'),
    importAsset(A.tile, 'jpg'),
  ]);
  const base = { createdAt: now, updatedAt: now, demo: true, roomId } as const;
  const sofa: Product = {
    ...base, id: uid(), category: 'furniture', name: 'ספה דו-מושבית, קטיפה ירוקה', store: 'חנות לדוגמה', price: 4990,
    dims: { widthCm: 210, heightCm: 88, depthCm: 92 }, photo: sofaStore.ref, photoW: sofaStore.w, photoH: sofaStore.h,
    cutout: sofaCut.ref, cutoutW: sofaCut.w, cutoutH: sofaCut.h, favorite: true, inShoppingList: true, notes: 'לבדוק אפשרות לבד בגוון אפור',
  };
  const lamp: Product = {
    ...base, id: uid(), category: 'lighting', name: 'מנורת תלייה פליז', store: 'חנות תאורה לדוגמה', price: 890,
    dims: { widthCm: 45, heightCm: 30 }, photo: lampStore.ref, photoW: lampStore.w, photoH: lampStore.h,
    cutout: lampCut.ref, cutoutW: lampCut.w, cutoutH: lampCut.h, inShoppingList: true,
  };
  const sage: Product = { ...base, id: uid(), category: 'wallPaint', name: 'ירוק מרווה', store: 'צבעים לדוגמה', price: 320, color: '#9DB29C', favorite: true };
  const beige: Product = { ...base, id: uid(), category: 'wallPaint', name: 'בז׳ חם', store: 'צבעים לדוגמה', price: 290, color: '#D6C3A5' };
  const oakP: Product = {
    ...base, id: uid(), category: 'flooring', name: 'פרקט אלון טבעי', store: 'ריצוף לדוגמה', price: 189, notes: 'מחיר למ"ר',
    dims: { widthCm: 120, heightCm: 18 }, photo: oak.ref, photoW: oak.w, photoH: oak.h, swatch: oak.ref, swatchW: oak.w, swatchH: oak.h, inShoppingList: true,
  };
  const tileP: Product = {
    ...base, id: uid(), category: 'tiles', name: 'אריח מצויר 20×20', store: 'ריצוף לדוגמה', price: 245,
    dims: { widthCm: 20, heightCm: 20 }, photo: tile.ref, photoW: tile.w, photoH: tile.h, swatch: tile.ref, swatchW: tile.w, swatchH: tile.h,
  };
  [sofa, lamp, sage, beige, oakP, tileP].forEach(saveProduct);

  // זיהוי הקיר האחורי באלגוריתם המקומי (כמו שהמשתמש עושה ב"זיהוי לפי צבע")
  const px = readPixels(room.img, 640);
  const s = px.width / room.w;
  const grown = regionGrow(px, 800 * s, 250 * s, 0.3);
  const maskRef = await saveSkImage(imageFromPixels(maskToPixels(grown.mask)), 'png');
  const wallQuad: SurfaceLayer['quad'] = [{ x: 240, y: 0 }, { x: 1600, y: 0 }, { x: 1600, y: 772 }, { x: 240, y: 772 }];
  const wall = (color: string, productId: string): SurfaceLayer => ({
    kind: 'surface', id: uid(), productId, target: 'wall', mode: 'paint', color, blend: 'natural', opacity: 0.95, quad: wallQuad,
    pattern: { tileSize: 100, rotation: 0, layout: 'straight', groutWidth: 0, groutColor: '#D9D4CB', shading: 0.85 },
    regionMask: maskRef, baseLuma: grown.baseLuma,
    // "מברשת הגנה" על הזגוגית התחתונה של החלון – כדי שלא תיצבע
    eraseStrokes: [420, 480, 540, 600].map((y) => ({ points: [1090, y, 1410, y], radius: 34 })),
  });
  const ppc = 380 / 120;
  const sofaW = 210 * ppc * (sofaCut.w / 840); // החיתוך כולל שוליים קטנים סביב הספה
  const sofaL: ObjectLayer = {
    kind: 'object', id: uid(), productId: sofa.id, placement: 'floor', x: 700, y: 1010 - (sofaW * sofaCut.h) / sofaCut.w / 2,
    width: sofaW, rotation: 0, flipX: false, tiltX: 0, tiltY: 0, opacity: 1, brightness: -0.05, contrast: 0, warmth: 0.1,
    shadow: { opacity: 0.25, blur: 16, dx: 0, dy: 8, contact: 0.6 }, sizedFromDims: true,
  };
  const lampW = 45 * ppc * 1.35;
  const lampL: ObjectLayer = {
    kind: 'object', id: uid(), productId: lamp.id, placement: 'ceiling', x: 700, y: (lampW * lampCut.h) / lampCut.w / 2,
    width: lampW, rotation: 0, flipX: false, tiltX: 0, tiltY: 0, opacity: 1, brightness: 0, contrast: 0, warmth: 0,
    shadow: { opacity: 0.12, blur: 12, dx: 0, dy: 6, contact: 0 },
    light: { enabled: true, temperature: 'warm', intensity: 0.5, radius: 420, offsetY: 0.45 }, sizedFromDims: true,
  };
  const floor: SurfaceLayer = {
    kind: 'surface', id: uid(), productId: oakP.id, target: 'floor', mode: 'pattern', color: '#C9A57A', blend: 'natural', opacity: 1,
    // המרובע ממשיך את קווי הפרספקטיבה של החדר (נקודת מגוז ~900,500)
    quad: [{ x: 240, y: 790 }, { x: 1600, y: 790 }, { x: 2590, y: 1200 }, { x: -693, y: 1200 }],
    pattern: { tileSize: 420, rotation: 90, layout: 'brick', groutWidth: 0, groutColor: '#6B4F33', shading: 0.9 },
    eraseStrokes: [], baseLuma: 0.52,
  };
  const d1: Design = { id: uid(), roomId, name: 'אפשרות א – ירוק מרווה', layers: [wall(sage.color!, sage.id), sofaL, lampL], ambient: { temperature: 'none', brightness: 0 }, createdAt: now, updatedAt: now, demo: true, favorite: true };
  const d2: Design = {
    id: uid(), roomId, name: 'אפשרות ב – בז׳ ופרקט אלון',
    layers: [floor, wall(beige.color!, beige.id), { ...sofaL, id: uid() }, { ...lampL, id: uid(), light: { ...lampL.light!, temperature: 'neutral' } }],
    ambient: { temperature: 'warm', brightness: 0.05 }, createdAt: now + 1, updatedAt: now + 1, demo: true,
  };
  saveDesign(d1);
  saveDesign(d2);
  return { roomId, designId: d1.id };
}

export async function removeDemo() {
  const st = getState();
  for (const d of Object.values(st.designs)) if (d.demo) await deleteDesign(d.id);
  for (const p of Object.values(getState().products)) if (p.demo) await deleteProduct(p.id);
  for (const r of Object.values(getState().rooms)) if (r.demo) await deleteRoom(r.id);
}

// בניית צורות (Path) לציור ב-Skia.
import { Skia, type SkPath } from '@shopify/react-native-skia';
import type { Pt } from '@/model/types';

export function polygonPath(pts: Pt[]): SkPath {
  const b = Skia.PathBuilder.Make();
  if (!pts.length) return b.build();
  b.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) b.lineTo(pts[i].x, pts[i].y);
  b.close();
  return b.build();
}

/** קו פתוח מנקודות [x0,y0,x1,y1,...] (למשיכות מברשת). */
export function strokePath(points: number[]): SkPath {
  const b = Skia.PathBuilder.Make();
  if (points.length < 2) return b.build();
  b.moveTo(points[0], points[1]);
  if (points.length === 2) b.lineTo(points[0] + 0.1, points[1]);
  for (let i = 2; i < points.length; i += 2) b.lineTo(points[i], points[i + 1]);
  return b.build();
}

/** מלבן חיצוני עם "חור" – להכהיית האזור שמחוץ לבחירה. */
export function frameOutside(W: number, H: number, r: { x: number; y: number; w: number; h: number }): SkPath {
  return Skia.PathBuilder.Make().addRect(Skia.XYWHRect(0, 0, W, H)).addRect(Skia.XYWHRect(r.x, r.y, r.w, r.h)).build();
}

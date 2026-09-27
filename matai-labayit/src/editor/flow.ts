// מעבר מזרימת הוספת מוצר אל העורך – כולל יצירת גרסה חדשה להשוואה אם נבחר.
import { router } from 'expo-router';
import type { Design, Placement } from '@/model/types';
import { designsForRoom, getState, saveDesign } from '@/storage/db';
import { uid } from '@/utils/id';

export function nextVersionName(roomId: string) {
  return `אפשרות ${designsForRoom(getState(), roomId).length + 1}`;
}

/** שכפול גרסה – העבודה הקודמת נשמרת כפי שהיא. */
export function duplicateDesign(designId: string, name?: string): Design | null {
  const d = getState().designs[designId];
  if (!d) return null;
  const now = Date.now();
  const copy: Design = {
    ...d,
    id: uid(),
    name: name ?? nextVersionName(d.roomId),
    layers: d.layers.map((l) => ({ ...l, id: uid() })),
    thumbnail: undefined,
    favorite: false,
    demo: false,
    createdAt: now,
    updatedAt: now,
  };
  saveDesign(copy);
  return copy;
}

export function openEditorWithProduct(opts: { designId: string; productId: string; placement: Placement; target: 'current' | 'new'; fromEditor?: boolean }) {
  let designId = opts.designId;
  if (opts.target === 'new') {
    const copy = duplicateDesign(opts.designId);
    if (copy) designId = copy.id;
  }
  const params = { designId, add: opts.productId, placement: opts.placement };
  if (opts.fromEditor && opts.target === 'current') {
    // חוזרים לעורך שכבר פתוח
    router.dismissTo({ pathname: '/editor/[designId]', params });
    return;
  }
  // מנקים את מסכי הצילום מהמחסנית: בית ← חדר ← עורך
  const roomId = getState().designs[designId]?.roomId;
  if (router.canDismiss()) router.dismissAll();
  if (roomId) router.push({ pathname: '/room/[roomId]', params: { roomId } });
  router.push({ pathname: '/editor/[designId]', params });
}

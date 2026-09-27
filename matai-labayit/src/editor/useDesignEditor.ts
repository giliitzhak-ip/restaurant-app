// מצב העורך: שכבות, בחירה, ביטול/ביצוע מחדש ושמירה אוטומטית רציפה.
// כל שינוי נשמר מקומית תוך פחות משנייה, ובמעבר לרקע – מיידית (ראו db.ts),
// כך שסגירה פתאומית של האפליקציה לא מאבדת עבודה.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ambient, Design, Layer } from '@/model/types';
import { getState, saveDesign } from '@/storage/db';

type Snapshot = { layers: Layer[]; ambient: Ambient };
const MAX_HISTORY = 60;

export function useDesignEditor(designId: string) {
  const initial = getState().designs[designId];
  const [snap, setSnap] = useState<Snapshot>(() => ({
    layers: initial?.layers ?? [],
    ambient: initial?.ambient ?? { temperature: 'none', brightness: 0 },
  }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const [, force] = useState(0);
  const latest = useRef(snap);
  latest.current = snap;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (!dirty.current) return;
    const d = getState().designs[designId];
    if (!d) return;
    saveDesign({ ...d, layers: latest.current.layers, ambient: latest.current.ambient });
    dirty.current = false;
  }, [designId]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 350);
  }, [persist]);

  // שמירה ביציאה מהעורך
  useEffect(() => () => persist(), [persist]);

  /** נקודת שמירה בהיסטוריה (לפני מחווה/שינוי). */
  const checkpoint = useCallback(() => {
    past.current.push(latest.current);
    if (past.current.length > MAX_HISTORY) past.current.shift();
    future.current = [];
    force((n) => n + 1);
  }, []);

  /** שינוי חי (בלי נקודת היסטוריה) – למחוות ולמחוונים. */
  const mutate = useCallback(
    (fn: (s: Snapshot) => Snapshot) => {
      setSnap((s) => {
        const next = fn(s);
        latest.current = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  /** שינוי בודד עם נקודת היסטוריה. */
  const commit = useCallback(
    (fn: (s: Snapshot) => Snapshot) => {
      checkpoint();
      mutate(fn);
    },
    [checkpoint, mutate],
  );

  const updateLayer = useCallback(
    (id: string, patch: Partial<Layer> | ((l: Layer) => Layer), withHistory = false) => {
      const apply = (s: Snapshot): Snapshot => ({
        ...s,
        layers: s.layers.map((l) => (l.id === id ? (typeof patch === 'function' ? patch(l) : ({ ...l, ...patch } as Layer)) : l)),
      });
      (withHistory ? commit : mutate)(apply);
    },
    [commit, mutate],
  );

  const addLayer = useCallback(
    (layer: Layer) => {
      commit((s) => ({ ...s, layers: [...s.layers, layer] }));
      setSelectedId(layer.id);
    },
    [commit],
  );

  const removeLayer = useCallback(
    (id: string) => {
      commit((s) => ({ ...s, layers: s.layers.filter((l) => l.id !== id) }));
      setSelectedId(null);
    },
    [commit],
  );

  const reorder = useCallback(
    (id: string, dir: 1 | -1) => {
      commit((s) => {
        const i = s.layers.findIndex((l) => l.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= s.layers.length) return s;
        const layers = [...s.layers];
        [layers[i], layers[j]] = [layers[j], layers[i]];
        return { ...s, layers };
      });
    },
    [commit],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(latest.current);
    latest.current = prev;
    setSnap(prev);
    scheduleSave();
    if (selectedId && !prev.layers.some((l) => l.id === selectedId)) setSelectedId(null);
  }, [scheduleSave, selectedId]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(latest.current);
    latest.current = next;
    setSnap(next);
    scheduleSave();
  }, [scheduleSave]);

  const selected = snap.layers.find((l) => l.id === selectedId) ?? null;

  return {
    layers: snap.layers,
    ambient: snap.ambient,
    selected,
    selectedId,
    setSelectedId,
    checkpoint,
    mutate,
    commit,
    updateLayer,
    addLayer,
    removeLayer,
    reorder,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    flush: persist,
    setAmbient: (a: Ambient, withHistory = false) => (withHistory ? commit : mutate)((s) => ({ ...s, ambient: a })),
  };
}

export type DesignEditor = ReturnType<typeof useDesignEditor>;
export type { Design };

// תצוגה מקדימה אחרי צילום/בחירה: סיבוב, חיתוך, החלפה ובדיקת איכות – לפני שממשיכים לעיבוד.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analyzePhoto, type QualityIssue } from '@/imaging/quality';
import { forgetSkImage } from '@/imaging/skiaImage';
import { cropPhoto, rotatePhoto, type ImportedPhoto } from '@/services/media';
import { colors, LTR, radius, ROW, rtl, space, type } from '@/theme';
import { StoredImage } from './StoredImage';
import { Button, Icon, IconButton } from './ui';

type Props = {
  photo: ImportedPhoto | null;
  kind: 'room' | 'product' | 'swatch';
  title: string;
  onConfirm: (p: ImportedPhoto, issues: QualityIssue[]) => void;
  onReplace: (source: 'camera' | 'library') => void;
  onCancel: () => void;
  onChange: (p: ImportedPhoto) => void;
};

type R = { x: number; y: number; w: number; h: number };

export function PhotoReview({ photo, kind, title, onConfirm, onReplace, onCancel, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<string | null>(null);
  const [issues, setIssues] = useState<QualityIssue[] | null>(null);
  const [crop, setCrop] = useState<R | null>(null);
  const [box, setBox] = useState({ w: 1, h: 1 });

  useEffect(() => {
    setIssues(null);
    setCrop(null);
    if (!photo) return;
    let alive = true;
    analyzePhoto(photo.ref, kind, { w: photo.width, h: photo.height })
      .then((r) => alive && setIssues(r))
      .catch(() => alive && setIssues([]));
    return () => {
      alive = false;
    };
  }, [photo?.ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const W = photo?.width ?? 1;
  const H = photo?.height ?? 1;
  const fit = Math.min(box.w / W, box.h / H);
  const ox = (box.w - W * fit) / 2;
  const oy = (box.h - H * fit) / 2;
  const geo = useRef({ fit, ox, oy, crop });
  geo.current = { fit, ox, oy, crop };
  const drag = useRef<{ idx: number; r0: R } | null>(null);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(1)
    .onStart((e) => {
      const g = geo.current;
      if (!g.crop) return;
      const x = (e.x - e.translationX - g.ox) / g.fit;
      const y = (e.y - e.translationY - g.oy) / g.fit;
      const r = g.crop;
      const pts = [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x + r.w, r.y + r.h],
        [r.x, r.y + r.h],
      ];
      const idx = pts.findIndex(([px, py]) => Math.hypot(px - x, py - y) < 36 / g.fit);
      drag.current = { idx, r0: r };
    })
    .onUpdate((e) => {
      const d = drag.current;
      const g = geo.current;
      if (!d) return;
      const dx = e.translationX / g.fit;
      const dy = e.translationY / g.fit;
      const r = d.r0;
      let x0 = r.x;
      let y0 = r.y;
      let x1 = r.x + r.w;
      let y1 = r.y + r.h;
      if (d.idx < 0) {
        const nx = Math.max(0, Math.min(W - r.w, r.x + dx));
        const ny = Math.max(0, Math.min(H - r.h, r.y + dy));
        setCrop({ ...r, x: nx, y: ny });
        return;
      }
      if (d.idx === 0 || d.idx === 3) x0 = r.x + dx;
      else x1 = r.x + r.w + dx;
      if (d.idx === 0 || d.idx === 1) y0 = r.y + dy;
      else y1 = r.y + r.h + dy;
      x0 = Math.max(0, Math.min(x0, x1 - 40));
      y0 = Math.max(0, Math.min(y0, y1 - 40));
      x1 = Math.min(W, Math.max(x1, x0 + 40));
      y1 = Math.min(H, Math.max(y1, y0 + 40));
      setCrop({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    })
    .onEnd(() => {
      drag.current = null;
    });

  const run = async (label: string, fn: () => Promise<ImportedPhoto>) => {
    if (!photo) return;
    setBusy(label);
    try {
      const old = photo.ref;
      const p = await fn();
      forgetSkImage(old);
      onChange(p);
    } catch (e) {
      setIssues([{ code: 'err', severity: 'warn', message: (e as Error).message, tip: 'נסו שוב או בחרו תמונה אחרת.' }]);
    } finally {
      setBusy(null);
    }
  };

  const warn = issues?.filter((i) => i.severity === 'warn') ?? [];

  return (
    <Modal visible={!!photo} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.root, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.head}>
          <IconButton dark icon="close" label="ביטול" onPress={onCancel} />
          <Text style={[styles.title, rtl]} numberOfLines={1}>
            {crop ? 'גררו את הפינות לחיתוך' : title}
          </Text>
        </View>
        <GestureDetector gesture={pan}>
          <View style={[styles.stage, LTR]} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} collapsable={false}>
            {photo && (
              <StoredImage refId={photo.ref} style={{ position: 'absolute', left: ox, top: oy, width: W * fit, height: H * fit }} resizeMode="stretch" label="התמונה שצולמה" />
            )}
            {crop && (
              <>
                <View pointerEvents="none" style={[styles.shade, { left: ox, top: oy, width: W * fit, height: crop.y * fit }]} />
                <View pointerEvents="none" style={[styles.shade, { left: ox, top: oy + (crop.y + crop.h) * fit, width: W * fit, height: (H - crop.y - crop.h) * fit }]} />
                <View pointerEvents="none" style={[styles.shade, { left: ox, top: oy + crop.y * fit, width: crop.x * fit, height: crop.h * fit }]} />
                <View pointerEvents="none" style={[styles.shade, { left: ox + (crop.x + crop.w) * fit, top: oy + crop.y * fit, width: (W - crop.x - crop.w) * fit, height: crop.h * fit }]} />
                <View pointerEvents="none" style={[styles.cropBox, { left: ox + crop.x * fit, top: oy + crop.y * fit, width: crop.w * fit, height: crop.h * fit }]} />
                {[
                  [crop.x, crop.y],
                  [crop.x + crop.w, crop.y],
                  [crop.x + crop.w, crop.y + crop.h],
                  [crop.x, crop.y + crop.h],
                ].map(([x, y], i) => (
                  <View key={i} pointerEvents="none" style={[styles.handle, { left: ox + x * fit - 12, top: oy + y * fit - 12 }]} />
                ))}
              </>
            )}
            {busy && (
              <View style={styles.busy}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={{ color: '#fff', fontWeight: '700' }}>{busy}</Text>
              </View>
            )}
          </View>
        </GestureDetector>

        <View style={styles.panel}>
          {crop ? (
            <View style={styles.row}>
              <Button label="ביטול חיתוך" variant="secondary" onPress={() => setCrop(null)} style={{ flex: 1 }} />
              <Button
                label="החלת חיתוך"
                icon="check"
                onPress={() => {
                  const r = crop;
                  setCrop(null);
                  run('חותכים…', () => cropPhoto(photo!, r));
                }}
                style={{ flex: 1 }}
                testID="apply-crop"
              />
            </View>
          ) : (
            <>
              <View style={styles.tools}>
                <IconButton showLabel icon="rotate-left" label="סיבוב שמאלה" onPress={() => run('מסובבים…', () => rotatePhoto(photo!, -90))} testID="rotate-left" />
                <IconButton showLabel icon="rotate-right" label="סיבוב ימינה" onPress={() => run('מסובבים…', () => rotatePhoto(photo!, 90))} testID="rotate-right" />
                <IconButton showLabel icon="crop" label="חיתוך" onPress={() => setCrop({ x: W * 0.08, y: H * 0.08, w: W * 0.84, h: H * 0.84 })} testID="crop" />
                <IconButton showLabel icon="camera-outline" label="צילום מחדש" onPress={() => onReplace('camera')} />
                <IconButton showLabel icon="image-outline" label="תמונה אחרת" onPress={() => onReplace('library')} testID="replace-library" />
              </View>
              {issues === null ? (
                <Text style={[type.small, rtl]}>בודקים את איכות התמונה…</Text>
              ) : warn.length ? (
                <View style={styles.issues} accessibilityRole="alert">
                  {warn.slice(0, 2).map((i) => (
                    <View key={i.code} style={styles.issue}>
                      <Icon name="alert-outline" color={colors.warning} size={18} />
                      <Text style={[type.small, rtl, { flex: 1, color: colors.ink }]}>
                        <Text style={{ fontWeight: '700' }}>{i.message}. </Text>
                        {i.tip}
                      </Text>
                    </View>
                  ))}
                  <Text style={[type.tiny, rtl]}>אפשר להמשיך בכל זאת – ותמיד לתקן ידנית בעורך.</Text>
                </View>
              ) : (
                <View style={styles.issue}>
                  <Icon name="check" color={colors.success} size={18} />
                  <Text style={[type.small, rtl, { flex: 1 }]}>התמונה נראית טובה לעיבוד.</Text>
                </View>
              )}
              <Button label="המשך" icon="check" size="lg" onPress={() => photo && onConfirm(photo, issues ?? [])} disabled={!!busy} testID="review-confirm" />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasBg },
  head: { flexDirection: ROW, alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm },
  title: { flex: 1, color: '#F4F1EA', fontSize: 17, fontWeight: '700' },
  stage: { flex: 1, margin: space.sm, overflow: 'hidden' },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  cropBox: { position: 'absolute', borderWidth: 2, borderColor: colors.selection },
  handle: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 3, borderColor: colors.selection },
  busy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, marginHorizontal: space.sm, padding: space.md, gap: space.md },
  tools: { flexDirection: ROW, justifyContent: 'space-between' },
  row: { flexDirection: ROW, gap: space.sm },
  issues: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: space.sm, gap: 6 },
  issue: { flexDirection: ROW, gap: space.sm, alignItems: 'flex-start' },
});

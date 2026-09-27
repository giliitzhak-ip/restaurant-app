// דיאלוגים והודעות קצרות (Toast) – אחידים בכל הפלטפורמות, בעברית ונגישים.
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import { Button } from './ui';

type DialogButton = { label: string; style?: 'primary' | 'secondary' | 'danger'; value: string };
type DialogReq = { title: string; message?: string; buttons: DialogButton[]; resolve: (v: string | null) => void };

type Ctx = {
  ask: (title: string, message: string | undefined, buttons: DialogButton[]) => Promise<string | null>;
  confirm: (title: string, message?: string, okLabel?: string, danger?: boolean) => Promise<boolean>;
  toast: (text: string, kind?: 'info' | 'error' | 'success') => void;
};

const FeedbackCtx = createContext<Ctx | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogReq | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; kind: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ask = useCallback<Ctx['ask']>(
    (title, message, buttons) => new Promise((resolve) => setDialog({ title, message, buttons, resolve })),
    [],
  );
  const confirm = useCallback<Ctx['confirm']>(
    async (title, message, okLabel = 'אישור', danger) =>
      (await ask(title, message, [
        { label: 'ביטול', style: 'secondary', value: 'cancel' },
        { label: okLabel, style: danger ? 'danger' : 'primary', value: 'ok' },
      ])) === 'ok',
    [ask],
  );
  const toast = useCallback<Ctx['toast']>((text, kind = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToastMsg({ text, kind });
    timer.current = setTimeout(() => setToastMsg(null), kind === 'error' ? 5000 : 2600);
  }, []);

  const close = (v: string | null) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <FeedbackCtx.Provider value={{ ask, confirm, toast }}>
      {children}
      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => close(null)}>
        <Pressable style={styles.backdrop} onPress={() => close(null)} accessibilityLabel="סגירה">
          <Pressable style={styles.dialog} onPress={() => undefined} accessibilityViewIsModal>
            <Text style={[type.heading, styles.rtl]} accessibilityRole="header">
              {dialog?.title}
            </Text>
            {dialog?.message ? <Text style={[type.body, styles.rtl, { color: colors.inkSoft }]}>{dialog.message}</Text> : null}
            <View style={styles.buttons}>
              {dialog?.buttons.map((b) => (
                <Button key={b.value} label={b.label} variant={b.style ?? 'primary'} onPress={() => close(b.value)} style={{ flexGrow: 1 }} />
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {toastMsg && (
        <View pointerEvents="none" style={styles.toastWrap}>
          <View
            style={[styles.toast, toastMsg.kind === 'error' && { backgroundColor: colors.danger }, toastMsg.kind === 'success' && { backgroundColor: colors.success }]}
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
          >
            <Text style={styles.toastText}>{toastMsg.text}</Text>
          </View>
        </View>
      )}
    </FeedbackCtx.Provider>
  );
}

export const useFeedback = () => {
  const c = useContext(FeedbackCtx);
  if (!c) throw new Error('FeedbackProvider missing');
  return c;
};

const styles = StyleSheet.create({
  rtl,
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.xl },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.md, maxWidth: 460, width: '100%', alignSelf: 'center' },
  buttons: { flexDirection: ROW, flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  toastWrap: { position: 'absolute', bottom: 96, left: 16, right: 16, alignItems: 'center' },
  toast: { backgroundColor: colors.ink, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.md, maxWidth: 480 },
  toastText: { color: '#fff', fontSize: 15, textAlign: 'center', writingDirection: 'rtl' },
});

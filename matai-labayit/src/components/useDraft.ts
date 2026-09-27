// טיוטה שנשמרת אוטומטית (למשל באמצע יצירת חדר או צילום מוצר),
// כך ששיחה נכנסת או סגירת האפליקציה לא מוחקות את מה שכבר צולם.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const PREFIX = 'matai/v1/draft/';

export function useDraft<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, { restored: boolean; clear: () => Promise<void> }] {
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  const latest = useRef(value);
  latest.current = value;
  const loaded = useRef(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PREFIX + key)
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          try {
            setValue({ ...initial, ...JSON.parse(raw) });
            setRestored(true);
          } catch {
            // טיוטה פגומה – מתעלמים
          }
        }
      })
      .finally(() => (loaded.current = true));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => AsyncStorage.setItem(PREFIX + key, JSON.stringify(latest.current)).catch(() => undefined), 200);
    return () => clearTimeout(t);
  }, [key, value]);

  // שמירה מיידית כשעוברים לרקע (שיחה נכנסת, מעבר אפליקציה)
  useEffect(() => {
    const sub = AppState.addEventListener?.('change', (s) => {
      if (s !== 'active' && loaded.current) AsyncStorage.setItem(PREFIX + key, JSON.stringify(latest.current)).catch(() => undefined);
    });
    return () => sub?.remove?.();
  }, [key]);

  const clear = useCallback(async () => {
    loaded.current = false;
    await AsyncStorage.removeItem(PREFIX + key).catch(() => undefined);
  }, [key]);

  return [value, setValue, { restored, clear }];
}

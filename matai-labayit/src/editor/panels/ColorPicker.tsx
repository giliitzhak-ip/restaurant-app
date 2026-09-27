import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Slider } from '@/components/ui';
import { harmonies, hexToRgb, hslHex, readableOn, rgbToHsl, WALL_PALETTE } from '@/imaging/color';
import { radius, ROW, rtl, space, LTR } from '@/theme';

type Props = {
  value: string;
  onChange: (hex: string, commit: boolean) => void;
  onStart: () => void;
  onEyedropper: () => void;
  eyedropperActive: boolean;
};

const Swatch = ({ hex, on, onPress, size = 40 }: { hex: string; on?: boolean; onPress: () => void; size?: number }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`צבע ${hex}`}
    accessibilityState={{ selected: !!on }}
    onPress={onPress}
    style={[styles.sw, { width: size, height: size, backgroundColor: hex }, on && styles.swOn]}
    hitSlop={2}
  />
);

/** בחירת צבע: פלטה, דגימה מהתמונה, צבע מותאם (גוון/רוויה/בהירות) וצבעים משלימים. */
export function ColorPicker({ value, onChange, onStart, onEyedropper, eyedropperActive }: Props) {
  const [custom, setCustom] = useState(false);
  const [hexText, setHexText] = useState(value);
  const hsl = rgbToHsl(hexToRgb(value));
  const set = (hex: string) => {
    onStart();
    onChange(hex, true);
    setHexText(hex);
  };
  return (
    <View style={{ gap: space.md }}>
      <View style={[styles.row, { alignItems: 'center' }]}>
        <View style={[styles.current, { backgroundColor: value }]}>
          <Text style={{ color: readableOn(value), fontWeight: '700' }}>{value}</Text>
        </View>
        <Button label="דגימה מהתמונה" icon="eyedropper" variant={eyedropperActive ? 'primary' : 'secondary'} onPress={onEyedropper} style={{ flex: 1 }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {WALL_PALETTE.map((c) => (
          <Swatch key={c} hex={c} on={c.toUpperCase() === value.toUpperCase()} onPress={() => set(c)} />
        ))}
      </ScrollView>
      <Text style={[styles.label, rtl]}>צבעים משלימים</Text>
      <View style={{ gap: 8 }}>
        {harmonies(value).map((h) => (
          <View key={h.label} style={[styles.row, { alignItems: 'center' }]}>
            <Text style={[styles.hLabel, rtl]}>{h.label}</Text>
            {h.colors.map((c) => (
              <Swatch key={c} hex={c} size={36} onPress={() => set(c)} />
            ))}
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: custom }} onPress={() => setCustom(!custom)} style={{ minHeight: 40, justifyContent: 'center' }}>
        <Text style={[styles.link, rtl]}>{custom ? '− ' : '+ '}צבע מותאם אישית</Text>
      </Pressable>
      {custom && (
        <View style={{ gap: space.sm }}>
          <Slider label="גוון" value={hsl.h} min={0} max={359} step={1} onStart={onStart} onChange={(h) => onChange(hslHex(h, hsl.s, hsl.l), false)} format={(v) => `${Math.round(v)}°`} />
          <Slider label="רוויה" value={hsl.s} min={0} max={1} onStart={onStart} onChange={(s) => onChange(hslHex(hsl.h, s, hsl.l), false)} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="בהירות" value={hsl.l} min={0.05} max={0.97} onStart={onStart} onChange={(l) => onChange(hslHex(hsl.h, hsl.s, l), false)} format={(v) => `${Math.round(v * 100)}%`} />
          <View style={[styles.row, { alignItems: 'center' }]}>
            <TextInput
              accessibilityLabel="קוד צבע (HEX)"
              value={hexText}
              onChangeText={setHexText}
              autoCapitalize="characters"
              style={styles.hexInput}
              maxLength={7}
            />
            <Button
              label="החלה"
              variant="secondary"
              onPress={() => {
                const t = hexText.startsWith('#') ? hexText : `#${hexText}`;
                if (/^#[0-9a-fA-F]{6}$/.test(t)) set(t.toUpperCase());
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: ROW, gap: space.sm },
  current: { width: 110, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  sw: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  swOn: { borderWidth: 3, borderColor: '#1E1C19' },
  label: { fontWeight: '700', fontSize: 14, color: '#1E1C19' },
  hLabel: { width: 64, fontSize: 13, color: '#57514A' },
  link: { color: '#2E4A3D', fontWeight: '700' },
  hexInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#DDD6CB', borderRadius: radius.md, paddingHorizontal: 12, fontSize: 16, ...LTR, textAlign: 'left' },
});

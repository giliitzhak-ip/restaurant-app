// רכיבי ממשק בסיסיים: נגישים (תוויות, תפקידים), אזורי לחיצה של 48px, עברית מימין לשמאל.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, IS_RTL_LAYOUT, radius, ROW, rtl, shadow, space, touch, type, LTR } from '@/theme';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export const Icon = ({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: string }) => (
  <MaterialCommunityIcons name={name} size={size} color={color} />
);

type BtnProps = {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  size?: 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({ label, onPress, icon, variant = 'primary', size = 'md', disabled, loading, style, accessibilityHint, testID }: BtnProps) {
  const v = btnVariants[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        size === 'lg' && styles.btnLg,
        { backgroundColor: pressed ? v.pressed : v.bg, borderColor: v.border },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <Icon name={icon} color={v.fg} size={size === 'lg' ? 24 : 20} /> : null}
      <Text style={[styles.btnText, size === 'lg' && { fontSize: 18 }, { color: v.fg }]}>{label}</Text>
    </Pressable>
  );
}

const btnVariants = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.surface, pressed: colors.surfaceAlt, fg: colors.ink, border: colors.line },
  ghost: { bg: 'transparent', pressed: colors.surfaceAlt, fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.dangerSoft, pressed: '#F1CFCB', fg: colors.danger, border: '#EBC4BF' },
  accent: { bg: colors.accent, pressed: '#8F6841', fg: '#FFFFFF', border: colors.accent },
};

export function IconButton({
  icon,
  label,
  onPress,
  active,
  disabled,
  dark,
  size = touch,
  showLabel,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  active?: boolean;
  disabled?: boolean;
  dark?: boolean;
  size?: number;
  showLabel?: boolean;
  testID?: string;
}) {
  const fg = dark ? (active ? colors.selection : '#F4F1EA') : active ? colors.primary : colors.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconBtn,
        { minWidth: size, minHeight: size },
        active && { backgroundColor: dark ? 'rgba(231,179,90,0.16)' : colors.accentSoft },
        pressed && { backgroundColor: dark ? 'rgba(255,255,255,0.12)' : colors.surfaceAlt },
        disabled && { opacity: 0.35 },
      ]}
    >
      <Icon name={icon} color={fg} size={22} />
      {showLabel && (
        <Text style={[styles.iconLabel, { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export const Card = ({ children, style, onPress, accessibilityLabel, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string; testID?: string }) =>
  onPress ? (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}>
      {children}
    </Pressable>
  ) : (
    <View style={[styles.card, style]}>{children}</View>
  );

export const H1 = ({ children }: { children: React.ReactNode }) => <Text style={[type.title, styles.rtlText]} accessibilityRole="header">{children}</Text>;
export const H2 = ({ children, style }: { children: React.ReactNode; style?: object }) => <Text style={[type.heading, styles.rtlText, style]} accessibilityRole="header">{children}</Text>;
export const P = ({ children, style, muted }: { children: React.ReactNode; style?: object; muted?: boolean }) => (
  <Text style={[muted ? type.small : type.body, styles.rtlText, style]}>{children}</Text>
);

export function Banner({ kind = 'info', text, icon, onPress, actionLabel }: { kind?: 'info' | 'warning' | 'success' | 'danger'; text: string; icon?: IconName; onPress?: () => void; actionLabel?: string }) {
  const map = {
    info: { bg: colors.accentSoft, fg: colors.ink, icon: 'information-outline' as IconName },
    warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'alert-outline' as IconName },
    success: { bg: colors.successSoft, fg: colors.success, icon: 'check' as IconName },
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-outline' as IconName },
  }[kind];
  return (
    <View style={[styles.banner, { backgroundColor: map.bg }]} accessibilityRole={kind === 'danger' || kind === 'warning' ? 'alert' : undefined}>
      <Icon name={icon ?? map.icon} color={map.fg} size={20} />
      <Text style={[type.small, { color: map.fg, flex: 1 }, styles.rtlText]}>{text}</Text>
      {onPress && actionLabel && (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onPress} style={styles.bannerAction} hitSlop={8}>
          <Text style={{ color: map.fg, fontWeight: '700', textDecorationLine: 'underline' }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.small, { fontWeight: '600', color: colors.ink }, styles.rtlText]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 88, textAlignVertical: 'top' }, props.style]}
      />
      {hint ? <Text style={[type.tiny, styles.rtlText]}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon, testID }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && { opacity: 0.8 }]}
    >
      {icon && <Icon name={icon} size={18} color={selected ? colors.onPrimary : colors.ink} />}
      <Text style={[styles.chipText, selected && { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange, dark }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; dark?: boolean }) {
  return (
    <View style={[styles.seg, dark && { backgroundColor: 'rgba(255,255,255,0.08)' }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={[styles.segItem, on && { backgroundColor: dark ? colors.selection : colors.surface }, on && !dark && shadow]}
          >
            <Text style={{ fontWeight: on ? '700' : '500', color: dark ? (on ? colors.ink : '#EDE8DF') : colors.ink, fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** מחוון נגיש שעובד במגע ובעכבר, כולל כיוון מימין לשמאל. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 0,
  onChange,
  onStart,
  onEnd,
  format,
  dark,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  format?: (v: number) => string;
  dark?: boolean;
}) {
  const [w, setW] = useState(1);
  const isRtl = IS_RTL_LAYOUT;
  const frac = (value - min) / (max - min || 1);
  const pageX0 = useRef(0);
  const ref = useRef<View>(null);
  const toValue = (x: number) => {
    let f = Math.max(0, Math.min(1, x / w));
    if (isRtl) f = 1 - f;
    let v = min + f * (max - min);
    if (step) v = Math.round(v / step) * step;
    return Math.max(min, Math.min(max, v));
  };
  const handle = (e: GestureResponderEvent) => onChange(toValue(e.nativeEvent.pageX - pageX0.current));
  const fg = dark ? '#F4F1EA' : colors.ink;
  const stepAmt = step || (max - min) / 20;
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.sliderHead}>
        <Text style={{ color: fg, fontSize: 14, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: dark ? '#CFC8BC' : colors.inkSoft, fontSize: 13 }}>{format ? format(value) : Math.round(value * 100) / 100}</Text>
      </View>
      <View
        ref={ref}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: format ? format(value) : String(Math.round(value * 100) / 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          onStart?.();
          const d = e.nativeEvent.actionName === 'increment' ? stepAmt : -stepAmt;
          onChange(Math.max(min, Math.min(max, value + d)));
          onEnd?.();
        }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          // מחשבים את נקודת ההתחלה של המסילה במסך
          pageX0.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
          onStart?.();
          handle(e);
        }}
        onResponderMove={handle}
        onResponderRelease={() => onEnd?.()}
        onResponderTerminate={() => onEnd?.()}
        style={styles.sliderTrackWrap}
      >
        <View style={[styles.sliderTrack, dark && { backgroundColor: 'rgba(255,255,255,0.2)' }]} pointerEvents="none">
          <View
            style={[
              styles.sliderFill,
              { width: `${frac * 100}%` },
              isRtl ? { right: 0 } : { left: 0 },
              dark && { backgroundColor: colors.selection },
            ]}
          />
        </View>
        <View
          pointerEvents="none"
          style={[styles.sliderThumb, { left: (isRtl ? 1 - frac : frac) * w - 12 }, dark && { borderColor: colors.selection }]}
        />
      </View>
    </View>
  );
}

export const Loading = ({ label }: { label?: string }) => (
  <View style={styles.loading} accessibilityLiveRegion="polite">
    <ActivityIndicator size="large" color={colors.primary} />
    {label ? <Text style={[type.small, { textAlign: 'center' }]}>{label}</Text> : null}
  </View>
);

export const Divider = () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: space.sm }} />;

const styles = StyleSheet.create({
  rtlText: rtl,
  btn: {
    minHeight: touch,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    flexDirection: ROW,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1,
  },
  btnLg: { minHeight: 58, borderRadius: radius.lg, paddingHorizontal: space.xl },
  btnText: { fontSize: 16, fontWeight: '700' },
  iconBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, paddingHorizontal: 6, gap: 2 },
  iconLabel: { fontSize: 11, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.line },
  banner: { flexDirection: ROW, alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
  bannerAction: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  input: {
    minHeight: touch,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    fontSize: 16,
    color: colors.ink,
    ...rtl,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: ROW,
    alignItems: 'center',
    gap: 6,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  seg: { flexDirection: ROW, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: 6 },
  sliderHead: { flexDirection: ROW, justifyContent: 'space-between' },
  sliderTrackWrap: { height: 40, justifyContent: 'center', ...LTR },
  sliderTrack: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  sliderFill: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.primary },
  sliderThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.primary,
    top: 8,
  },
  loading: { padding: space.xl, alignItems: 'center', justifyContent: 'center', gap: space.md },
});

export const rtlText = styles.rtlText;

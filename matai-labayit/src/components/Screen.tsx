import React from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '@/theme';

/** מעטפת מסך עם גלילה, ריווח אחיד ומרווח לאזור הבטוח בתחתית. */
export function Screen({ children, scroll = true, footer, style }: { children: React.ReactNode; scroll?: boolean; footer?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: space.xxl + (footer ? 0 : insets.bottom) }, style]} keyboardShouldPersistTaps="handled">
      <View style={styles.inner}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }, style]}>
      <View style={[styles.inner, { flex: 1 }]}>{children}</View>
    </View>
  );
  return (
    <View style={styles.root}>
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.lg },
  inner: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.lg },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});

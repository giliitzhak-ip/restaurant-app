import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radius, ROW, rtl, space, type } from '@/theme';
import { Icon } from './ui';

export const ROOM_TIPS = [
  'עמדו מול הקיר או הפינה שרוצים לשדרג, בגובה העיניים.',
  'החזיקו את הטלפון ישר – לא מוטה למעלה או למטה.',
  'הדליקו אור ופתחו תריסים. אור יום רך נותן את הצבעים הכי נאמנים.',
  'כללו את הרצפה ואת הקיר המלאים, כולל המקום שבו יעמוד המוצר.',
  'כדאי שיופיע בתמונה משהו שמידתו ידועה (דלת, חלון) – כך אפשר לכייל גודל.',
];

export const PRODUCT_TIPS = [
  'צלמו את המוצר מלפנים, בגובה המוצר, כך שכולו בתוך המסגרת.',
  'השאירו מעט רווח סביב המוצר. מדפים ואנשים ברקע – אפשר לסמן ולתקן אחר כך.',
  'לאריחים, פרקט וטפט: צלמו מקרוב ובמאונך, כשהדוגמה ממלאת את התמונה.',
  'יש לכם תמונה נקייה מאתר החנות? אפשר להעלות אותה מהגלריה.',
];

export function Tips({ title, tips, initiallyOpen = true }: { title: string; tips: string[]; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: space.md, gap: space.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: ROW, alignItems: 'center', gap: space.sm, minHeight: 36 }}
      >
        <Icon name="lightbulb-on-outline" color={colors.accent} />
        <Text style={[type.heading, rtl, { flex: 1, fontSize: 15 }]}>{title}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} color={colors.inkSoft} />
      </Pressable>
      {open &&
        tips.map((t) => (
          <View key={t} style={{ flexDirection: ROW, gap: space.sm }}>
            <Text style={{ color: colors.accent, fontWeight: '800' }}>•</Text>
            <Text style={[type.small, rtl, { flex: 1, color: colors.ink }]}>{t}</Text>
          </View>
        ))}
    </View>
  );
}

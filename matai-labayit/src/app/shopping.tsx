import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { StoredImage } from '@/components/StoredImage';
import { Card, Icon, IconButton, Segmented } from '@/components/ui';
import { categoryById } from '@/model/categories';
import { shekel } from '@/model/totals';
import type { Product } from '@/model/types';
import { updateProduct, useDB } from '@/storage/db';
import { colors, radius, ROW, rtl, space, type } from '@/theme';

type Tab = 'list' | 'fav';

/** רשימת קניות ומועדפים, מקובצים לפי חדר, עם סכום לכל חדר. */
export default function Shopping() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'list');
  const products = useDB((s) => s.products);
  const rooms = useDB((s) => s.rooms);
  const items = Object.values(products).filter((p) => (tab === 'list' ? p.inShoppingList : p.favorite));
  const groups = new Map<string, Product[]>();
  items.forEach((p) => {
    const k = p.roomId && rooms[p.roomId] ? p.roomId : '_';
    groups.set(k, [...(groups.get(k) ?? []), p]);
  });

  return (
    <Screen>
      <Segmented
        options={[
          { id: 'list', label: 'רשימת קניות' },
          { id: 'fav', label: 'מועדפים' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {items.length === 0 && (
        <Card style={{ alignItems: 'center', gap: space.sm }}>
          <Icon name={tab === 'list' ? 'cart-outline' : 'heart-outline'} size={36} color={colors.accent} />
          <Text style={[type.body, { textAlign: 'center' }]}>
            {tab === 'list' ? 'הרשימה ריקה. הוסיפו מוצרים מהעורך או ממסך פרטי המוצר.' : 'עוד אין מועדפים. סמנו ♥ על מוצרים שאהבתם.'}
          </Text>
        </Card>
      )}
      {[...groups.entries()].map(([roomId, list]) => {
        const open = list.filter((p) => !p.purchased);
        const total = open.reduce((s, p) => s + (p.price ?? 0), 0);
        return (
          <View key={roomId} style={{ gap: space.sm }}>
            <View style={styles.groupHead}>
              <Text style={[type.heading, rtl, { flex: 1 }]} accessibilityRole="header">
                {roomId === '_' ? 'ללא חדר' : rooms[roomId].name}
              </Text>
              {tab === 'list' && total > 0 && <Text style={[type.small, { fontWeight: '700' }]}>נותר לקנות: {shekel(total)}</Text>}
            </View>
            <Card style={{ padding: 0 }}>
              {list.map((p, i) => (
                <View key={p.id} style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                  {tab === 'list' && (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!p.purchased }}
                      accessibilityLabel={`נקנה: ${p.name || categoryById(p.category).label}`}
                      onPress={() => updateProduct(p.id, { purchased: !p.purchased })}
                      style={[styles.check, p.purchased && { backgroundColor: colors.success, borderColor: colors.success }]}
                      hitSlop={8}
                    >
                      {p.purchased && <Icon name="check" size={18} color="#fff" />}
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`פרטי ${p.name || categoryById(p.category).label}`}
                    onPress={() => router.push({ pathname: '/product/[productId]', params: { productId: p.id } })}
                    style={styles.itemBody}
                  >
                    {p.color && !p.photo ? (
                      <View style={[styles.img, { backgroundColor: p.color }]} />
                    ) : (
                      <StoredImage refId={p.cutout ?? p.swatch ?? p.photo} style={styles.img} resizeMode="contain" />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, rtl, { fontWeight: '600' }, p.purchased && { textDecorationLine: 'line-through', color: colors.muted }]} numberOfLines={1}>
                        {p.name || categoryById(p.category).label}
                      </Text>
                      <Text style={[type.tiny, rtl]} numberOfLines={1}>
                        {[p.store, p.price ? shekel(p.price) : null, p.dims?.widthCm ? `${p.dims.widthCm}×${p.dims.heightCm ?? '?'} ס״מ` : null].filter(Boolean).join(' · ') || 'ללא פרטים'}
                      </Text>
                    </View>
                  </Pressable>
                  <IconButton
                    icon={tab === 'list' ? 'close' : 'heart'}
                    label={tab === 'list' ? 'הסרה מהרשימה' : 'הסרה מהמועדפים'}
                    onPress={() => updateProduct(p.id, tab === 'list' ? { inShoppingList: false } : { favorite: false })}
                  />
                </View>
              ))}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupHead: { flexDirection: ROW, alignItems: 'center' },
  item: { flexDirection: ROW, alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 68 },
  itemBody: { flex: 1, flexDirection: ROW, alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  check: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center' },
  img: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
});

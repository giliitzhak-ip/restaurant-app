import React, { useEffect, useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import type { ImageRef } from '@/model/types';
import { getImageUri } from '@/storage/imageStore';
import { colors } from '@/theme';
import { Icon } from './ui';

/** הצגת תמונה מהמאגר המקומי לפי הפניה. */
export function StoredImage({ refId, style, resizeMode = 'cover', label }: { refId?: ImageRef; style?: StyleProp<ImageStyle>; resizeMode?: 'cover' | 'contain' | 'stretch'; label?: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUri(null);
    if (refId) getImageUri(refId).then((u) => alive && setUri(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refId]);
  if (!uri) {
    return (
      <View style={[{ backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }, style as object]} accessibilityLabel={label}>
        <Icon name="image-outline" color={colors.muted} />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} accessibilityLabel={label} accessible={!!label} />;
}

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import {View} from 'react-native';
import type {Stream} from '../lib/providers/types';
import {streamBadges} from '../lib/player/streamBadges';
import {useM3Colors} from '../theme/M3PaletteContext';
import {TVFocusable} from './tv';
import Text from './ui/Text';

export default function StreamSourceCard({stream, selected = false, preferredFocus = false, onPress}: {
  stream: Pick<Stream, 'server' | 'quality' | 'tag' | 'tags'>;
  selected?: boolean;
  preferredFocus?: boolean;
  onPress: () => void;
}) {
  const colors = useM3Colors();
  const badges = streamBadges(stream);
  return <TVFocusable onPress={onPress} hasTVPreferredFocus={preferredFocus}
    accessibilityLabel={`Play ${stream.server}. ${badges.join(', ')}`}
    accessibilityState={{selected}}
    style={{padding: 14, marginBottom: 8, borderRadius: 16, borderWidth: 1,
      borderColor: selected ? colors.primary : colors.outlineVariant,
      backgroundColor: selected ? colors.secondaryContainer : colors.surfaceContainerHighest}}>
    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 9, gap: 10}}>
      <View style={{width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceContainerHigh}}>
        <MaterialCommunityIcons name={selected ? 'check' : 'play'} size={20} color={colors.primary} />
      </View>
      <Text role="titleMedium" style={{color: selected ? colors.onSecondaryContainer : colors.onSurface, flex: 1}}>{stream.server}</Text>
    </View>
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
      {badges.map(badge => {
        const seedCount = badge.match(/^(?:👤\s*|S:\s*)(\d+)$/i)?.[1];
        const quality = /^\d{3,4}p$|^4k$/i.test(badge);
        return <View key={badge} style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7,
          backgroundColor: seedCount !== undefined ? '#163D31' : quality ? colors.primaryContainer : colors.surfaceContainerHigh}}>
          {seedCount !== undefined && <MaterialCommunityIcons name="account-group-outline" size={14} color="#A5E8C8" />}
          <Text role="labelMedium" style={{color: seedCount !== undefined ? '#A5E8C8' : quality ? colors.onPrimaryContainer : colors.onSurfaceVariant}}>{seedCount !== undefined ? `${seedCount} seeders` : badge}</Text>
        </View>;
      })}
    </View>
  </TVFocusable>;
}

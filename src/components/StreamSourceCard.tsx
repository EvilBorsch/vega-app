import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import {View} from 'react-native';
import type {Stream} from '../lib/providers/types';
import {streamBadges} from '../lib/player/streamBadges';
import {useM3Colors} from '../theme/M3PaletteContext';
import {TVFocusable} from './tv';
import Text from './ui/Text';

const TEST_COLORS = {good: '#A5E8C8', ok: '#F2D492', bad: '#FFB4AB', pending: undefined} as const;
const TEST_ICONS = {good: 'speedometer', ok: 'speedometer-medium', bad: 'alert-circle-outline', pending: 'progress-clock'} as const;

export default function StreamSourceCard({stream, selected = false, preferredFocus = false, onPress, test}: {
  stream: Pick<Stream, 'server' | 'title' | 'quality' | 'tag' | 'tags'>;
  selected?: boolean;
  preferredFocus?: boolean;
  onPress: () => void;
  /** What briefly joining the release's swarm showed: speed and peers, or why it will not play. */
  test?: {text: string; tone: 'good' | 'ok' | 'bad' | 'pending'};
}) {
  const colors = useM3Colors();
  const badges = streamBadges(stream);
  return <TVFocusable onPress={onPress} hasTVPreferredFocus={preferredFocus}
    accessibilityLabel={`Play ${stream.server}. ${stream.title ? `${stream.title}. ` : ''}${badges.join(', ')}`}
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
    {!!stream.title && <Text role="bodySmall" numberOfLines={2} style={{color: selected ? colors.onSecondaryContainer : colors.onSurfaceVariant, marginBottom: 9}}>{stream.title}</Text>}
    {test && (
      <View accessibilityLabel={test.text} style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 9}}>
        <MaterialCommunityIcons name={TEST_ICONS[test.tone]} size={16} color={TEST_COLORS[test.tone] || colors.onSurfaceVariant} />
        <Text role="labelLarge" style={{color: TEST_COLORS[test.tone] || colors.onSurfaceVariant}}>{test.text}</Text>
      </View>
    )}
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
      {badges.map(badge => {
        const seedCount = badge.match(/^(?:👤\s*|S:\s*)(\d+)$/i)?.[1];
        // Peers the DHT returned just now, for releases without a fresh seeder count.
        const onlineCount = badge.match(/^👥\s*(\d+)$/)?.[1];
        const live = seedCount !== undefined || onlineCount !== undefined;
        const noPeers = badge === 'No peers';
        const quality = /^\d{3,4}p$|^4k$/i.test(badge);
        return <View key={badge} style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7,
          backgroundColor: live ? '#163D31' : noPeers ? '#4A1F1F' : quality ? colors.primaryContainer : colors.surfaceContainerHigh}}>
          {live && <MaterialCommunityIcons name={onlineCount !== undefined ? 'access-point' : 'account-group-outline'} size={14} color="#A5E8C8" />}
          <Text role="labelMedium" style={{color: live ? '#A5E8C8' : noPeers ? '#FFB4AB' : quality ? colors.onPrimaryContainer : colors.onSurfaceVariant}}>
            {seedCount !== undefined ? `${seedCount} seeders` : onlineCount !== undefined ? `~${onlineCount} peers in DHT` : badge}
          </Text>
        </View>;
      })}
    </View>
  </TVFocusable>;
}

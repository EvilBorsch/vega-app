import React, {useMemo} from 'react';
import {ScrollView, View} from 'react-native';
import {getStreamFilterOptions, type FilterableStream} from '../lib/player/streamFilters';
import {useM3Colors} from '../theme/M3PaletteContext';
import Text from './ui/Text';
import {TVFocusable} from './tv';

export default function StreamFilterControls({streams, qualities, languages, onQualities, onLanguages, stacked = false}: {
  streams: FilterableStream[];
  qualities: string[];
  languages: string[];
  onQualities: (values: string[]) => void;
  onLanguages: (values: string[]) => void;
  stacked?: boolean;
}) {
  const colors = useM3Colors();
  const options = useMemo(() => getStreamFilterOptions(streams), [streams]);
  const row = (label: string, values: string[], selected: string[], onChange: (values: string[]) => void) => (
    <View style={{flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'stretch' : 'center', marginBottom: stacked ? 14 : 6}}>
      <Text role="labelMedium" style={{color: colors.onSurfaceVariant, width: stacked ? undefined : 65, marginBottom: stacked ? 6 : 0}}>{label}</Text>
      <ScrollView horizontal={!stacked} showsHorizontalScrollIndicator={false} style={stacked ? undefined : {flex: 1}} contentContainerStyle={{gap: 6, flexDirection: 'row', flexWrap: stacked ? 'wrap' : 'nowrap'}}>
        {['ALL', ...values].map(value => {
          const active = value === 'ALL' ? selected.length === 0 : selected.includes(value);
          const name = value === 'ALL' ? 'All' : value === 'UNKNOWN' ? 'Unspecified' : label === 'Quality' ? value === '2160' ? '4K' : `${value}p` : value === 'MULTI' ? 'Multi' : value;
          return <TVFocusable key={value} accessibilityRole="checkbox" accessibilityLabel={`${label}: ${name}`} accessibilityState={{checked: active}}
            onPress={() => onChange(value === 'ALL' ? [] : active ? selected.filter(item => item !== value) : [...selected, value])}
            style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: active ? colors.secondaryContainer : colors.surfaceContainerHighest}}>
            <Text role="labelMedium" style={{color: active ? colors.onSecondaryContainer : colors.onSurface}}>{active && value !== 'ALL' ? '✓ ' : ''}{name}</Text>
          </TVFocusable>;
        })}
      </ScrollView>
    </View>
  );
  return <View style={{paddingVertical: 6}}>
    {row('Quality', options.qualities, qualities, onQualities)}
    {row('Language', options.languages, languages, onLanguages)}
  </View>;
}

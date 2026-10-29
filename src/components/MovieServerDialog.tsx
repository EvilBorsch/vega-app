import React, {useMemo, useState} from 'react';
import {FlatList, View, useWindowDimensions} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import StreamSourceCard from './StreamSourceCard';
import {filterStreams} from '../lib/player/streamFilters';
import StreamFilterControls from './StreamFilterControls';
import type {Stream} from '../lib/providers/types';
import {useM3Colors} from '../theme/M3PaletteContext';
import MaterialDialogSurface from './ui/MaterialDialogSurface';
import LoadingIndicator from './ui/LoadingIndicator';
import Text from './ui/Text';
import {TVFocusable} from './tv';

export default function MovieServerDialog({
  streams,
  loading,
  onSelect,
  onDismiss,
}: {
  streams: Stream[];
  loading: boolean;
  onSelect: (stream: Stream) => void;
  onDismiss: () => void;
}) {
  const colors = useM3Colors();
  const {height, width} = useWindowDimensions();
  const landscape = width > height;
  const [qualities, setQualities] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const filtered = useMemo(() => filterStreams(streams, qualities, languages), [streams, qualities, languages]);
  return (
    <MaterialDialogSurface visible screenSized onDismiss={onDismiss} style={{height: Math.min(720, height - 48), width: Math.min(680, width - 32), maxWidth: 680, padding: 16}}>
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
        <View style={{flex: 1}}>
          <Text role="titleLarge" style={{color: colors.onSurface}}>Choose a source</Text>
          {!landscape && <Text role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 4}}>Quality, language and torrent availability</Text>}
        </View>
        <TVFocusable accessibilityLabel="Cancel server selection" onPress={onDismiss} style={{padding: 10, borderRadius: 24, backgroundColor: colors.surfaceContainerHighest}}>
          <MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceVariant} />
        </TVFocusable>
      </View>
      {loading ? (
        <View style={{flex: 1, justifyContent: 'center'}}><LoadingIndicator /></View>
      ) : (
        <View style={{flex: 1, flexDirection: landscape ? 'row' : 'column', gap: landscape ? 16 : 0}}>
        <View style={landscape ? {width: 205} : undefined}>
          <StreamFilterControls stacked={landscape} streams={streams} qualities={qualities} languages={languages} onQualities={setQualities} onLanguages={setLanguages} />
        </View>
        <View style={{flex: 1}}>
        <Text role="labelMedium" style={{color: colors.onSurfaceVariant, marginBottom: 10, marginTop: 4}}>{filtered.length} of {streams.length} sources</Text>
        <FlatList style={{flex: 1}} data={filtered} keyExtractor={(stream, index) => `${stream.server}:${stream.link}:${index}`}
          initialNumToRender={8} windowSize={5} contentContainerStyle={{paddingBottom: 4}}
          renderItem={({item, index}) => <StreamSourceCard stream={item} preferredFocus={index === 0} onPress={() => onSelect(item)} />}
          ListEmptyComponent={
            <Text style={{color: colors.onSurfaceVariant}}>
              {streams.length ? 'No matching sources. Change quality or language filters.' : 'No servers available'}
            </Text>
          } />
        </View>
        </View>
      )}
    </MaterialDialogSurface>
  );
}

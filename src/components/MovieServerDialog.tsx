import React from 'react';
import {ScrollView, View} from 'react-native';
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
  return (
    <MaterialDialogSurface visible onDismiss={onDismiss}>
      <Text
        role="titleLarge"
        style={{color: colors.onSurface, marginBottom: 16}}>
        Choose a server
      </Text>
      {loading ? (
        <LoadingIndicator />
      ) : (
        <ScrollView style={{maxHeight: 420}}>
          {streams.map((stream, index) => (
            <TVFocusable
              key={`${stream.server}:${stream.link}:${index}`}
              accessibilityLabel={`Play ${stream.server} ${stream.quality || ''} ${stream.tag || ''}`.trim()}
              hasTVPreferredFocus={index === 0}
              onPress={() => onSelect(stream)}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 12,
                borderRadius: 12,
              }}>
              <Text role="titleMedium" style={{color: colors.onSurface}}>
                {stream.server}
              </Text>
              <Text role="bodyMedium" style={{color: colors.onSurfaceVariant}}>
                {[
                  stream.quality ? `${stream.quality}p` : '',
                  stream.tag,
                  ...(stream.tags || []),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </TVFocusable>
          ))}
          {!streams.length && (
            <Text style={{color: colors.onSurfaceVariant}}>
              No servers available
            </Text>
          )}
        </ScrollView>
      )}
      <View style={{marginTop: 12, alignItems: 'flex-end'}}>
        <TVFocusable
          onPress={onDismiss}
          accessibilityLabel="Cancel server selection"
          style={{padding: 12}}>
          <Text style={{color: colors.primary}}>Cancel</Text>
        </TVFocusable>
      </View>
    </MaterialDialogSurface>
  );
}

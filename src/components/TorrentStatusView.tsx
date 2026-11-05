import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import {Text, View} from 'react-native';
import {TVFocusable} from './tv';

/** Stage and swarm details of a starting or buffering torrent. */
export function TorrentStatusText({title, detail}: {title: string; detail: string}) {
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{alignItems: 'center', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)'}}>
      <Text style={{color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center'}}>{title}</Text>
      {!!detail && (
        <Text style={{color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 19}}>
          {detail}
        </Text>
      )}
    </View>
  );
}

const ActionButton = ({label, icon, primary, preferredFocus, onPress}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  primary?: boolean;
  preferredFocus?: boolean;
  onPress: () => void;
}) => (
  <TVFocusable
    hasTVPreferredFocus={preferredFocus}
    focusBorderColor="#ffffff"
    focusScale={1.06}
    borderRadius={12}
    accessibilityLabel={label}
    onPress={onPress}
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: primary ? '#ffffff' : 'rgba(255,255,255,0.14)',
    }}>
    <MaterialIcons name={icon} size={20} color={primary ? '#000' : '#fff'} />
    <Text style={{color: primary ? '#000' : '#fff', fontWeight: '600', fontSize: 15}}>{label}</Text>
  </TVFocusable>
);

/** A torrent that could not start: the reason and what to do next. */
export function TorrentFailurePanel({message, server, onRetry, onChooseSource, onBack}: {
  message: string;
  server?: string;
  onRetry: () => void;
  onChooseSource: () => void;
  onBack: () => void;
}) {
  return (
    <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, backgroundColor: '#000'}}>
      <MaterialIcons name="cloud-off" size={44} color="#F87171" />
      <Text style={{color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 12, textAlign: 'center'}}>
        {server ? `${server}: the torrent did not start` : 'The torrent did not start'}
      </Text>
      <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 8, textAlign: 'center', maxWidth: 520, lineHeight: 20}}>
        {message}
      </Text>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 22}}>
        <ActionButton label="Choose another source" icon="list" primary preferredFocus onPress={onChooseSource} />
        <ActionButton label="Retry" icon="refresh" onPress={onRetry} />
        <ActionButton label="Back" icon="arrow-back" onPress={onBack} />
      </View>
    </View>
  );
}

/** Retry and source buttons for a stream that stopped receiving data while playing. */
export function TorrentStallActions({onRetry, onChooseSource}: {onRetry: () => void; onChooseSource: () => void}) {
  return (
    <View style={{flexDirection: 'row', gap: 10, marginTop: 12}}>
      <ActionButton label="Another source" icon="list" onPress={onChooseSource} />
      <ActionButton label="Restart torrent" icon="refresh" onPress={onRetry} />
    </View>
  );
}

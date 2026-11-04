import React, {useMemo, useState} from 'react';
import {FlatList, View, useWindowDimensions} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import StreamSourceCard from './StreamSourceCard';
import {defaultStreamFilters, filterStreams} from '../lib/player/streamFilters';
import StreamFilterControls from './StreamFilterControls';
import type {Stream} from '../lib/providers/types';
import {useM3Colors} from '../theme/M3PaletteContext';
import MaterialDialogSurface from './ui/MaterialDialogSurface';
import LoadingIndicator from './ui/LoadingIndicator';
import Text from './ui/Text';
import {TVFocusable} from './tv';
import ElapsedSeconds from './ElapsedSeconds';
import {describeProgress, describeTest, freshResult, sortBySpeed, testProgress, useSwarmTests, type SourceSort} from '../lib/player/swarmTests';
import {streamInfoHash} from '../lib/player/swarmHealth';
import {torrentManager} from '../lib/torrentManager';

export default function MovieServerDialog({
  streams,
  loading,
  onSelect,
  onDismiss,
  subtitle,
  loadingText,
  hiddenStreams = [],
  checking = false,
}: {
  streams: Stream[];
  loading: boolean;
  onSelect: (stream: Stream) => void;
  onDismiss: () => void;
  /** What is about to play, such as an episode. */
  subtitle?: string;
  /** Where sources are being searched while the list loads. */
  loadingText?: string;
  /** Releases nobody shares, listed only on request. */
  hiddenStreams?: Stream[];
  /** Whether the swarms of the listed releases are still being checked. */
  checking?: boolean;
}) {
  const colors = useM3Colors();
  const {height, width} = useWindowDimensions();
  const landscape = width > height;
  // Russian (else English) at the best quality until the viewer picks filters.
  const [chosen, setChosen] = useState<{qualities: string[]; languages: string[]} | undefined>();
  const defaults = useMemo(() => defaultStreamFilters(streams), [streams]);
  const {qualities, languages} = chosen || defaults;
  const setQualities = (next: string[]) => setChosen({qualities: next, languages});
  const setLanguages = (next: string[]) => setChosen({qualities, languages: next});
  const [showHidden, setShowHidden] = useState(false);
  const [sort, setSort] = useState<SourceSort>('speed');
  const matching = useMemo(
    () => filterStreams(showHidden ? [...streams, ...hiddenStreams] : streams, qualities, languages),
    [streams, hiddenStreams, showHidden, qualities, languages],
  );
  // The releases at the top are joined briefly to measure real peers and
  // speed, so the list can be ordered by what will actually play fast.
  const [tested, setTested] = useState(matching);
  const {results, running} = useSwarmTests(tested, !loading);
  const filtered = useMemo(() => sortBySpeed(matching, results, sort), [matching, results, sort]);
  React.useEffect(() => setTested(filtered), [filtered]);
  const progress = testProgress(filtered, results, running);
  const progressText = describeProgress(progress);
  return (
    <MaterialDialogSurface visible screenSized onDismiss={onDismiss} style={{height: Math.min(720, height - 48), width: Math.min(680, width - 32), maxWidth: 680, padding: 16}}>
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
        <View style={{flex: 1}}>
          <Text role="titleLarge" style={{color: colors.onSurface}}>Choose a source</Text>
          {subtitle ? (
            <Text role="bodySmall" numberOfLines={1} style={{color: colors.onSurfaceVariant, marginTop: 4}}>{subtitle}</Text>
          ) : !landscape && <Text role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 4}}>Quality, language and torrent availability</Text>}
        </View>
        <TVFocusable accessibilityLabel="Cancel server selection" onPress={onDismiss} style={{padding: 10, borderRadius: 24, backgroundColor: colors.surfaceContainerHighest}}>
          <MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceVariant} />
        </TVFocusable>
      </View>
      {loading ? (
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingHorizontal: 16}}>
          <LoadingIndicator />
          <Text role="bodyMedium" style={{color: colors.onSurfaceVariant, textAlign: 'center'}}>{loadingText || 'Searching for sources…'}</Text>
          <ElapsedSeconds style={{color: colors.onSurfaceVariant, fontSize: 12}} />
        </View>
      ) : (
        <View style={{flex: 1, flexDirection: landscape ? 'row' : 'column', gap: landscape ? 16 : 0}}>
        <View style={landscape ? {width: 205} : undefined}>
          <StreamFilterControls stacked={landscape} streams={streams} qualities={qualities} languages={languages} onQualities={setQualities} onLanguages={setLanguages} />
        </View>
        <View style={{flex: 1}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4, flexWrap: 'wrap'}}>
          {(['speed', 'quality'] as const).map(mode => (
            <TVFocusable key={mode} onPress={() => setSort(mode)} accessibilityLabel={mode === 'speed' ? 'Sort by speed' : 'Sort by quality'}
              accessibilityState={{selected: sort === mode}}
              style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.outlineVariant,
                backgroundColor: sort === mode ? colors.secondaryContainer : 'transparent'}}>
              <Text role="labelMedium" style={{color: sort === mode ? colors.onSecondaryContainer : colors.onSurfaceVariant}}>
                {mode === 'speed' ? 'Fastest first' : 'Best quality first'}
              </Text>
            </TVFocusable>
          ))}
        </View>
        <Text role="labelMedium" style={{color: colors.onSurfaceVariant, marginBottom: progressText ? 4 : 10}}>
          {filtered.length} of {streams.length} sources
          {checking ? ' · checking which releases have peers…' : hiddenStreams.length ? ` · ${hiddenStreams.length} without peers hidden` : ''}
        </Text>
        {progressText ? (
          <View style={{marginBottom: 10}} accessibilityLabel={progressText}>
            <Text role="labelSmall" style={{color: colors.onSurfaceVariant}}>{progressText}</Text>
            <View style={{height: 4, borderRadius: 2, marginTop: 4, backgroundColor: colors.surfaceContainerHighest, overflow: 'hidden'}}>
              <View style={{height: 4, width: `${Math.round((100 * progress.tested) / progress.total)}%`, backgroundColor: colors.primary}} />
            </View>
          </View>
        ) : null}
        <FlatList style={{flex: 1}} data={filtered} keyExtractor={(stream, index) => `${stream.server}:${stream.link}:${index}`}
          initialNumToRender={8} windowSize={5} contentContainerStyle={{paddingBottom: 4}}
          renderItem={({item, index}) => {
            const hash = streamInfoHash(item);
            return <StreamSourceCard stream={item} preferredFocus={index === 0} onPress={() => {
                // A tested release is already connected; the player takes it over.
                if (hash) torrentManager.claimSwarmTest(hash).catch(() => {});
                onSelect(item);
              }}
              test={describeTest(freshResult(results, hash), Boolean(hash && running[hash]))} />;
          }}
          ListFooterComponent={hiddenStreams.length ? (
            <TVFocusable onPress={() => setShowHidden(shown => !shown)}
              accessibilityLabel={showHidden ? 'Hide releases without peers' : `Show ${hiddenStreams.length} releases without peers`}
              style={{paddingVertical: 12, alignItems: 'center'}}>
              <Text role="labelLarge" style={{color: colors.primary}}>
                {showHidden ? 'Hide releases without peers' : `Show ${hiddenStreams.length} releases without peers`}
              </Text>
            </TVFocusable>
          ) : null}
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

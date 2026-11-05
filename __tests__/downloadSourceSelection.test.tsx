import React from 'react';
import renderer, {act} from 'react-test-renderer';

let mockChecking = false;
let mockExternal = false;
let mockResults: Record<string, any> = {};
const mockSpeedTests = jest.fn();
const mockClaim = jest.fn(async () => {});
const mockHealth = jest.fn();
const mockStopTests = jest.fn(async () => {});
jest.mock('../src/lib/storage', () => ({
  mainStorage: {getString: () => undefined},
  settingsStorage: {getBool: () => mockExternal, isHapticFeedbackEnabled: () => false},
}));
jest.mock('../src/lib/torrentManager', () => ({torrentManager: {claimSwarmTest: (...args: any[]) => mockClaim(...args)}}));
jest.mock('../src/lib/player/swarmHealth', () => ({
  ...jest.requireActual('../src/lib/player/swarmHealth'),
  streamInfoHash: (stream: any) => require('../src/lib/providers/torrentIdentity').torrentInfoHash(stream?.link),
  useSwarmHealth: (streams: any[], options: any) => {
    mockHealth(options);
    return {visible: streams, hidden: [], checking: mockChecking};
  },
}));
jest.mock('../src/lib/player/swarmTests', () => ({
  ...jest.requireActual('../src/lib/player/swarmTests'),
  stopSwarmTests: () => mockStopTests(),
  useSwarmTests: (streams: any[], enabled: boolean) => {
    mockSpeedTests(streams, enabled);
    return {results: mockResults, running: {}, live: {}};
  },
}));
jest.mock('../src/components/tv', () => {
  const {Pressable, View} = require('react-native');
  return {TVFocusable: Pressable, TVFocusGuide: View};
});
jest.mock('../src/lib/tv', () => ({isTV: false}));
jest.mock('../src/components/ui/MaterialDialogSurface', () => ({__esModule: true, default: require('react-native').View}));
jest.mock('../src/components/ui/LoadingIndicator', () => ({__esModule: true, default: require('react-native').View}));
jest.mock('../src/theme/M3PaletteContext', () => ({useM3Colors: () => ({})}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-haptic-feedback', () => ({trigger: jest.fn()}));
jest.mock('react-native-video', () => ({TextTrackType: {VTT: 'text/vtt'}}));
jest.mock('react-native-gesture-handler', () => ({GestureHandlerRootView: require('react-native').View}));
jest.mock('@gorhom/bottom-sheet', () => {
  const {View, ScrollView} = require('react-native');
  return {__esModule: true, default: View, BottomSheetBackdrop: View, BottomSheetScrollView: ScrollView};
});

import DownloadBottomSheet from '../src/components/DownloadBottomSheet';
import MovieServerDialog from '../src/components/MovieServerDialog';
import StreamSourceCard from '../src/components/StreamSourceCard';

const hash = (n: number) => n.toString(16).padStart(40, '0');
const release = (n: number, quality: string, language = 'RU') => ({server: `Tracker ${n}`, title: `Release ${n}`, quality,
  type: 'torrent', link: `magnet:?xt=urn:btih:${hash(n)}`, tags: [language]});
const streams = [release(1, '1080'), release(2, '720'), release(3, '1080', 'EN')];
let tree: renderer.ReactTestRenderer;
const onVideo = jest.fn();
const onExternal = jest.fn();
const close = jest.fn();
const props = {data: streams, loading: false, showModal: true, setModal: close, onPressVideo: onVideo,
  onPressExternalVideo: onExternal, onPressSubs: jest.fn()};
const mount = (overrides = {}) => act(() => {tree = renderer.create(<DownloadBottomSheet {...props} {...overrides} />);});
const button = (label: string) => tree.root.findAll(node => typeof node.type !== 'string' && node.props.accessibilityLabel === label && node.props.onPress)[0];
const cards = () => tree.root.findAllByType(StreamSourceCard);
beforeEach(() => {mockChecking = false; mockExternal = false; mockResults = {}; jest.clearAllMocks(); mockStopTests.mockResolvedValue(undefined);});
afterEach(() => {if (tree) act(() => tree.unmount());});

it('uses the playback source picker with quality/language filters and downloads the selected release', async () => {
  mount();
  expect(tree.root.findAllByType(MovieServerDialog)).toHaveLength(1);
  expect(cards().map(card => card.props.stream.server)).toEqual(['Tracker 1', 'Tracker 2']);
  act(() => button('Quality: 1080p').props.onPress());
  expect(cards().map(card => card.props.stream.server)).toEqual(['Tracker 2']);
  await act(async () => {await cards()[0].props.onPress();});
  expect(onVideo).toHaveBeenCalledWith(streams[1]);
  expect(onExternal).not.toHaveBeenCalled();
  expect(mockClaim).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledWith(false);
});

it('waits for current swarm counts, then moves the measured fastest source to the top', () => {
  mockChecking = true;
  mount();
  expect(mockHealth).toHaveBeenLastCalledWith(expect.objectContaining({enabled: true}));
  expect(mockSpeedTests).toHaveBeenLastCalledWith(expect.any(Array), false);
  mockChecking = false;
  mockResults = {[hash(1)]: {metadata: true, speed: 100_000, maxSpeed: 100_000, testedAt: Date.now()},
    [hash(2)]: {metadata: true, speed: 5_000_000, maxSpeed: 5_000_000, testedAt: Date.now()}};
  act(() => tree.update(<DownloadBottomSheet {...props} />));
  expect(mockSpeedTests).toHaveBeenLastCalledWith(expect.any(Array), true);
  expect(cards()[0].props.stream.server).toBe('Tracker 2');
});

it('honors the external downloader preference without claiming a playback torrent', async () => {
  mockExternal = true;
  mount();
  await act(async () => {await cards()[0].props.onPress();});
  expect(onExternal).toHaveBeenCalledWith(streams[0]);
  expect(onVideo).not.toHaveBeenCalled();
  expect(mockClaim).not.toHaveBeenCalled();
});

it('finishes cleaning up temporary speed tests before starting a download', async () => {
  let finish: () => void;
  mockStopTests.mockImplementationOnce(() => new Promise<void>(resolve => {finish = resolve;}));
  mount();
  let selected: Promise<void>;
  act(() => {selected = cards()[0].props.onPress();});
  expect(mockStopTests).toHaveBeenCalledTimes(1);
  expect(onVideo).not.toHaveBeenCalled();
  expect(mockSpeedTests).toHaveBeenLastCalledWith(expect.any(Array), false);
  await act(async () => {finish!(); await selected;});
  expect(onVideo).toHaveBeenCalledTimes(1);
});

it('retains subtitle download and returns from subtitles to the common video picker', () => {
  const withSubs = {...streams[0], subtitles: [{uri: 'https://cdn.test/ru.vtt', language: 'RU', title: 'Russian', type: 'text/vtt'}]};
  mount({data: [withSubs]});
  act(() => button('Subtitle download sources').props.onPress());
  expect(cards()).toHaveLength(0);
  expect(button('Download subtitle Russian')).toBeDefined();
  act(() => button('Video download sources').props.onPress());
  expect(cards()).toHaveLength(1);
});

it('does not start probes or speed tests while closed', () => {
  mount({showModal: false});
  expect(mockSpeedTests).not.toHaveBeenCalled();
  expect(mockHealth).not.toHaveBeenCalled();
});

it('cancels a pending selection when dismissed instead of starting a hidden download', async () => {
  let finish: () => void;
  mockStopTests.mockImplementationOnce(() => new Promise<void>(resolve => {finish = resolve;}));
  mount();
  let choosing: Promise<void>;
  act(() => {choosing = cards()[0].props.onPress();});
  act(() => button('Cancel server selection').props.onPress());
  await act(async () => {finish!(); await choosing;});
  expect(onVideo).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledWith(false);
});

it('routes the internal alternative through cleanup when external downloads are preferred', async () => {
  mockExternal = true;
  mount();
  await act(async () => {await button('Download in Vega: Tracker 1').props.onPress();});
  expect(mockStopTests).toHaveBeenCalledTimes(1);
  expect(onVideo).toHaveBeenCalledWith(streams[0]);
  expect(onExternal).not.toHaveBeenCalled();
});

it('keeps watching connected to the tested swarm', async () => {
  act(() => {tree = renderer.create(<MovieServerDialog streams={streams} loading={false} onSelect={onVideo} onDismiss={close} />);});
  await act(async () => {await cards()[0].props.onPress();});
  expect(mockClaim).toHaveBeenCalledWith(hash(1));
  expect(mockStopTests).not.toHaveBeenCalled();
  expect(onVideo).toHaveBeenCalledWith(streams[0]);
});

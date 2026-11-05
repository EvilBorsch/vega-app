jest.mock('../src/lib/hooks/useSavedSubtitles', () => {
  const savedSubtitles: any[] = [];
  return {useSavedSubtitles: () => ({savedSubtitles})};
});
jest.mock('../src/lib/subtitles/savedSubtitles', () => ({
  subtitleVideoKey: () => '',
  savedSubtitleTrack: (track: any) => track,
}));
import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
const mockSaved = new Map<string, string>();
const mockGetStream = jest.fn();
const mockExtraStreams = jest.fn();
jest.mock('../src/lib/storage', () => ({
  settingsStorage: {getExcludedQualities: () => []},
  mainStorage: {
    getString: (key: string) => mockSaved.get(key),
    setString: (key: string, value: string) => mockSaved.set(key, value),
  },
}));
jest.mock('../src/lib/services/ProviderManager', () => ({
  providerManager: {getStream: (args: object) => mockGetStream(args)},
}));
jest.mock('../src/lib/providers/extraTorrentSources', () => ({
  ...jest.requireActual('../src/lib/providers/extraTorrentSources'),
  fetchExtraTorrentStreams: (...args: any[]) => mockExtraStreams(...args),
}));
jest.mock('../src/lib/file/ifExists', () => ({ifExists: async () => null}));
jest.mock('../src/lib/downloadDestination', () => ({
  downloadOutputExists: async () => false,
}));
jest.mock('../src/lib/zustand/downloadsStore', () => ({
  __esModule: true,
  default: {getState: () => ({downloads: {}})},
  isSubtitleDownloadItem: () => false,
}));
jest.mock('react-native-video', () => ({TextTrackType: {}}));
import {useStream} from '../src/lib/hooks/useStream';

const episode = (number: number) => ({
  title: `Episode ${number}`,
  link: JSON.stringify({imdbId: 'tt0903747', season: '2', episode: String(number), type: 'series', title: 'Breaking Bad'}),
});
const torrent = (hash: string, server: string, quality: string, extra: string[] = []) => ({
  server,
  quality,
  link: `magnet:?xt=urn:btih:${hash.repeat(40)}`,
  type: 'torrent',
  tags: [`${quality}p`, '👤12', ...extra, '2.1 GB'],
});
// Season pack: the same torrent is offered for every episode of the season.
const pack = torrent('a', 'RuTracker', '1080', ['HEVC', 'RU', 'LostFilm']);
const other = torrent('b', 'Kinozal', '2160', ['HDR']);

let params: any;
let activeEpisode = episode(1);
let streams: ReturnType<typeof useStream>;
let tree: renderer.ReactTestRenderer | undefined;
let client: QueryClient;
const Probe = ({current}: {current: any}) => {
  streams = useStream({activeEpisode: current, routeParams: params, provider: 'torrentio'});
  return null;
};
const settle = () => act(async () => {
  await new Promise(resolve => setTimeout(resolve, 30));
});
const mount = async () => {
  client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}><Probe current={activeEpisode} /></QueryClientProvider>,
    );
  });
  await settle();
};
const showEpisode = async (number: number) => {
  activeEpisode = episode(number);
  await act(async () => {
    tree!.update(<QueryClientProvider client={client}><Probe current={activeEpisode} /></QueryClientProvider>);
  });
  await settle();
};
const close = () => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
  client?.clear();
};

beforeEach(() => {
  mockSaved.clear();
  activeEpisode = episode(1);
  params = {type: 'series', providerValue: 'torrentio', infoUrl: 'tt0903747', playbackMode: 'play'};
  mockGetStream.mockReset().mockResolvedValue([other, pack]);
  mockExtraStreams.mockReset().mockResolvedValue([]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  close();
  jest.restoreAllMocks();
});

it('asks for a source and quality when an episode is opened', async () => {
  await mount();
  expect(streams.streamData).toHaveLength(2);
  expect(streams.selectedStream.link).toBe('');
  expect(streams.requiresServerSelection).toBe(true);
});

it('resumes an episode with the source it was watched with', async () => {
  await mount();
  act(() => streams.setSelectedStream(pack));
  close();
  params.playbackMode = 'resume';
  await mount();
  expect(streams.selectedStream.link).toBe(pack.link);
});

it('clicking the episode again asks again', async () => {
  await mount();
  act(() => streams.setSelectedStream(pack));
  close();
  await mount();
  expect(streams.selectedStream.link).toBe('');
});

it('resumes the next episode with the release last used for the series', async () => {
  await mount();
  act(() => streams.setSelectedStream(pack));
  close();
  activeEpisode = episode(2);
  params.playbackMode = 'resume';
  await mount();
  expect(streams.selectedStream.link).toBe(pack.link);
});

it('continues the same season pack on the next episode without asking', async () => {
  await mount();
  act(() => streams.setSelectedStream(pack));
  await showEpisode(2);
  expect(streams.selectedStream.link).toBe(pack.link);
  expect(streams.requiresServerSelection).toBe(false);
});

it('continues with the same tracker and quality when episodes are separate torrents', async () => {
  await mount();
  act(() => streams.setSelectedStream(pack));
  const nextRelease = torrent('c', 'RuTracker', '1080', ['HEVC', 'RU', 'LostFilm']);
  const otherDub = torrent('d', 'RuTracker', '1080', ['AVC', 'EN']);
  mockGetStream.mockResolvedValue([other, otherDub, nextRelease]);
  await showEpisode(2);
  expect(streams.selectedStream.link).toBe(nextRelease.link);
});

it('asks on the next episode when nothing like the chosen source is offered', async () => {
  await mount();
  act(() => streams.setSelectedStream(pack));
  mockGetStream.mockResolvedValue([other]);
  await showEpisode(2);
  expect(streams.selectedStream.link).toBe('');
  expect(streams.requiresServerSelection).toBe(true);
});

it('reopens the choice when an episode source fails instead of switching quality', async () => {
  await mount();
  act(() => streams.setSelectedStream(pack));
  act(() => { streams.switchToNextStream(); });
  expect(streams.selectedStream.link).toBe('');
  expect(streams.requiresServerSelection).toBe(true);
});

it('adds releases from other trackers to Torrentio results', async () => {
  const kinozal = torrent('e', 'Kinozal', '1080', ['RU']);
  mockExtraStreams.mockResolvedValue([kinozal]);
  await mount();
  expect(mockExtraStreams).toHaveBeenCalledWith(activeEpisode.link, 'series', expect.anything());
  expect(streams.streamData.map(stream => stream.link)).toEqual([other.link, pack.link, kinozal.link]);
});

it('still lists other trackers when Torrentio fails', async () => {
  const kinozal = torrent('e', 'Kinozal', '1080', ['RU']);
  mockGetStream.mockRejectedValue(new Error('Torrentio stream failed: HTTP 503'));
  mockExtraStreams.mockResolvedValue([kinozal]);
  await mount();
  expect(streams.error).toBeFalsy();
  expect(streams.streamData.map(stream => stream.link)).toEqual([kinozal.link]);
});

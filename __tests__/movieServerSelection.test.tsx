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
const episode = {link: 'https://provider/movie', title: 'Movie'};
const high = {
  server: 'Rutracker',
  quality: '2160',
  tag: '40 GB',
  link: 'magnet:?xt=urn:btih:AAAA',
  type: 'torrent',
};
const small = {
  server: 'Rutracker',
  quality: '1080',
  tag: '2.74 GB',
  link: 'magnet:?xt=urn:btih:BBBB',
  type: 'torrent',
};
let params: any;
let streams: ReturnType<typeof useStream>;
let tree: renderer.ReactTestRenderer | undefined;
let client: QueryClient;
const Probe = () => {
  streams = useStream({
    activeEpisode: episode,
    routeParams: params,
    provider: 'test',
  });
  return null;
};
const mount = async (sharedClient?: QueryClient) => {
  client =
    sharedClient ||
    new QueryClient({defaultOptions: {queries: {retry: false}}});
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });
};
const close = () => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
  client?.clear();
};
beforeEach(() => {
  mockSaved.clear();
  params = {
    type: 'movie',
    providerValue: 'test',
    infoUrl: 'movie',
    playbackMode: 'play',
  };
  mockGetStream.mockReset().mockResolvedValue([high, small]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  close();
  jest.restoreAllMocks();
});
it('waits for a server choice instead of starting the first/highest-quality torrent', async () => {
  await mount();
  expect(streams.streamData).toHaveLength(2);
  expect(streams.selectedStream.link).toBe('');
});
it('resumes the exact last selected torrent after closing and reopening the player', async () => {
  await mount();
  act(() => streams.setSelectedStream(small));
  close();
  params.playbackMode = 'resume';
  await mount();
  expect(streams.selectedStream.link).toBe(small.link);
});
it('Play still asks for a server after a previous choice', async () => {
  await mount();
  act(() => streams.setSelectedStream(small));
  close();
  await mount();
  expect(streams.selectedStream.link).toBe('');
});
it('resumes the same torrent when its live seeder count changes', async () => {
  mockGetStream.mockResolvedValue([{...small, tag: '1080p • 👤20 • 2.74 GB', tags: ['1080p', '👤20', '2.74 GB']}]);
  await mount();
  act(() => streams.setSelectedStream(streams.streamData[0]));
  close();
  params.playbackMode = 'resume';
  const refreshed = {...small, tag: '1080p • 👤17 • 2.74 GB', tags: ['1080p', '👤17', '2.74 GB']};
  mockGetStream.mockResolvedValue([high, refreshed]);
  await mount();
  expect(streams.selectedStream.link).toBe(small.link);
});
it('asks again if the remembered torrent disappears, even when another has the same server name', async () => {
  await mount();
  act(() => streams.setSelectedStream(small));
  close();
  params.playbackMode = 'resume';
  mockGetStream.mockResolvedValue([high]);
  await mount();
  expect(streams.selectedStream.link).toBe('');
});
it('restores the server with a fresh signed URL and never persists headers or URLs', async () => {
  const old = {
    server: 'CDN',
    quality: '1080',
    link: 'https://cdn/video?token=secret',
    type: 'mp4',
    headers: {Cookie: 'secret'},
  };
  mockGetStream.mockResolvedValue([high, old]);
  await mount();
  act(() => streams.setSelectedStream(old));
  close();
  expect([...mockSaved.values()].join()).not.toMatch(/secret|https:|Cookie/);
  const fresh = {...old, link: 'https://cdn/video?token=fresh'};
  params.playbackMode = 'resume';
  mockGetStream.mockResolvedValue([high, fresh]);
  await mount();
  expect(streams.selectedStream.link).toBe(fresh.link);
});
it('does not reuse the server remembered for another provider', async () => {
  await mount();
  act(() => streams.setSelectedStream(small));
  close();
  params = {...params, providerValue: 'other', playbackMode: 'resume'};
  await mount();
  expect(streams.selectedStream.link).toBe('');
});
it('waits for fresh servers on Resume and does not fall back from a cached torrent to the highest one', async () => {
  await mount();
  act(() => streams.setSelectedStream(small));
  const shared = client;
  act(() => tree!.unmount());
  tree = undefined;
  params.playbackMode = 'resume';
  let finish!: (value: any) => void;
  mockGetStream.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await mount(shared);
  expect(streams.selectedStream.link).toBe('');
  await act(async () => {
    finish([high]);
    await new Promise(resolve => setTimeout(resolve, 30));
  });
  expect(streams.selectedStream.link).toBe('');
});

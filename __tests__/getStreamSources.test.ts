const mockProvider = jest.fn();
const mockExtra = jest.fn();
jest.mock('expo-constants', () => ({__esModule: true, default: {expoConfig: {extra: {}}}}));
jest.mock('../src/lib/storage', () => ({settingsStorage: {getTmdbApiKey: () => ''}}));
jest.mock('../src/lib/services/ProviderManager', () => ({providerManager: {getStream: (args: unknown) => mockProvider(args)}}));
jest.mock('../src/lib/providers/extraTorrentSources', () => ({
  ...jest.requireActual('../src/lib/providers/extraTorrentSources'),
  fetchExtraTorrentStreams: (...args: unknown[]) => mockExtra(...args),
}));
import {getStreamSources} from '../src/lib/services/getStreamSources';
const primary = {server: 'Primary', type: 'torrent', link: `magnet:?xt=urn:btih:${'a'.repeat(40)}`};
const extra = {server: 'Russian tracker', type: 'torrent', link: `magnet:?xt=urn:btih:${'b'.repeat(40)}`};
beforeEach(() => {mockProvider.mockReset().mockResolvedValue([primary]); mockExtra.mockReset().mockResolvedValue([primary, extra]);});
it.each([false, true])('offers the same deduplicated extra tracker catalog for isDownload=%s', async isDownload => {
  const args = {link: 'movie:tt123', type: 'movie', providerValue: 'torrentio', isDownload};
  expect((await getStreamSources(args)).map(stream => stream.link)).toEqual([primary.link, extra.link]);
  expect(mockProvider).toHaveBeenCalledWith(args);
});
it('keeps Russian tracker results when Torrentio fails', async () => {
  mockProvider.mockRejectedValue(new Error('Provider unavailable'));
  expect(await getStreamSources({link: 'movie:tt123', type: 'movie', providerValue: 'torrentio', isDownload: true})).toHaveLength(2);
});
it('keeps other providers on their own downloadable catalog', async () => {
  expect(await getStreamSources({link: 'https://provider.test/movie', type: 'movie', providerValue: 'other', isDownload: true})).toEqual([primary]);
  expect(mockExtra).not.toHaveBeenCalled();
});

import {filterStreams, getStreamFilterOptions, streamLanguages} from '../src/lib/player/streamFilters';
const release = (quality: string, tag: string, server = 'Rutracker') => ({quality, tag, server, type: 'torrent', link: `magnet:${quality}:${tag}`});
const streams = [release('2160', '2160p • GB, RU • 23.98 GB'), release('1080', '1080p • RU • 2.74 GB'), release('1080', '1080p • EN • 2.4 GB'), release('720', '720p • MULTI • 1 GB')];
it('combines quality and language filters instead of selecting a source automatically', () => {
  expect(filterStreams(streams, ['1080'], ['RU'])).toEqual([streams[1]]);
});
it('allows several qualities and languages, matching either within each group', () => {
  expect(filterStreams(streams, ['1080', '2160'], ['RU', 'EN'])).toEqual(streams.slice(0, 3));
});
it('shows all sources when toggles are cleared, preserving provider order', () => {
  expect(filterStreams(streams, [], [])).toEqual(streams);
});
it('does not confuse gigabytes with the GB language code', () => {
  expect(streamLanguages(release('1080', '1080p • 2.74 GB'))).toEqual(['UNKNOWN']);
  expect(streamLanguages(streams[0])).toEqual(['RU', 'EN']);
});
it('recognizes flags, full language names and multilingual labels', () => {
  expect(streamLanguages(release('1080', 'Russian / English • Dual-Audio'))).toEqual(['RU', 'EN', 'MULTI']);
  expect(streamLanguages(release('1080', '🇷🇺 🇯🇵'))).toEqual(['RU', 'JA']);
});
it('offers only available qualities and languages, with 4K normalized', () => {
  expect(getStreamFilterOptions([...streams, release('4K', 'RU')])).toEqual({qualities: ['2160', '1080', '720'], languages: ['RU', 'EN', 'MULTI']});
});
it('keeps an empty filtered result empty until the user changes filters', () => {
  expect(filterStreams(streams, ['720'], ['RU'])).toEqual([]);
});

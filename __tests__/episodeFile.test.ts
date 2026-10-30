import {episodeTargetFromLink, pickVideoFileIndex} from '../src/lib/player/episodeFile';

const pack = (names: string[], largest: number) =>
  names.map((name, index) => ({index, name, path: `Slovo pacana/${name}`, size: index === largest ? 9e9 : 5e9 + index}));

const slovo = pack(
  Array.from({length: 8}, (_, i) => `Slovo.pacana.Krov.na.asfalte.S01.E0${i + 1}.2023.WEB-DL.2160p.SDR.mkv`),
  7,
);

it('plays the requested episode from a season pack instead of the largest file', () => {
  expect(pickVideoFileIndex(slovo, {season: 1, episode: 1})).toBe(0);
  expect(pickVideoFileIndex(slovo, {season: 1, episode: 5})).toBe(4);
});

it('recognises the episode naming used by other releases', () => {
  const names = (pattern: (n: number) => string) =>
    pack([1, 2, 3].map(pattern), 2);
  expect(pickVideoFileIndex(names(n => `Word_Of_Pacan_S01_E0${n}_4K_5.1_sound.mkv`), {season: 1, episode: 2})).toBe(1);
  expect(pickVideoFileIndex(names(n => `Show.1x0${n}.1080p.mkv`), {season: 1, episode: 2})).toBe(1);
  expect(pickVideoFileIndex(names(n => `Слово пацана. Серия ${n}.mkv`), {season: 1, episode: 2})).toBe(1);
  expect(pickVideoFileIndex(names(n => `Show Episode ${n} (2023) 1080p.mkv`), {season: 1, episode: 2})).toBe(1);
  expect(pickVideoFileIndex(names(n => `S01E0${n}.mkv`), {season: 1, episode: 3})).toBe(2);
});

it('does not take another season episode with the same number', () => {
  const files = [
    {index: 0, name: 'Show.S01E02.mkv', path: 'Show/Season 1/Show.S01E02.mkv', size: 9e9},
    {index: 1, name: 'Show.S02E02.mkv', path: 'Show/Season 2/Show.S02E02.mkv', size: 5e9},
  ];
  expect(pickVideoFileIndex(files, {season: 2, episode: 2})).toBe(1);
});

it('falls back to episode order when names carry no episode numbers', () => {
  const files = ['b-final.mkv', 'a-pilot.mkv', 'a-second.mkv'].map((name, index) => ({index, name, path: name, size: index === 0 ? 9e9 : 4e9}));
  expect(pickVideoFileIndex(files, {season: 1, episode: 1})).toBe(1);
});

it('ignores samples, extras and non-video files', () => {
  const files = [
    {index: 0, name: 'Show.S01E01.sample.mkv', path: 'Show.S01E01.sample.mkv', size: 3e7},
    {index: 1, name: 'Show.S01E01.srt', path: 'Show.S01E01.srt', size: 9e4},
    {index: 2, name: 'Show.S01E01.1080p.mkv', path: 'Show.S01E01.1080p.mkv', size: 2e9},
  ];
  expect(pickVideoFileIndex(files, {season: 1, episode: 1})).toBe(2);
});

it('keeps choosing the largest video for movies', () => {
  const files = [
    {index: 0, name: 'movie.sample.mkv', path: 'movie.sample.mkv', size: 1e7},
    {index: 1, name: 'movie.2160p.mkv', path: 'movie.2160p.mkv', size: 2e10},
    {index: 2, name: 'extras.mkv', path: 'extras.mkv', size: 1e9},
  ];
  expect(pickVideoFileIndex(files)).toBe(1);
});

it('reads season and episode from Torrentio episode links only', () => {
  expect(episodeTargetFromLink('{"imdbId":"tt28429213","season":"1","episode":"1","type":"series"}'))
    .toEqual({season: 1, episode: 1});
  expect(episodeTargetFromLink('{"imdbId":"tt13833688","type":"movie"}')).toBeUndefined();
  expect(episodeTargetFromLink('magnet:?xt=urn:btih:abc')).toBeUndefined();
  expect(episodeTargetFromLink(undefined)).toBeUndefined();
});

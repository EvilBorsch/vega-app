const mockSaved: Record<string, unknown> = {};
jest.mock('../src/lib/storage', () => ({
  mainStorage: {getString: () => undefined, setString: () => {}},
  cacheStorage: {getObject: (key: string) => mockSaved[key], setObject: (key: string, value: unknown) => { mockSaved[key] = value; }},
}));
jest.mock('../src/lib/torrentManager', () => ({torrentManager: {testSwarms: jest.fn(), cancelSwarmTests: jest.fn()}}));

import {
  describeProgress,
  describeTest,
  expectedSpeed,
  nextToTest,
  sortBySpeed,
  testProgress,
  useSwarmTestStore,
  withKnownPeers,
  type SwarmTestResult,
} from '../src/lib/player/swarmTests';
import {badgeLabel} from '../src/lib/player/streamBadges';
import {defaultStreamFilters} from '../src/lib/player/streamFilters';

const release = (hash: string, quality: string, tags: string[] = []) => ({
  server: 'Tracker',
  link: `magnet:?xt=urn:btih:${hash.repeat(40)}`,
  type: 'torrent',
  quality,
  tags,
});
const result = (extra: Partial<SwarmTestResult>): SwarmTestResult => ({
  peers: 10, seeds: 6, known: 30, metadata: true, speed: 0, maxSpeed: 0, peerList: [], testedAt: Date.now(), ...extra,
});

const fast = release('a', '1080', ['👤3']);
const slow = release('b', '2160', ['👤200']);
const untestedBig = release('c', '1080', ['👤40']);
const untestedSmall = release('d', '2160', ['≈90 seeders (02.2026)']);
const dead = release('e', '1080', ['👤12']);
const results = {
  ['a'.repeat(40)]: result({speed: 4 * 1024 * 1024}),
  ['b'.repeat(40)]: result({speed: 150 * 1024, seeds: 2}),
  ['e'.repeat(40)]: result({metadata: false, peers: 0}),
};
// A 10-second test is noisy: slow is ranked below unknown, not as dead.


it('orders fast measured releases, then untested by swarm size, then slow ones, unanswered last', () => {
  const sorted = sortBySpeed([dead, untestedSmall, slow, untestedBig, fast], results, 'speed');
  expect(sorted.map(stream => stream.link[20])).toEqual(['a', 'c', 'd', 'b', 'e']);
});

it('can put quality first and speed second', () => {
  const sorted = sortBySpeed([dead, untestedSmall, slow, untestedBig, fast], results, 'quality');
  expect(sorted.map(stream => stream.link[20])).toEqual(['d', 'b', 'a', 'c', 'e']);
});

it('keeps direct links above torrents that depend on a swarm', () => {
  const direct = {server: 'CDN', link: 'https://cdn/video.mp4', type: 'mp4', quality: '720'};
  expect(sortBySpeed([fast, direct], results, 'speed')[0]).toBe(direct);
});

it('describes a measured release in words a viewer can act on', () => {
  expect(describeTest(result({speed: 3.2 * 1024 * 1024, peers: 18, seeds: 12}))).toEqual({text: '3.2 MB/s · 18 peers (12 seeds)', tone: 'good'});
  expect(describeTest(result({speed: 100 * 1024}))?.tone).toBe('bad');
  expect(describeTest(result({metadata: false, peers: 0}))).toEqual({text: "No peers answered in 10 s — likely won't play", tone: 'bad'});
  expect(describeTest(result({peers: 0}))?.text).toBe('Torrent info received, but no peer is sending data yet');
  expect(describeTest(undefined, true)?.tone).toBe('pending');
  expect(describeTest(undefined, false)).toBeUndefined();
});

it('ranks untested releases by live seeders above old snapshots', () => {
  expect(expectedSpeed(untestedBig)).toBeGreaterThan(expectedSpeed(untestedSmall));
});

it('hands the player the peers a test connected to', () => {
  const link = withKnownPeers(fast.link, result({peerList: ['tcp://1.2.3.4:51413', '[2001:db8::1]:6881', 'garbage']}));
  expect(link).toBe(`${fast.link}&x.pe=1.2.3.4%3A51413&x.pe=%5B2001%3Adb8%3A%3A1%5D%3A6881`);
  expect(withKnownPeers('https://cdn/video.mp4', result({peerList: ['1.2.3.4:1']}))).toBe('https://cdn/video.mp4');
});

it('tests untested torrents a batch at a time', () => {
  const list = [fast, slow, untestedBig, untestedSmall, dead];
  const triedTwice = {['e'.repeat(40)]: 2};
  expect(nextToTest(list, results, {}, triedTwice)).toEqual(['c'.repeat(40), 'd'.repeat(40)]);
  expect(nextToTest(list, results, {['c'.repeat(40)]: true}, triedTwice)).toEqual(['d'.repeat(40)]);
});

it('tests a release that did not answer once more', () => {
  const list = [dead];
  expect(nextToTest(list, results, {}, {['e'.repeat(40)]: 1})).toEqual(['e'.repeat(40)]);
  expect(nextToTest(list, results, {}, {['e'.repeat(40)]: 2})).toEqual([]);
});

it('labels seeder and DHT badges in words', () => {
  expect(badgeLabel('👤12')).toBe('12 seeders');
  expect(badgeLabel('👥40')).toBe('~40 peers in DHT');
  expect(badgeLabel('HEVC')).toBe('HEVC');
});

it('ranks untested releases by seeders and leechers', () => {
  expect(expectedSpeed(release('f', '1080', ['👤10', '⬇30']))).toBeGreaterThan(expectedSpeed(release('g', '1080', ['👤10'])));
  expect(badgeLabel('⬇30')).toBe('30 leechers');
});

it('reports how far the speed check has come', () => {
  const progress = testProgress([fast, slow, untestedBig, dead], results, {['c'.repeat(40)]: true});
  expect(progress).toEqual({total: 4, tested: 3, testing: 1});
  expect(describeProgress(progress)).toBe('Checking speed: 3 of 4 releases done, 1 in progress…');
  expect(describeProgress({total: 4, tested: 4, testing: 0})).toBe('Speed checked for 4 of 4 releases · fastest first');
  expect(describeProgress({total: 0, tested: 0, testing: 0})).toBeUndefined();
});

it('keeps results for the next time the list opens', () => {
  useSwarmTestStore.getState().start(['f'.repeat(40)]);
  useSwarmTestStore.getState().finish(['f'.repeat(40)], {['f'.repeat(40)]: result({speed: 2e6})});
  const saved = mockSaved['SwarmTests:v1'] as Record<string, {speed: number}>;
  expect(saved['f'.repeat(40)].speed).toBe(2e6);
});

describe('default source filters', () => {
  const stream = (quality: string, tags: string[]) => ({quality, tags});
  it('opens on Russian audio at the best quality available in Russian', () => {
    expect(defaultStreamFilters([stream('2160', ['EN']), stream('1080', ['RU']), stream('720', ['RU'])]))
      .toEqual({languages: ['RU'], qualities: ['1080']});
  });
  it('falls back to English, and to every language when neither is listed', () => {
    expect(defaultStreamFilters([stream('2160', ['EN']), stream('1080', ['FR'])])).toEqual({languages: ['EN'], qualities: ['2160']});
    expect(defaultStreamFilters([stream('720', ['FR'])])).toEqual({languages: [], qualities: ['720']});
    expect(defaultStreamFilters([])).toEqual({languages: [], qualities: []});
  });
});

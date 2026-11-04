jest.mock('../src/lib/storage', () => ({mainStorage: {getString: () => undefined, setString: () => {}}}));
jest.mock('../src/lib/torrentManager', () => ({torrentManager: {testSwarms: jest.fn(), cancelSwarmTests: jest.fn()}}));

import {
  describeTest,
  expectedSpeed,
  nextToTest,
  sortBySpeed,
  withKnownPeers,
  type SwarmTestResult,
} from '../src/lib/player/swarmTests';
import {badgeLabel} from '../src/lib/player/streamBadges';

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

it('orders by measured speed, then untested by swarm size, and failed releases last', () => {
  const sorted = sortBySpeed([dead, untestedSmall, slow, untestedBig, fast], results, 'speed');
  expect(sorted.map(stream => stream.link[20])).toEqual(['a', 'b', 'c', 'd', 'e']);
});

it('can put quality first and speed second', () => {
  const sorted = sortBySpeed([dead, untestedSmall, slow, untestedBig, fast], results, 'quality');
  expect(sorted.map(stream => stream.link[20])).toEqual(['b', 'd', 'a', 'c', 'e']);
});

it('keeps direct links above torrents that depend on a swarm', () => {
  const direct = {server: 'CDN', link: 'https://cdn/video.mp4', type: 'mp4', quality: '720'};
  expect(sortBySpeed([fast, direct], results, 'speed')[0]).toBe(direct);
});

it('describes a measured release in words a viewer can act on', () => {
  expect(describeTest(result({speed: 3.2 * 1024 * 1024, peers: 18, seeds: 12}))).toEqual({text: '3.2 MB/s · 18 peers (12 seeds)', tone: 'good'});
  expect(describeTest(result({speed: 100 * 1024}))?.tone).toBe('bad');
  expect(describeTest(result({metadata: false, peers: 0}))).toEqual({text: 'No peers connected — will not play', tone: 'bad'});
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
  expect(nextToTest(list, results, {})).toEqual(['c'.repeat(40), 'd'.repeat(40)]);
  expect(nextToTest(list, results, {['c'.repeat(40)]: true})).toEqual(['d'.repeat(40)]);
});

it('labels seeder and DHT badges in words', () => {
  expect(badgeLabel('👤12')).toBe('12 seeders');
  expect(badgeLabel('👥40')).toBe('~40 peers in DHT');
  expect(badgeLabel('HEVC')).toBe('HEVC');
});

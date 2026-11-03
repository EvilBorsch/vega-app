const mockSaved = new Map<string, string>();
jest.mock('../src/lib/storage', () => ({
  mainStorage: {
    getString: (key: string) => mockSaved.get(key),
    setString: (key: string, value: string) => mockSaved.set(key, value),
  },
}));
jest.mock('../src/lib/torrentManager', () => ({torrentManager: {probeSwarms: jest.fn()}}));

import {
  applySwarmHealth,
  deadReleases,
  markReleaseDead,
  probeIsConclusive,
} from '../src/lib/player/swarmHealth';

const release = (hash: string, tags: string[] = []) => ({
  server: 'Kinozal',
  link: `magnet:?xt=urn:btih:${hash.repeat(40)}&tr=udp%3A%2F%2Fopentor.net%3A6969`,
  type: 'torrent',
  tags,
});
const alive = release('a', ['1080p', '≈40 seeders (02.2026)']);
const dead = release('b', ['1080p', '≈12 seeders (02.2026)']);
const seeded = release('c', ['1080p', '👤7']);
const direct = {server: 'CDN', link: 'https://cdn/video.mp4', type: 'mp4'};
const probe = {peers: {['a'.repeat(40)]: 31, ['b'.repeat(40)]: 0, ['c'.repeat(40)]: 0}};

beforeEach(() => mockSaved.clear());

it('hides releases nobody shares and labels the ones the DHT found', () => {
  const {visible, hidden} = applySwarmHealth([alive, dead, seeded, direct], probe, new Set(), new Set());
  expect(visible.map(stream => stream.server)).toEqual(['Kinozal', 'Kinozal', 'CDN']);
  expect(visible[0].tags).toContain('👥31');
  // A fresh seeder count from an index outweighs an empty DHT lookup.
  expect(visible[1].link).toBe(seeded.link);
  expect(hidden.map(stream => stream.link)).toEqual([dead.link]);
  expect(hidden[0].tags).toContain('No peers');
});

it('hides nothing when the DHT found nobody at all (unreachable or cold)', () => {
  const empty = {peers: {['a'.repeat(40)]: 0, ['b'.repeat(40)]: 0}};
  expect(probeIsConclusive(empty)).toBe(false);
  expect(applySwarmHealth([alive, dead], empty, new Set(), new Set()).hidden).toEqual([]);
  expect(applySwarmHealth([alive, dead], undefined, new Set(), new Set()).hidden).toEqual([]);
});

it('keeps the playing and the remembered release whatever the probe says', () => {
  expect(applySwarmHealth([dead], probe, new Set(), new Set([dead.link])).hidden).toEqual([]);
  expect(applySwarmHealth([dead], probe, new Set(), new Set(['b'.repeat(40)])).hidden).toEqual([]);
});

it('drops a release that found no peer when played, even if Resume remembers it, for a day', () => {
  const now = Date.parse('2026-11-04T00:00:00Z');
  markReleaseDead('A'.repeat(40), now);
  expect(deadReleases(now + 60_000).has('a'.repeat(40))).toBe(true);
  const {hidden} = applySwarmHealth([alive], undefined, deadReleases(now + 60_000), new Set(['a'.repeat(40)]));
  expect(hidden.map(stream => stream.link)).toEqual([alive.link]);
  expect(deadReleases(now + 25 * 60 * 60 * 1000).size).toBe(0);
});

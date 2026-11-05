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

describe('live counts from public trackers', () => {
  const {withLiveCounts} = require('../src/lib/player/swarmHealth');
  const stale = {server: 'RuTracker', link: `magnet:?xt=urn:btih:${'f'.repeat(40)}`, type: 'torrent',
    tags: ['1080p', '≈4086 seeders (02.2026)', 'RU', '9.1 GB'], tag: '1080p • ≈4086 seeders (02.2026) • RU • 9.1 GB'};

  it('replaces an old index snapshot with what the trackers say now', () => {
    // JacRed's count matched a live scrape for only 15% of releases.
    const live = withLiveCounts(stale, {seeders: 187, leechers: 40});
    expect(live.tags).toEqual(['1080p', '👤187', '⬇40', 'RU', '9.1 GB']);
    expect(live.tag).toBe('1080p • 👤187 • ⬇40 • RU • 9.1 GB');
  });

  it('keeps a higher live count an index already had, and changes nothing without data', () => {
    const torrentio = {...stale, tags: ['1080p', '👤20', '2.74 GB'], tag: '1080p • 👤20 • 2.74 GB'};
    expect(withLiveCounts(torrentio, {seeders: 12, leechers: 0}).tags).toEqual(['1080p', '👤20', '2.74 GB']);
    expect(withLiveCounts(stale, {seeders: 0, leechers: 0})).toBe(stale);
    expect(withLiveCounts(stale, undefined)).toBe(stale);
  });

  it('shows live counts in the list and keeps a release the trackers say is seeded', () => {
    const probe = {peers: {[`${'f'.repeat(40)}`]: 0, [`${'e'.repeat(40)}`]: 3, [`${'d'.repeat(40)}`]: 4}};
    const {visible} = applySwarmHealth([stale], probe, new Set(), new Set(), {[`${'f'.repeat(40)}`]: {seeders: 5, leechers: 1}});
    expect(visible).toHaveLength(1);
    expect(visible[0].tags).toContain('👤5');
  });
});

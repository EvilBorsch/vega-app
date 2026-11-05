const mockSaved: Record<string, unknown> = {};
jest.mock('../src/lib/storage', () => ({
  mainStorage: {getString: () => undefined, setString: () => {}},
  cacheStorage: {getObject: (key: string) => mockSaved[key], setObject: (key: string, value: unknown) => { mockSaved[key] = value; }},
}));
jest.mock('../src/lib/torrentManager', () => ({torrentManager: {monitorSwarms: jest.fn(), swarmStats: jest.fn(), stopSwarmMonitor: jest.fn()}}));

import {
  describeProgress,
  describeTest,
  expectedSpeed,
  nextToTest,
  sampleState,
  settleSample,
  slowLanguageHint,
  sortBySpeed,
  testProgress,
  useSwarmTestStore,
  useSwarmTests,
  withKnownPeers,
  withProvisional,
  type LiveSample,
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
  expect(describeTest(result({metadata: false, peers: 0}))).toEqual({text: "No peers answered — likely won't play", tone: 'bad'});
  expect(describeTest(result({peers: 0}))?.text).toBe('Torrent info received, but no peer is sending data yet');
  // Nothing arrived from connected peers: words, not "1 KB/s".
  expect(describeTest(result({speed: 300, maxSpeed: 0, peers: 3, seeds: 1}))).toEqual({text: 'No video data in 30 s · 3 peers (1 seeds) connected', tone: 'bad'});
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
    const ru = (quality: string, count: number) => Array.from({length: count}, () => stream(quality, ['RU']));
    expect(defaultStreamFilters([stream('2160', ['EN']), ...ru('1080', 5), ...ru('720', 3)]))
      .toEqual({languages: ['RU'], qualities: ['1080']});
  });
  it('adds the next qualities down until there are a few releases to choose from', () => {
    // American Crime Story S03E08 in Russian: two 1080p releases, three 720p.
    const ru = (quality: string, count: number) => Array.from({length: count}, () => stream(quality, ['RU']));
    expect(defaultStreamFilters([...ru('1080', 2), ...ru('720', 3), ...ru('480', 2)]))
      .toEqual({languages: ['RU'], qualities: ['1080', '720']});
  });
  it('falls back to English, and to every language when neither is listed', () => {
    expect(defaultStreamFilters([stream('2160', ['EN']), stream('1080', ['FR'])])).toEqual({languages: ['EN'], qualities: ['2160']});
    expect(defaultStreamFilters([stream('720', ['FR'])])).toEqual({languages: [], qualities: ['720']});
    expect(defaultStreamFilters([])).toEqual({languages: [], qualities: []});
  });
});

it('tests releases again on request', () => {
  const hash = '9'.repeat(40);
  useSwarmTestStore.getState().finish([hash], {[hash]: result({metadata: false, peers: 0})});
  expect(useSwarmTestStore.getState().results[hash]).toBeDefined();
  useSwarmTestStore.getState().recheck([hash]);
  expect(useSwarmTestStore.getState().results[hash]).toBeUndefined();
  expect(useSwarmTestStore.getState().failures[hash]).toBeUndefined();
});

it('offers English when every Russian release measured slow', () => {
  // American Crime Story S3: the best Russian pack gave 0.8 MB/s, the English one 4 MB/s.
  const ru = (hash: string) => ({...release(hash, '1080', ['👤19']), tags: ['👤19', 'RU']});
  const en = {...release('8', '1080', ['👤22']), tags: ['👤22', 'EN']};
  const listed = [ru('5'), ru('6'), ru('7')];
  const slow = {
    ['5'.repeat(40)]: result({speed: 800 * 1024}),
    ['6'.repeat(40)]: result({metadata: false, peers: 0}),
    ['7'.repeat(40)]: result({speed: 200, maxSpeed: 0}),
  };
  expect(slowLanguageHint(listed, [...listed, en], slow, ['RU'])).toEqual({
    language: 'EN', text: 'Russian releases are slow here (fastest 800 KB/s). English ones may be faster.',
  });
  // Not while too few are measured, not when one is fast, not without English releases.
  expect(slowLanguageHint(listed, [...listed, en], {['5'.repeat(40)]: slow['5'.repeat(40)]}, ['RU'])).toBeUndefined();
  expect(slowLanguageHint(listed, [...listed, en], {...slow, ['6'.repeat(40)]: result({speed: 3e6})}, ['RU'])).toBeUndefined();
  expect(slowLanguageHint(listed, listed, slow, ['RU'])).toBeUndefined();
});

describe('live measuring', () => {
  const sample = (extra: Partial<LiveSample>): LiveSample => ({
    metadata: true, elapsedMs: 10_000, dataMs: 5_000, bytes: 0, rate: 0, maxRate: 0,
    peers: 8, seeds: 3, maxPeers: 8, maxSeeds: 3, known: 40, done: false, peerList: [], ...extra,
  });
  const MB = 1024 * 1024;

  it('judges a fast, steady release after a few seconds and a slow one only after 30 s', () => {
    expect(settleSample(sample({dataMs: 6_000, bytes: 12 * MB, rate: 2 * MB}))?.speed).toBeCloseTo(2 * MB, -3);
    // Fast on average but falling off: keep watching.
    expect(settleSample(sample({dataMs: 6_000, bytes: 12 * MB, rate: 100 * 1024}))).toBeUndefined();
    expect(settleSample(sample({dataMs: 20_000, bytes: 4 * MB, rate: 200 * 1024}))).toBeUndefined();
    expect(settleSample(sample({dataMs: 30_000, bytes: 6 * MB, rate: 200 * 1024}))?.speed).toBeCloseTo(6 * MB / 30, -3);
    expect(settleSample(sample({done: true, dataMs: 3_000, bytes: 24 * MB}))?.speed).toBeCloseTo(8 * MB, -3);
  });

  it('keeps watching a release that sends nothing for up to 2 minutes', () => {
    // Small swarms often start late; they are not written off at 45 s.
    expect(settleSample(sample({metadata: false, elapsedMs: 60_000, dataMs: 0}))).toBeUndefined();
    expect(settleSample(sample({metadata: false, elapsedMs: 120_000, dataMs: 0}))).toMatchObject({metadata: false});
    expect(settleSample(sample({elapsedMs: 50_000, dataMs: 40_000, bytes: 100 * 1024}))).toBeUndefined();
    expect(settleSample(sample({elapsedMs: 120_000, dataMs: 110_000, bytes: 100 * 1024}))).toMatchObject({metadata: true});
  });

  it('lets a stalled release go on in the background without holding a slot', () => {
    expect(sampleState(undefined)).toBe('starting');
    expect(sampleState(sample({metadata: false, elapsedMs: 5_000}))).toBe('starting');
    expect(sampleState(sample({metadata: false, elapsedMs: 9_000}))).toBe('stalled');
    expect(sampleState(sample({dataMs: 7_000, rate: 0}))).toBe('stalled');
    expect(sampleState(sample({dataMs: 7_000, rate: 500 * 1024}))).toBe('downloading');
    expect(describeTest(undefined, true, sample({dataMs: 7_000, rate: 0}))?.text).toBe('No video yet · 8 peers (3 seeds) · still trying');
  });

  it('shows the speed so far while measuring and ranks by it once it is fast', () => {
    const live = {['a'.repeat(40)]: sample({dataMs: 9_000, bytes: 18 * MB, rate: 2 * MB})};
    expect(describeTest(undefined, true, live['a'.repeat(40)])).toEqual({text: 'Measuring… 2.0 MB/s · 8 peers (3 seeds)', tone: 'pending'});
    const merged = withProvisional({}, live);
    expect(merged['a'.repeat(40)]).toMatchObject({provisional: true});
    const sorted = sortBySpeed([untestedBig, fast], merged, 'speed');
    expect(sorted[0]).toBe(fast);
    // A slow start does not push a release below the unmeasured ones.
    const slowStart = withProvisional({}, {['a'.repeat(40)]: sample({dataMs: 9_000, bytes: 1024, rate: 1024})});
    const measuredSlow = {...slowStart, ['b'.repeat(40)]: results['b'.repeat(40)]};
    expect(sortBySpeed([slow, fast], measuredSlow, 'speed')[0]).toBe(fast);
  });
});

it('tests equivalent encoded torrent identities once and reuses a running or completed check', () => {
  const hash = '0123456789abcdef0123456789abcdef01234567';
  const list = [
    {...fast, link: 'magnet:?xt=urn:btih:AERUKZ4JVPG66AJDIVTYTK6N54ASGRLH'},
    {...fast, link: 'magnet:?xt=urn%3Abtih%3A0123456789abcdef0123456789abcdef01234567'},
  ];
  expect(nextToTest(list, {}, {})).toEqual([hash]);
  expect(nextToTest(list, {}, {[hash]: true})).toEqual([]);
  const saved = {[hash]: result({speed: 2e6})};
  expect(nextToTest(list, saved, {})).toEqual([]);
  expect(testProgress(list, saved, {})).toEqual({total: 1, tested: 1, testing: 0});
});

it('prioritizes never-measured releases before retrying a failed one', () => {
  const retry = release('9', '1080');
  const untouched = release('8', '1080');
  expect(nextToTest([retry, untouched], {['9'.repeat(40)]: result({metadata: false})}, {}, {['9'.repeat(40)]: 1}))
    .toEqual(['8'.repeat(40), '9'.repeat(40)]);
});

it('measures the entire queue beyond the first 24 and promotes a fast release from its end', async () => {
  const React = require('react');
  const {act, create} = require('react-test-renderer');
  const {Platform} = require('react-native');
  const {torrentManager} = require('../src/lib/torrentManager');
  const originalOS = Platform.OS;
  Platform.OS = 'android';
  jest.useFakeTimers();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  useSwarmTestStore.setState({results: {}, running: {}, live: {}, failures: {}});
  const list = Array.from({length: 35}, (_, index) => ({server: 'Tracker', type: 'torrent', link: `magnet:?xt=urn:btih:${(index + 1).toString(16).padStart(40, '0')}`, tags: [`👤${100 - index}`]}));
  torrentManager.monitorSwarms.mockResolvedValue(undefined);
  torrentManager.stopSwarmMonitor.mockResolvedValue(undefined);
  torrentManager.swarmStats.mockImplementation(async (hashes: string[]) => Object.fromEntries(hashes.map(hash => {
    const speed = parseInt(hash, 16) * 100_000;
    return [hash, {metadata: true, elapsedMs: 10_000, dataMs: 10_000, bytes: speed * 10, rate: speed, maxRate: speed, peers: 5, seeds: 3, maxPeers: 5, maxSeeds: 3, known: 8, done: true, peerList: []}];
  })));
  let tree: any;
  function Probe() { useSwarmTests(list, true); return null; }
  try {
    await act(async () => { tree = create(React.createElement(Probe)); });
    for (let i = 0; i < 12; i++) await act(async () => { jest.advanceTimersByTime(1000); });
    const completed = useSwarmTestStore.getState().results;
    expect(Object.keys(completed)).toHaveLength(35);
    expect(sortBySpeed(list, completed, 'speed')[0].link).toBe('magnet:?xt=urn:btih:0000000000000000000000000000000000000023');
    const started = torrentManager.monitorSwarms.mock.calls.flatMap((call: any[]) => call[0]);
    expect(started).toHaveLength(35);
  } finally {
    await act(async () => { tree?.unmount(); });
    jest.useRealTimers();
    Platform.OS = originalOS;
    useSwarmTestStore.setState({results: {}, running: {}, live: {}, failures: {}});
  }
});

it('gives untouched tail releases priority over expired early results', () => {
  const early = release('1', '1080');
  const tail = release('2', '1080');
  const expired = result({testedAt: Date.now() - 31 * 60 * 1000, speed: 500_000});
  expect(nextToTest([early, tail], {['1'.repeat(40)]: expired}, {})).toEqual(['2'.repeat(40), '1'.repeat(40)]);
});

async function runSchedulerFixture(monitor: any, stats: any, check: (control: any) => Promise<void>) {
  const React = require('react');
  const {act, create} = require('react-test-renderer');
  const {Platform} = require('react-native');
  const {torrentManager} = require('../src/lib/torrentManager');
  const originalOS = Platform.OS;
  Platform.OS = 'android';
  jest.useFakeTimers();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  useSwarmTestStore.setState({results: {}, running: {}, live: {}, failures: {}});
  torrentManager.monitorSwarms.mockReset().mockImplementation(monitor);
  torrentManager.swarmStats.mockReset().mockImplementation(stats);
  torrentManager.stopSwarmMonitor.mockReset().mockResolvedValue(undefined);
  const list = Array.from({length: 8}, (_, index) => ({server: 'Tracker', type: 'torrent', link: `magnet:?xt=urn:btih:${(index + 1).toString(16).padStart(40, '0')}`}));
  let tree: any;
  function Probe({enabled}: {enabled: boolean}) { useSwarmTests(list, enabled); return null; }
  try {
    await act(async () => { tree = create(React.createElement(Probe, {enabled: true})); });
    await check({torrentManager,
      tick: async (seconds: number) => { for (let i = 0; i < seconds; i++) await act(async () => { jest.advanceTimersByTime(1000); }); },
      enable: async (enabled: boolean) => { await act(async () => tree.update(React.createElement(Probe, {enabled}))); },
      act,
    });
  } finally {
    await act(async () => { tree?.unmount(); });
    jest.useRealTimers();
    Platform.OS = originalOS;
    useSwarmTestStore.setState({results: {}, running: {}, live: {}, failures: {}});
  }
}

it('moves past monitors that never return any sample', async () => {
  await runSchedulerFixture(async () => undefined, async () => ({}), async ({tick}) => {
    await tick(35);
    const results = useSwarmTestStore.getState().results;
    expect(Object.keys(results)).toHaveLength(8);
    expect(describeTest(results['0000000000000000000000000000000000000001'])?.text).toBe('Speed check unavailable');
  });
});

it('gives other releases a chance after a monitor start error', async () => {
  await runSchedulerFixture(async () => { throw new Error('start failed'); }, async () => ({}), async ({tick}) => {
    await tick(10);
    expect(Object.keys(useSwarmTestStore.getState().results)).toHaveLength(8);
  });
});

it('waits for the old stop operation before starting a reopened source list', async () => {
  await runSchedulerFixture(async () => undefined, async () => ({}), async ({torrentManager, enable, act}) => {
    let finishStop!: () => void;
    torrentManager.stopSwarmMonitor.mockImplementationOnce(() => new Promise<void>(resolve => { finishStop = resolve; }));
    await enable(false);
    await enable(true);
    expect(torrentManager.monitorSwarms).toHaveBeenCalledTimes(1);
    await act(async () => { finishStop(); });
    expect(torrentManager.monitorSwarms).toHaveBeenCalledTimes(2);
  });
});

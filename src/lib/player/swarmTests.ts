import {useEffect} from 'react';
import {Platform} from 'react-native';
import {create} from 'zustand';
import {torrentManager} from '../torrentManager';
import type {Stream} from '../providers/types';
import {liveSeeders, streamInfoHash} from './swarmHealth';
import {streamQuality} from './streamFilters';

/** What briefly joining a release's swarm showed (TorrentModule.testSwarms). */
export type SwarmTestResult = {
  /** Peers that connected, seeds among them, peers trackers/DHT named. */
  peers: number;
  seeds: number;
  known: number;
  metadata: boolean;
  /** Bytes per second over the last seconds of the test, and the peak. */
  speed: number;
  maxSpeed: number;
  /** Addresses of peers that connected, to hand the player straight away. */
  peerList: string[];
  testedAt: number;
};

/** Candidates tested at once; enough to fill the first screen of the list. */
export const SWARM_TEST_BATCH = 8;
export const SWARM_TEST_SECONDS = 10;
// Swarms change slowly; a result stays useful for the session's next choices.
const RESULT_TTL_MS = 15 * 60 * 1000;

type SwarmTestState = {
  results: Record<string, SwarmTestResult>;
  running: Record<string, true>;
  start: (hashes: string[]) => void;
  finish: (hashes: string[], results: Record<string, Omit<SwarmTestResult, 'testedAt'>>) => void;
};

export const useSwarmTestStore = create<SwarmTestState>(set => ({
  results: {},
  running: {},
  start: hashes => set(state => ({running: {...state.running, ...Object.fromEntries(hashes.map(hash => [hash, true as const]))}})),
  finish: (hashes, results) => set(state => {
    const running = {...state.running};
    for (const hash of hashes) delete running[hash];
    const now = Date.now();
    const next = {...state.results};
    for (const [hash, result] of Object.entries(results)) next[hash] = {...result, testedAt: now};
    return {running, results: next};
  }),
}));

export const freshResult = (results: Record<string, SwarmTestResult>, hash?: string): SwarmTestResult | undefined => {
  const result = hash ? results[hash] : undefined;
  return result && Date.now() - result.testedAt < RESULT_TTL_MS ? result : undefined;
};

/** A tested release that connected to nobody or got no torrent info. */
export const testFailed = (result?: SwarmTestResult) =>
  Boolean(result && (!result.metadata || result.peers === 0));

/**
 * Expected speed, in bytes per second, used for sorting. A measured speed wins;
 * otherwise the swarm size stands in (a seed or DHT peer worth ~50 KB/s, an old
 * seeder snapshot far less), so untested releases rank among each other.
 */
export const expectedSpeed = (stream: Stream, result?: SwarmTestResult): number => {
  if (result) return testFailed(result) ? -1 : Math.max(result.speed, result.maxSpeed * 0.5, result.seeds * 20_000);
  const text = [...(stream.tags || []), stream.tag || ''].join(' ');
  const online = Number(text.match(/👥\s*(\d+)/)?.[1] || 0);
  const snapshot = Number(text.match(/≈(\d+) seeders/)?.[1] || 0);
  const seeders = liveSeeders(stream) || 0;
  return Math.max(seeders * 50_000, online * 30_000, snapshot * 5_000);
};

export type SourceSort = 'speed' | 'quality';

/**
 * Fastest first: measured releases by speed, then untested ones by swarm size,
 * releases that failed a test last. "Quality" orders by resolution first.
 */
export const sortBySpeed = (streams: Stream[], results: Record<string, SwarmTestResult>, sort: SourceSort): Stream[] => {
  const score = (stream: Stream) => {
    const result = freshResult(results, streamInfoHash(stream));
    // Direct (non-torrent) links do not depend on a swarm.
    if (stream.type !== 'torrent') return {tier: 0, speed: Number.MAX_SAFE_INTEGER};
    const speed = expectedSpeed(stream, result);
    return {tier: speed < 0 ? 2 : result ? 0 : 1, speed};
  };
  const quality = (stream: Stream) => Number(streamQuality(stream)) || 0;
  return streams
    .map((stream, index) => ({stream, index, ...score(stream)}))
    .sort((a, b) =>
      (sort === 'quality' ? quality(b.stream) - quality(a.stream) : 0) ||
      a.tier - b.tier ||
      b.speed - a.speed ||
      a.index - b.index)
    .map(({stream}) => stream);
};

export const formatSpeed = (bytesPerSecond: number) =>
  bytesPerSecond >= 1024 * 1024
    ? `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
    : `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;

/** One line for a release card: what the swarm test found. */
export const describeTest = (result?: SwarmTestResult, running = false): {text: string; tone: 'good' | 'ok' | 'bad' | 'pending'} | undefined => {
  if (!result) return running ? {text: 'Checking peers and speed…', tone: 'pending'} : undefined;
  if (!result.metadata) {
    return result.peers > 0
      ? {text: `${result.peers} peers connected but sent no torrent info`, tone: 'bad'}
      : {text: 'No peers connected — will not play', tone: 'bad'};
  }
  const speed = Math.max(result.speed, result.maxSpeed * 0.5);
  const peers = `${result.peers} peers (${result.seeds} seeds)`;
  const tone = speed >= 1024 * 1024 ? 'good' : speed >= 300 * 1024 ? 'ok' : 'bad';
  return {text: `${formatSpeed(speed)} · ${peers}`, tone};
};

/** The magnet with the peers a test connected to, so playback does not search again. */
export const withKnownPeers = (link: string, result?: SwarmTestResult): string => {
  if (!result?.peerList?.length || !link.startsWith('magnet:')) return link;
  const peers = result.peerList
    .map(peer => peer.replace(/^[a-z]+:\/\//i, ''))
    .filter(peer => /^[\d.]+:\d+$|^\[[0-9a-f:]+\]:\d+$/i.test(peer))
    .slice(0, 30)
    .map(peer => `&x.pe=${encodeURIComponent(peer)}`)
    .join('');
  return link + peers;
};

/** Picks the releases to test next: the first untested torrents of a list. */
export const nextToTest = (streams: Stream[], results: Record<string, SwarmTestResult>, running: Record<string, true>): string[] => {
  const hashes: string[] = [];
  for (const stream of streams) {
    if (stream.type !== 'torrent') continue;
    const hash = streamInfoHash(stream);
    if (!hash || running[hash] || freshResult(results, hash) || hashes.includes(hash)) continue;
    hashes.push(hash);
    if (hashes.length >= SWARM_TEST_BATCH) break;
  }
  return hashes;
};

/**
 * Tests the top of a source list while it is shown: the first untested
 * releases, a batch at a time, until the releases at the top are all measured.
 * Leaving the list stops the tests.
 */
export const useSwarmTests = (streams: Stream[], enabled: boolean) => {
  const results = useSwarmTestStore(state => state.results);
  const running = useSwarmTestStore(state => state.running);
  const busy = Object.keys(running).length > 0;
  useEffect(() => {
    if (!enabled || busy || Platform.OS !== 'android') return;
    const hashes = nextToTest(streams.slice(0, SWARM_TEST_BATCH * 2), results, running);
    if (!hashes.length) return;
    const magnets = hashes.map(hash => streams.find(stream => streamInfoHash(stream) === hash)!.link);
    const {start, finish} = useSwarmTestStore.getState();
    start(hashes);
    torrentManager.testSwarms(magnets, SWARM_TEST_SECONDS)
      .then(found => finish(hashes, found || {}))
      .catch(() => finish(hashes, {}));
  }, [streams, enabled, busy, results, running]);
  useEffect(() => () => {
    torrentManager.cancelSwarmTests().catch(() => {});
  }, []);
  return {results, running};
};

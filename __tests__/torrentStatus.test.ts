import {
  MAX_TORRENT_RESTARTS,
  STARTUP_STALL_RESTART_MS,
  describeTorrentStatus,
  isNoPeersError,
  shouldRestartStalledTorrent,
  torrentFailureMessage,
  torrentInfoHash,
  type StreamTorrentStats,
} from '../src/lib/player/torrentStatus';

const stats = (extra: Partial<StreamTorrentStats> = {}): StreamTorrentStats => ({
  state: 'downloading',
  progress: 0,
  downloadRate: 0,
  uploadRate: 0,
  numPeers: 0,
  numSeeds: 0,
  totalDone: 0,
  totalWanted: 0,
  hasMetadata: true,
  ...extra,
});

it('says what a starting torrent is doing instead of an empty spinner', () => {
  expect(describeTorrentStatus(null, 'metadata', 3200)).toEqual({
    title: 'Getting torrent info',
    detail: 'Connecting to trackers and DHT · 3 s',
  });
  expect(describeTorrentStatus(stats({hasMetadata: false, knownPeers: 14}), 'metadata', 8000).detail)
    .toBe('Connecting to 14 found peers · 8 s');
  expect(describeTorrentStatus(stats({hasMetadata: false, knownPeers: 1, downloadRate: 300}), 'metadata', 8000).detail)
    .toBe('Connecting to 1 found peer · 8 s');
  expect(describeTorrentStatus(stats({numPeers: 9, numSeeds: 4, downloadRate: 2.5 * 1024 * 1024, totalDone: 12 * 1024 * 1024}), 'starting', 15000))
    .toEqual({title: 'Downloading the start of the video', detail: '9 peers (4 seeds) · 2.5 MB/s · 12.0 MB · 15 s'});
});

it('explains a stall and what the watchdog does about it', () => {
  const status = describeTorrentStatus(stats({numPeers: 3, numSeeds: 1, stalledMs: 31_000, recovery: 'reconnecting'}), 'buffering', 90_000);
  expect(status.title).toBe('Buffering');
  expect(status.detail).toBe('3 peers (1 seed) · 90 s\nNo data for 31 s, reconnecting to peers');
});

it('restarts a torrent that never started a limited number of times', () => {
  const stalled = stats({stalledMs: STARTUP_STALL_RESTART_MS});
  expect(shouldRestartStalledTorrent(stalled, false, 0)).toBe(true);
  expect(shouldRestartStalledTorrent(stalled, false, MAX_TORRENT_RESTARTS)).toBe(false);
  expect(shouldRestartStalledTorrent(stalled, true, 0)).toBe(false);
  expect(shouldRestartStalledTorrent(stats({stalledMs: 5000}), false, 0)).toBe(false);
});

it('turns native errors into reasons a viewer can act on', () => {
  expect(torrentFailureMessage(new Error('No peers found for this torrent in 45 s'))).toMatch(/No peers are sharing/);
  expect(torrentFailureMessage(new Error('3 peers were found but did not send the torrent info in 30 s'))).toMatch(/torrent info in time/);
  expect(torrentFailureMessage(new Error('Timed out waiting for the first video piece'))).toMatch(/stopped sending/);
});

it('tells a release nobody shares from peers that stay silent', () => {
  expect(isNoPeersError(Object.assign(new Error('No peers found for this torrent in 30 s'), {code: 'NO_PEERS'}))).toBe(true);
  expect(isNoPeersError(Object.assign(new Error('12 peers were found but did not send the torrent info in 30 s'), {code: 'TIMEOUT'}))).toBe(false);
});

it('reads the info hash of a magnet', () => {
  expect(torrentInfoHash(`magnet:?xt=urn:btih:${'AB'.repeat(20)}&dn=x`)).toBe('ab'.repeat(20));
  expect(torrentInfoHash('https://example.com/file.torrent')).toBeUndefined();
});

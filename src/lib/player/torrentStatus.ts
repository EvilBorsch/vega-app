import type {TorrentStats} from '../torrentManager';

/** Native stats plus the watchdog's view of the stream (TorrentModule.getStats). */
export type StreamTorrentStats = TorrentStats & {
  numConnections?: number;
  knownPeers?: number;
  knownSeeds?: number;
  dhtNodes?: number;
  /** Time since the last payload byte arrived. */
  stalledMs?: number;
  recoveries?: number;
  /** What the native watchdog is doing about a stall: '', 'searching' or 'reconnecting'. */
  recovery?: string;
};

/** Before the video plays, a stream with no data this long is added again. */
export const STARTUP_STALL_RESTART_MS = 45_000;
/** Automatic re-adds per selected source before the user is asked. */
export const MAX_TORRENT_RESTARTS = 3;
/** Once the video played, a stall this long offers retry and other sources. */
export const PLAYBACK_STALL_PROMPT_MS = 60_000;
/** Starts that found no peer at all before a release counts as dead. */
export const DEAD_RELEASE_ATTEMPTS = 2;
/** Player reloads of a playing torrent after a read error. */
export const MAX_TORRENT_PLAYER_RELOADS = 3;

export const torrentInfoHash = (link?: string): string | undefined =>
  link?.match(/[?&]xt=urn:btih:([a-f0-9]{40})(?:&|$)/i)?.[1]?.toLowerCase();

const formatSpeed = (bytesPerSecond: number): string =>
  bytesPerSecond >= 1024 * 1024
    ? `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
    : `${Math.round(bytesPerSecond / 1024)} KB/s`;

export type TorrentStage = 'metadata' | 'starting' | 'buffering';

/**
 * What a torrent stream is doing, for the loading screen and buffering overlay.
 * The title says the stage, the detail the swarm, so a slow start is never a
 * silent spinner.
 */
export const describeTorrentStatus = (
  stats: StreamTorrentStats | null | undefined,
  stage: TorrentStage,
  elapsedMs: number,
): {title: string; detail: string} => {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const title =
    !stats?.hasMetadata || stage === 'metadata'
      ? 'Getting torrent info'
      : stage === 'starting'
        ? 'Downloading the start of the video'
        : 'Buffering';
  if (!stats) {
    return {title, detail: `Connecting to trackers and DHT · ${seconds} s`};
  }
  const peers = stats.numPeers || 0;
  const seeds = stats.numSeeds || 0;
  const parts = [
    peers > 0
      ? `${peers} peer${peers === 1 ? '' : 's'} (${seeds} seed${seeds === 1 ? '' : 's'})`
      : (stats.knownPeers || 0) > 0
        ? `Connecting to ${stats.knownPeers} found peer${stats.knownPeers === 1 ? '' : 's'}`
        : 'Searching for peers',
  ];
  if ((stats.downloadRate || 0) >= 1024) parts.push(formatSpeed(stats.downloadRate));
  if ((stats.totalDone || 0) > 0) parts.push(`${((stats.totalDone || 0) / 1024 / 1024).toFixed(1)} MB`);
  parts.push(`${seconds} s`);
  const stalledSeconds = Math.floor((stats.stalledMs || 0) / 1000);
  const recovery =
    stalledSeconds >= 10 && stats.recovery === 'reconnecting'
      ? `No data for ${stalledSeconds} s, reconnecting to peers`
      : stalledSeconds >= 10 && stats.recovery === 'searching'
        ? `No data for ${stalledSeconds} s, asking trackers for more peers`
        : stalledSeconds >= 10
          ? `No data for ${stalledSeconds} s`
          : '';
  return {title, detail: [parts.join(' · '), recovery].filter(Boolean).join('\n')};
};

/** Whether a stream that has not started playing should be added again. */
export const shouldRestartStalledTorrent = (
  stats: StreamTorrentStats | null | undefined,
  videoReady: boolean,
  restarts: number,
): boolean =>
  !videoReady &&
  restarts < MAX_TORRENT_RESTARTS &&
  (stats?.stalledMs || 0) >= STARTUP_STALL_RESTART_MS;

/** A start that found not a single peer (TorrentModule rejects with NO_PEERS). */
export const isNoPeersError = (error: unknown): boolean =>
  (error as any)?.code === 'NO_PEERS' || /no peers found/i.test(String((error as any)?.message || ''));

/** A plain-language reason for a torrent that could not start. */
export const torrentFailureMessage = (error: unknown): string => {
  const message = String((error as any)?.message || error || '');
  if (/no peers found/i.test(message)) {
    return 'No peers are sharing this release right now. It may be dead or blocked on your network.';
  }
  if (/torrent info|metadata/i.test(message)) {
    return 'Peers were found but did not send the torrent info in time.';
  }
  if (/no files|file index/i.test(message)) {
    return 'This torrent has no playable video file.';
  }
  if (/first video piece|piece/i.test(message)) {
    return 'Peers stopped sending the video.';
  }
  return message || 'The torrent could not be started.';
};

/** Where a stream list comes from, shown while it loads. */
export const sourceSearchText = (provider?: string): string =>
  provider === 'torrentio'
    ? 'Searching Torrentio, RuTracker, Kinozal, NNM-Club, Rutor, MegaPeer, Knaben and more'
    : `Asking ${provider || 'the provider'} for servers`;

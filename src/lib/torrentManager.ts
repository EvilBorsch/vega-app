import {NativeModules, Platform} from 'react-native';

const {TorrentModule} = NativeModules;

export interface TorrentFile {
  index: number;
  name: string;
  path: string;
  size: number;
}

export interface TorrentAddResult {
  infoHash: string;
  state: string;
  hasMetadata: boolean;
  name?: string;
  totalSize?: number;
  files?: TorrentFile[];
}

export interface TorrentStats {
  state: string;
  progress: number;
  downloadRate: number;
  uploadRate: number;
  numPeers: number;
  numSeeds: number;
  totalDone: number;
  totalWanted: number;
  hasMetadata: boolean;
}

export interface TorrentCompleteResult {
  success: boolean;
  outputPath: string;
  fileName: string;
  size: number;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_BTIH = /(xt(?:\.\d+)?=urn:btih:)([a-z2-7]{32})(?=[&#]|$)/gi;

/** Decodes an RFC 4648 base32 string (no padding) to lowercase hex. */
export function base32ToHex(input: string): string {
  let bits = 0;
  let value = 0;
  let hex = '';
  for (const char of input.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    value = ((value << 5) | index) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      hex += ((value >>> bits) & 0xff).toString(16).padStart(2, '0');
    }
  }
  return hex;
}

/**
 * The native module only recognizes 40-char hex info hashes, so base32
 * btih magnets are rewritten to hex. Anything else is returned unchanged.
 */
export function normalizeMagnetLink(magnetOrUrl: string): string {
  if (!/^magnet:/i.test(magnetOrUrl)) {
    return magnetOrUrl;
  }
  return magnetOrUrl.replace(
    BASE32_BTIH,
    (_match, prefix: string, hash: string) => prefix + base32ToHex(hash),
  );
}

class TorrentManager {
  private streamPort: number | null = null;
  private isInitialized = false;

  async init(): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new Error('Torrent streaming is only supported on Android');
    }
    if (this.isInitialized) {
      return;
    }

    try {
      const result = await TorrentModule.initEngine();
      this.streamPort = result.streamPort;
      this.isInitialized = true;
      console.log('TorrentManager initialized, stream port:', this.streamPort);
    } catch (error) {
      console.error('Failed to init TorrentModule:', error);
      throw error;
    }
  }

  async addTorrent(
    magnetOrUrl: string,
    options?: {output_folder?: string; file_name?: string},
  ): Promise<TorrentAddResult> {
    await this.init();
    return await TorrentModule.addTorrent(
      normalizeMagnetLink(magnetOrUrl),
      options?.output_folder || null,
      options?.file_name || null,
    );
  }

  /**
   * Peers the DHT knows for each info hash (lowercase hex). Releases nobody
   * shares come back with 0.
   */
  async probeSwarms(
    infoHashes: string[],
  ): Promise<{peers: Record<string, number>; nodes: number}> {
    await this.init();
    return await TorrentModule.probeSwarms(infoHashes);
  }

  /**
   * Starts measuring releases: each downloads the start of its video while a
   * source list is open. swarmStats reads how they are doing.
   */
  async monitorSwarms(magnets: string[]): Promise<void> {
    await this.init();
    await TorrentModule.monitorSwarms(magnets.map(normalizeMagnetLink));
  }

  /** Live peers, bytes and speed of monitored releases, keyed by info hash. */
  async swarmStats(infoHashes: string[]): Promise<Record<string, any>> {
    if (!this.isInitialized) return {};
    return (await TorrentModule.swarmStats(infoHashes)) || {};
  }

  /** Ends measuring; a release the player took keeps running. */
  async stopSwarmMonitor(infoHashes: string[]): Promise<void> {
    if (!this.isInitialized || !infoHashes.length) return;
    await TorrentModule.stopSwarmMonitor(infoHashes);
  }

  /** Live seeders and leechers from public trackers, keyed by info hash. */
  async scrapeSwarms(
    infoHashes: string[],
  ): Promise<Record<string, {seeders: number; leechers: number; trackers: number}>> {
    await this.init();
    return (await TorrentModule.scrapeSwarms(infoHashes)) || {};
  }

  /** Keeps a tested release running for the player instead of removing it. */
  async claimSwarmTest(infoHash: string): Promise<void> {
    if (!this.isInitialized) return;
    await TorrentModule.claimSwarmTest(infoHash);
  }

  async getStats(infoHash: string): Promise<TorrentStats> {
    await this.init();
    return await TorrentModule.getStats(infoHash);
  }

  async getFiles(infoHash: string): Promise<TorrentFile[]> {
    await this.init();
    return await TorrentModule.getFiles(infoHash);
  }

  /**
   * Prioritizes the pieces a player reads first. [resuming] skips the opening
   * minutes, since playback starts mid-file. Without [fullDownload], only about
   * a minute ahead of playback downloads.
   */
  async prepareVideoFile(
    infoHash: string,
    fileIndex = 0,
    resuming = false,
    fullDownload = true,
  ): Promise<boolean> {
    await this.init();
    return await TorrentModule.prepareVideoFile(
      infoHash,
      fileIndex,
      resuming,
      fullDownload,
    );
  }

  /** Lets the stream server size its one-minute buffer from the video bitrate. */
  async setStreamDuration(
    infoHash: string,
    durationSeconds: number,
  ): Promise<void> {
    await this.init();
    await TorrentModule.setStreamDuration(infoHash, durationSeconds);
  }

  async getStreamUrl(infoHash: string, fileIndex = 0): Promise<string> {
    await this.init();
    return await TorrentModule.getStreamUrl(infoHash, fileIndex);
  }

  async pauseTorrent(infoHash: string): Promise<void> {
    await this.init();
    await TorrentModule.pauseTorrent(infoHash);
  }

  async resumeTorrent(infoHash: string): Promise<void> {
    await this.init();
    await TorrentModule.resumeTorrent(infoHash);
  }

  async completeTorrent(infoHash: string): Promise<TorrentCompleteResult> {
    await this.init();
    return await TorrentModule.completeTorrent(infoHash);
  }

  async deleteTorrent(infoHash: string, deleteFiles = true): Promise<void> {
    await this.init();
    await TorrentModule.deleteTorrent(infoHash, deleteFiles);
  }
}

export const torrentManager = new TorrentManager();

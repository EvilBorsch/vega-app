import type {Stream} from '../providers/types';
import {mainStorage} from '../storage';
import {getLocalVideoAssociationKey} from '../utils/episodeIdentity';

// Persist identity only: provider links and authentication headers can expire.
const identity = (stream: Stream) => ({
  server: stream.server,
  type: stream.type,
  quality: stream.quality || '',
  tag: stream.tag || '',
  tags: [...(stream.tags || [])].sort(),
  torrentHash:
    stream.link.match(/[?&]xt=urn:btih:([^&]+)/i)?.[1]?.toLowerCase() || '',
});
export type ServerIdentity = ReturnType<typeof identity>;
export const serverIdentity = (stream: Stream): ServerIdentity | undefined =>
  stream?.link && stream.server ? identity(stream) : undefined;

export const rememberedServerKey = (
  episode: any,
  params: any,
  provider: string,
) => {
  const key = getLocalVideoAssociationKey({
    episode,
    provider: params?.providerValue || provider,
    infoUrl: params?.infoUrl,
  });
  return key ? `PlaybackServer:v1:${key}` : '';
};
/** The source last picked for any episode of a series. */
export const rememberedSeriesKey = (params: any, provider: string) =>
  params?.type === 'series' && params?.infoUrl
    ? `PlaybackServer:v1:series:${params?.providerValue || provider}:${params.infoUrl}`
    : '';
export function rememberServer(key: string, stream: Stream): void {
  if (!key || !stream.link || !stream.server) return;
  try {
    mainStorage.setString(key, JSON.stringify(identity(stream)));
  } catch {}
}
export function rememberedIdentity(key: string): ServerIdentity | undefined {
  if (!key) return undefined;
  try {
    const saved = mainStorage.getString(key);
    return saved ? JSON.parse(saved) : undefined;
  } catch {
    return undefined;
  }
}
export function findRememberedServer(
  key: string,
  streams: Stream[],
): Stream | undefined {
  try {
    const saved = mainStorage.getString(key);
    if (!saved) return undefined;
    const previous = JSON.parse(saved);
    return streams.find(stream => {
      const current = identity(stream);
      // Torrentio includes live seeder counts in its display tags. The hash
      // identifies the actual release even when those labels change.
      return previous.torrentHash
        ? current.type === previous.type && current.torrentHash === previous.torrentHash
        : JSON.stringify(current) === saved;
    });
  } catch {
    return undefined;
  }
}

// Seeder counts and sizes change between episodes and refreshes; codec,
// language and dub labels describe the release.
const VOLATILE_TAG = /^(?:👤\s*\d+|S:\s*\d+|≈\d+ seeders.*|\d+(?:[.,]\d+)?\s*(?:B|KB|MB|GB|TB))$/i;
const stableTags = (tags: string[]) =>
  tags.map(tag => tag.trim().toLowerCase()).filter(tag => tag && !VOLATILE_TAG.test(tag));
const seeders = (stream: Stream) =>
  Number([...(stream.tags || []), stream.tag || ''].join(' ').match(/👤\s*(\d+)/)?.[1] || 0);

/**
 * The source for another episode that matches one picked before: the same
 * torrent (a season pack holds every episode), otherwise the same server and
 * quality with the most release labels in common.
 */
export function findSimilarStream(
  previous: ServerIdentity | undefined,
  streams: Stream[],
): Stream | undefined {
  if (!previous?.server) return undefined;
  if (previous.torrentHash) {
    const same = streams.find(stream =>
      stream.type === previous.type && identity(stream).torrentHash === previous.torrentHash);
    if (same) return same;
  }
  const wanted = new Set(stableTags(previous.tags || []));
  let best: Stream | undefined;
  let bestScore = -1;
  for (const stream of streams) {
    if (stream.server !== previous.server || stream.type !== previous.type ||
        (stream.quality || '') !== previous.quality) continue;
    const score = stableTags(stream.tags || []).filter(tag => wanted.has(tag)).length;
    if (score > bestScore || (score === bestScore && best && seeders(stream) > seeders(best))) {
      best = stream;
      bestScore = score;
    }
  }
  return best;
}

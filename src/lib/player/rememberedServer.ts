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
export function rememberServer(key: string, stream: Stream): void {
  if (!key || !stream.link || !stream.server) return;
  try {
    mainStorage.setString(key, JSON.stringify(identity(stream)));
  } catch {}
}
export function findRememberedServer(
  key: string,
  streams: Stream[],
): Stream | undefined {
  try {
    const saved = mainStorage.getString(key);
    return saved
      ? streams.find(stream => JSON.stringify(identity(stream)) === saved)
      : undefined;
  } catch {
    return undefined;
  }
}

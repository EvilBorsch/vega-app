import type {Stream} from '../providers/types';

export type RemoteSourceState = {
  selectedStream?: Pick<Stream, 'link' | 'type'> | null;
  processedStreamUrl: string;
  processedForLink?: string;
  streamLoading: boolean;
  isResolvingStream: boolean;
};

// A server switch renders once with the previous stream's URL before its resolution
// is reset, so the URL must have been produced for the stream selected now.
export const isRemoteSourceReady = ({
  selectedStream,
  processedStreamUrl,
  processedForLink,
  streamLoading,
  isResolvingStream,
}: RemoteSourceState): boolean => {
  if (!processedStreamUrl || streamLoading || isResolvingStream || !selectedStream?.link) {
    return false;
  }
  const isTorrent = selectedStream.link.startsWith('magnet:') || selectedStream.type === 'torrent';
  return isTorrent
    ? processedForLink === selectedStream.link
    : processedStreamUrl === selectedStream.link;
};

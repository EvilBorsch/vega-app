import {isRemoteSourceReady} from '../src/lib/player/remoteSourceReady';

const flux = {link: 'magnet:?xt=urn:btih:90366a9abe82b70393fc6ed128d4252380684817', type: 'torrent'};
const other = {link: 'magnet:?xt=urn:btih:cf87a9747708fc65f6b8f327658ae7c140bc672a', type: 'torrent'};
const fluxUrl = 'http://127.0.0.1:40975/stream/90366a9abe82b70393fc6ed128d4252380684817/1/movie.mkv';
const ready = {streamLoading: false, isResolvingStream: false};

it('does not send the previous torrent URL right after the server changes', () => {
  // The render after a server switch still holds the old torrent's URL; its
  // resolution is reset only after the old torrent is removed.
  expect(isRemoteSourceReady({...ready, selectedStream: other, processedStreamUrl: fluxUrl, processedForLink: flux.link}))
    .toBe(false);
});

it('accepts a torrent URL resolved for the selected server', () => {
  expect(isRemoteSourceReady({...ready, selectedStream: flux, processedStreamUrl: fluxUrl, processedForLink: flux.link}))
    .toBe(true);
});

it('accepts a direct stream only once its own link is the processed URL', () => {
  const direct = {link: 'https://cdn.example/movie.mp4', type: 'mp4'};
  expect(isRemoteSourceReady({...ready, selectedStream: direct, processedStreamUrl: direct.link, processedForLink: direct.link}))
    .toBe(true);
  expect(isRemoteSourceReady({...ready, selectedStream: direct, processedStreamUrl: fluxUrl, processedForLink: flux.link}))
    .toBe(false);
});

it('waits while servers load, a stream resolves, or nothing is processed', () => {
  const base = {selectedStream: flux, processedStreamUrl: fluxUrl, processedForLink: flux.link};
  expect(isRemoteSourceReady({...base, streamLoading: true, isResolvingStream: false})).toBe(false);
  expect(isRemoteSourceReady({...base, streamLoading: false, isResolvingStream: true})).toBe(false);
  expect(isRemoteSourceReady({...ready, ...base, processedStreamUrl: ''})).toBe(false);
  expect(isRemoteSourceReady({...ready, ...base, selectedStream: {link: '', type: ''}})).toBe(false);
});

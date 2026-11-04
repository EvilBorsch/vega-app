jest.mock('expo-constants', () => ({__esModule: true, default: {expoConfig: {extra: {}}}}));
jest.mock('../src/lib/storage', () => ({settingsStorage: {getTmdbApiKey: () => ''}}));

import {
  jacredToStream,
  matchesJacred,
  matchesWestern,
  mergeTrackerStreams,
  parseRutor,
  parseTorrentioTarget,
  seasonsInTitle,
  titleVariants,
  type JacredTorrent,
  type TorrentioTarget,
  westernToStream,
} from '../src/lib/providers/extraTorrentSources';

const magnet = (hash: string) => `magnet:?xt=urn:btih:${hash}&tr=udp%3A%2F%2Fopentor.net%3A6969`;
const jacred = (title: string, extra: Partial<JacredTorrent> = {}): JacredTorrent => ({
  tracker: 'kinozal',
  title,
  sid: 10,
  magnet: magnet('a'.repeat(40)),
  relased: 2022,
  types: ['movie'],
  ...extra,
});
const whale: TorrentioTarget = {imdbId: 'tt13833688', type: 'movie', title: 'The Whale', year: '2022'};
const breakingBad = (season: number, episode: number): TorrentioTarget => ({
  imdbId: 'tt0903747', type: 'series', title: 'Breaking Bad', year: '2008–2013', season, episode,
});

describe('parseTorrentioTarget', () => {
  it('reads a Torrentio episode payload', () => {
    expect(parseTorrentioTarget(JSON.stringify({
      title: 'Breaking Bad', imdbId: 'tt0903747', season: '2', episode: '3', type: 'series', tmdbId: '1396', year: '2008–2013',
    }))).toEqual({
      imdbId: 'tt0903747', tmdbId: '1396', type: 'series', title: 'Breaking Bad', year: '2008–2013', season: 2, episode: 3,
    });
  });
  it('accepts a bare IMDb id for movies and rejects other links', () => {
    expect(parseTorrentioTarget('tt13833688', 'movie')).toMatchObject({imdbId: 'tt13833688', type: 'movie'});
    expect(parseTorrentioTarget('https://example.com/movie')).toBeUndefined();
  });
});

describe('JacRed releases', () => {
  it('keeps the movie of the right year and drops dead, other-year and series releases', () => {
    expect(matchesJacred(jacred('Кит / The Whale / 2022 / WEB-DL (1080p)'), whale)).toBe(true);
    expect(matchesJacred(jacred('Кит / The whale (2013) HDTVRip', {relased: 2013}), whale)).toBe(false);
    expect(matchesJacred(jacred('Кит / The Whale (2022)', {sid: 0}), whale)).toBe(false);
    expect(matchesJacred(jacred('Кит / Сезон: 1', {types: ['serial']}), whale)).toBe(false);
  });

  it('matches the season and episode range of a series release', () => {
    const pack = jacred('Во все тяжкие / Breaking Bad / Сезон: 2 / Серии: 1-13 из 13', {types: ['serial'], relased: 2009, seasons: [2]});
    expect(matchesJacred(pack, breakingBad(2, 3))).toBe(true);
    expect(matchesJacred(pack, breakingBad(3, 3))).toBe(false);
    const partial = jacred('Слово пацана / Сезон: 1 / Серии: 1-4 из 8', {types: ['serial'], relased: 2023, seasons: [1]});
    const target = {imdbId: 'tt1', type: 'series' as const, title: 'Слово пацана', year: '2023', season: 1};
    expect(matchesJacred(partial, {...target, episode: 4})).toBe(true);
    expect(matchesJacred(partial, {...target, episode: 6})).toBe(false);
    const rutor = jacred('Фрирен / Sousou no Frieren [01x01-04 из 24] (2023)', {types: ['anime'], relased: 2023});
    expect(matchesJacred(rutor, {...target, year: '2023–', episode: 5})).toBe(false);
    expect(matchesJacred(rutor, {...target, year: '2023–', episode: 2})).toBe(true);
  });

  it('tells anime TV seasons and episode counts apart', () => {
    const tv2 = jacred('Sousou no Frieren (2026) / Фрирен [ТВ-2] (1—3) [1080p]', {tracker: 'animelayer', types: ['anime'], relased: 2026});
    const complete = jacred('Sousou no Frieren / Фрирен (28 из 28) Complete [1080p]', {tracker: 'animelayer', types: ['anime'], relased: 2023});
    const frieren = (season: number, episode: number): TorrentioTarget => ({imdbId: 'tt22248376', type: 'series', title: 'Frieren', year: '2023–', season, episode});
    expect(matchesJacred(tv2, frieren(1, 2))).toBe(false);
    expect(matchesJacred(tv2, frieren(2, 2))).toBe(true);
    expect(matchesJacred(tv2, frieren(2, 5))).toBe(false);
    expect(matchesJacred(complete, frieren(1, 20))).toBe(true);
  });

  it('labels a release with tracker, seeders, format, Russian audio and size', () => {
    const stream = jacredToStream(jacred('Кит / The Whale (2022) WEB-DL 2160p HDR10 HEVC', {
      tracker: 'rutracker', sid: 71, size: 23978252119, voices: ['TVShows'], videotype: 'hdr',
    }));
    expect(stream).toMatchObject({server: 'RuTracker', type: 'torrent', quality: '2160', title: 'Кит / The Whale (2022) WEB-DL 2160p HDR10 HEVC'});
    expect(stream.tags).toEqual(['2160p', '👤71', 'HEVC', 'HDR', 'WEB-DL', 'RU', 'TVShows', '22.33 GB']);
  });

  it('marks an old seeder snapshot instead of passing it off as live', () => {
    const now = Date.parse('2026-11-04T00:00:00Z');
    const stale = jacredToStream(jacred('Кит (2022) 1080p', {sid: 143, updateTime: '2026-02-04T12:04:21Z'}), now);
    expect(stale.tags).toContain('≈143 seeders (02.2026)');
    expect(stale.tags!.some(tag => tag.startsWith('👤'))).toBe(false);
    const fresh = jacredToStream(jacred('Кит (2022) 1080p', {sid: 12, updateTime: '2026-10-30T00:00:00Z'}), now);
    expect(fresh.tags).toContain('👤12');
  });

  it('does not read HDRip as HDR', () => {
    expect(jacredToStream(jacred('Кит (2022) HDRip')).tags).not.toContain('HDR');
  });

  it('names Knaben mirrors by their index and detects their language', () => {
    const stream = jacredToStream(jacred('Breaking Bad S02E03 1080p WEB-DL | The Pirate Bay', {tracker: 'knaben', relased: 0, types: ['serial']}));
    expect(stream.server).toBe('The Pirate Bay');
    expect(stream.title).toBe('Breaking Bad S02E03 1080p WEB-DL');
    expect(stream.tags).toContain('EN');
    expect(stream.tags).not.toContain('RU');
  });
});

describe('international releases', () => {
  const hit = (title: string, seeders = 5) => ({title, hash: 'b'.repeat(40), seeders, bytes: 2_000_000_000, source: '1337x'});
  it('needs the title, a matching year for movies and the episode for series', () => {
    expect(matchesWestern(hit('The.Whale.2022.1080p.WEBRip.x264'), whale)).toBe(true);
    expect(matchesWestern(hit('The Whale 1080p WEBRip'), whale)).toBe(false);
    expect(matchesWestern(hit('The Whale Rider 2002 1080p'), whale)).toBe(false);
    expect(matchesWestern(hit('The.Whale.2022.1080p', 0), whale)).toBe(false);
    expect(matchesWestern({...hit('The.Whale.2022.1080p'), hash: '0'.repeat(39)}, whale)).toBe(false);
    expect(matchesWestern(hit('Breaking.Bad.S02E03.720p.HDTV'), breakingBad(2, 3))).toBe(true);
    expect(matchesWestern(hit('Breaking Bad S02E04 720p'), breakingBad(2, 3))).toBe(false);
    expect(matchesWestern(hit('Breaking Bad S02 1080p BluRay'), breakingBad(2, 3))).toBe(true);
    expect(matchesWestern(hit('Breaking.Bad.S01-S02-S03-S04-S05.1080p'), breakingBad(2, 3))).toBe(true);
    expect(matchesWestern(hit('The Bad Guys Breaking In S02E03 1080p'), breakingBad(2, 3))).toBe(false);
    expect(matchesWestern(hit('Breaking.Brad.S02E03.480p'), breakingBad(2, 3))).toBe(false);
    expect(matchesWestern(hit('[SubsPlease] Breaking Bad S02E03 (1080p)'), breakingBad(2, 3))).toBe(true);
  });

  it('builds a magnet from the hash and names the index', () => {
    const stream = westernToStream({title: 'The Whale 2022 MULTi 2160p', hash: 'C'.repeat(40), seeders: 3, source: 'The Pirate Bay'});
    expect(stream.link).toMatch(/^magnet:\?xt=urn:btih:c{40}&dn=/);
    expect(stream.server).toBe('The Pirate Bay');
    expect(stream.tags).toEqual(expect.arrayContaining(['2160p', '👤3', 'MULTI']));
  });

  it('labels a seeder count an index measured long ago', () => {
    const now = Date.parse('2026-11-04T00:00:00Z');
    const old = westernToStream({title: 'The Whale 2022 1080p', hash: 'd'.repeat(40), seeders: 40, source: 'Torrents-CSV', checkedAt: Date.parse('2026-05-01T00:00:00Z')}, now);
    expect(old.tags).toContain('≈40 seeders (05.2026)');
    const fresh = westernToStream({title: 'The Whale 2022 1080p', hash: 'd'.repeat(40), seeders: 40, source: 'Torrents-CSV', checkedAt: Date.parse('2026-10-30T00:00:00Z')}, now);
    expect(fresh.tags).toContain('👤40');
  });
});

describe('mergeTrackerStreams', () => {
  const torrentio = (hash: string, quality: string, seeds: number) => ({
    server: 'Torrentio', link: `magnet:?xt=urn:btih:${hash}`, type: 'torrent', quality, tags: [`${quality}p`, `👤${seeds}`],
  });
  it('adds new releases, keeps one entry per hash and lends Torrentio duplicates trackers and names', () => {
    const hash = 'd'.repeat(40);
    const duplicate = {...jacredToStream(jacred('Кит (2022) 1080p', {magnet: magnet(hash), sid: 3})), quality: '1080'};
    const extra = jacredToStream(jacred('Кит (2022) 2160p', {magnet: magnet('e'.repeat(40)), sid: 50}));
    const merged = mergeTrackerStreams([torrentio(hash, '1080', 9), torrentio('f'.repeat(40), '720', 99)], [duplicate, extra]);
    expect(merged).toHaveLength(3);
    expect(merged.map(stream => stream.quality)).toEqual(['2160', '1080', '720']);
    expect(merged[1]).toMatchObject({server: 'Torrentio', title: 'Кит (2022) 1080p', link: magnet(hash)});
  });
  it('ranks an old seeder snapshot after live counts of the same quality', () => {
    const stale = jacredToStream(jacred('Кит (2022) 1080p', {magnet: magnet('9'.repeat(40)), sid: 500, updateTime: '2026-01-01T00:00:00Z'}), Date.parse('2026-11-04T00:00:00Z'));
    const merged = mergeTrackerStreams([torrentio('8'.repeat(40), '1080', 3)], [{...stale, quality: '1080'}]);
    expect(merged.map(stream => stream.server)).toEqual(['Torrentio', 'Kinozal']);
  });

  it('returns the provider list untouched when nothing was found', () => {
    const list = [torrentio('a'.repeat(40), '720', 1)];
    expect(mergeTrackerStreams(list, [])).toBe(list);
  });
});

describe('search titles', () => {
  it('also searches the main part of a subtitled title', () => {
    expect(titleVariants(['Слово пацана. Кровь на асфальте', 'Mr. Robot', 'Star Wars: Andor'])).toEqual([
      'Слово пацана. Кровь на асфальте', 'Слово пацана', 'Mr. Robot', 'Star Wars: Andor', 'Star Wars',
    ]);
  });
  it('reads season lists and ranges', () => {
    expect(seasonsInTitle('Breaking.Bad.S01-S02-S03.1080p')).toEqual([1, 2, 3]);
    expect(seasonsInTitle('Во все тяжкие (1-5 сезоны)')).toEqual([1, 2, 3, 4, 5]);
    expect(seasonsInTitle('Фрирен [ТВ-2] (1—3)')).toEqual([2]);
  });
});

describe('Rutor search page', () => {
  it('reads magnet, name, size and live seeders of each row, with or without a comments column', () => {
    const html = `<table><tr class="gai"><td>10&nbsp;Апр&nbsp;22</td><td ><a class="downgif" href="//d.rutor.info/download/627299"><img alt="D" /></a><a href="magnet:?xt=urn:btih:914b31d61cf46d686de0e0de9a1b6bfe829b25b8&dn=rutor.info&tr=udp://opentor.net:6969"><img alt="M" /></a>
<a href="/torrent/627299/x">Американская история преступлений  / American Crime Story [S01-03] (2016-2021) BDRip | LostFilm </a></td> <td align="right">22<img alt="C" /></td>
<td align="right">19.83&nbsp;GB</td><td align="center"><span class="green"><img alt="S" />&nbsp;5</span>&nbsp;<img alt="L" /><span class="red">&nbsp;2</span></td></tr><tr class="tum"><td>10&nbsp;Ноя&nbsp;21</td><td colspan = "2"><a href="magnet:?xt=urn:btih:55abddda1b722438f9b369664dd86fb4e39388e8&amp;dn=rutor.info"><img alt="M" /></a>
<a href="/torrent/833446/y">Кит &amp; Co / The Whale (2022) WEBRip 720p</a></td>
<td align="right">16.20&nbsp;GB</td><td align="center"><span class="green"><img alt="S" />&nbsp;0</span>&nbsp;<img alt="L" /><span class="red">&nbsp;7</span></td></tr></table>`;
    expect(parseRutor(html)).toEqual([
      {title: 'Американская история преступлений  / American Crime Story [S01-03] (2016-2021) BDRip | LostFilm', magnet: 'magnet:?xt=urn:btih:914b31d61cf46d686de0e0de9a1b6bfe829b25b8&dn=rutor.info&tr=udp://opentor.net:6969', size: '19.83 GB', seeds: 5, leechers: 2},
      {title: 'Кит & Co / The Whale (2022) WEBRip 720p', magnet: 'magnet:?xt=urn:btih:55abddda1b722438f9b369664dd86fb4e39388e8&dn=rutor.info', size: '16.20 GB', seeds: 0, leechers: 7},
    ]);
  });
});

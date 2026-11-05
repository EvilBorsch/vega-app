jest.mock('expo-constants', () => ({__esModule: true, default: {expoConfig: {extra: {}}}}));
jest.mock('../src/lib/storage', () => ({settingsStorage: {getTmdbApiKey: () => ''}}));

import {
  jacredToStream,
  matchesJacred,
  matchesWestern,
  mergeTrackerStreams,
  addonToStream,
  jackettToJacred,
  mergeByHash,
  mergeJacred,
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

describe('cross-posted releases', () => {
  const hash = '9a758f234eba38c3b2ea5957d8fa8b11cfdc8a50';
  const post = (tracker: string, sid: number, pir: number, updateTime: string) => ({
    tracker, sid, pir, updateTime, title: 'Американская история преступлений (3 сезон: 1-10 серии из 10)',
    magnet: `magnet:?xt=urn:btih:${hash.toUpperCase()}`, relased: 2021, seasons: [3], types: ['serial'],
  });

  it('keeps the highest seeder count of a release posted on several trackers and names them all', () => {
    // The newest record (BitRu, 1 seeder) used to win and hide RuTracker's 14.
    const [merged] = mergeJacred([
      post('kinozal', 3, 0, '2026-07-16T00:00:00Z'),
      post('bitru', 1, 2, '2026-08-13T00:00:00Z'),
      post('rutracker', 14, 3, '2026-02-04T00:00:00Z'),
    ]);
    expect(merged).toMatchObject({sid: 14, pir: 3, trackers: ['rutracker', 'kinozal', 'bitru']});
    const stream = jacredToStream(merged, Date.parse('2026-11-04T00:00:00Z'));
    expect(stream.server).toBe('RuTracker · Kinozal · BitRu');
    expect(stream.tags).toContain('≈14 seeders, 3 leechers (02.2026)');
  });

  it('shows live leechers next to live seeders', () => {
    const stream = jacredToStream(post('rutor', 6, 4, new Date().toISOString()));
    expect(stream.tags).toEqual(expect.arrayContaining(['👤6', '⬇4']));
  });

  it('reads the Jackett API Lampa uses, with probed audio languages', () => {
    const torrent = jackettToJacred({
      Tracker: 'rutracker, kinozal, bitru', Title: 'Кит / The Whale (2022) WEB-DL 1080p', Size: 5_980_000_000,
      PublishDate: '2023-03-07T07:18:00Z', Seeders: 14, Peers: 5, MagnetUri: `magnet:?xt=urn:btih:${hash}`,
      languages: ['rus', 'eng'], info: {quality: 1080, videotype: 'sdr', voices: ['Сербин'], types: ['movie'], relased: 2022},
    })!;
    expect(torrent).toMatchObject({tracker: 'rutracker', trackers: ['rutracker', 'kinozal', 'bitru'], sid: 14, pir: 5, relased: 2022, types: ['movie']});
    expect(jacredToStream(torrent).tags).toEqual(expect.arrayContaining(['RU', 'EN']));
    expect(jackettToJacred({Title: 'no magnet', Link: 'https://x/download'})).toBeUndefined();
  });

  it('lists a release found by several sources once, with its strongest count', () => {
    const live = {server: 'Rutor', link: `magnet:?xt=urn:btih:${hash}`, type: 'torrent', tags: ['👤2']};
    const snapshot = {server: 'RuTracker · Kinozal', link: `magnet:?xt=urn:btih:${hash}&tr=x`, type: 'torrent', tags: ['≈14 seeders (02.2026)']};
    const merged = mergeByHash([live, snapshot]);
    expect(merged).toHaveLength(1);
    expect(merged[0].tags).toEqual(['≈14 seeders (02.2026)']);
    expect(merged[0].server).toBe('RuTracker · Kinozal · Rutor');
  });
});

describe('single-episode releases', () => {
  const lostfilm = (title: string) => ({tracker: 'lostfilm', title, sid: 1, magnet: `magnet:?xt=urn:btih:${'a'.repeat(40)}`, relased: 2016, seasons: [3], types: ['serial']});
  const episode = (n: number) => ({imdbId: 'tt2788432', type: 'series' as const, title: 'American Crime Story', year: '2016–', season: 3, episode: n});

  it('matches "3 сезон 8 серия" only to episode 8', () => {
    // Every other episode's release used to be offered for episode 8.
    const release = lostfilm('Американская история преступлений / American Crime Story / 3 сезон 8 серия [2016, 1080p]');
    expect(matchesJacred(release, episode(8))).toBe(true);
    expect(matchesJacred(release, episode(9))).toBe(false);
    expect(matchesJacred(lostfilm('Американская история преступлений / American Crime Story / 3 сезон 10 серия [2016, 1080p]'), episode(8))).toBe(false);
  });

  it('reads episode ranges without a total and cumulative season packs', () => {
    expect(matchesJacred({...lostfilm('Американская история преступлений (3 сезон: 1-10 серии) / American Crime Story / 2021'), tracker: 'kinozal'}, episode(8))).toBe(true);
    expect(matchesJacred({...lostfilm('Американская история преступлений (3 сезон: 1-5 серии) / American Crime Story / 2021'), tracker: 'kinozal'}, episode(8))).toBe(false);
    expect(matchesJacred({...lostfilm('Американская история преступлений (3 сезон) [+10 серия] [Ultradox] [720p]'), tracker: 'ultradox'}, episode(8))).toBe(true);
    expect(matchesJacred({...lostfilm('Американская история преступлений (3 сезон) [+6 серия] [Ultradox] [720p]'), tracker: 'ultradox'}, episode(8))).toBe(false);
    expect(matchesJacred({...lostfilm('Американская история преступлений / Сезон 3, серия 8 / 2021'), tracker: 'rutor'}, episode(8))).toBe(true);
  });
});

describe('Stremio torrent addons', () => {
  it('reads a Comet stream: release name, seeders, size, origin and flag languages', () => {
    const stream = addonToStream('Comet', {
      name: '[TORRENT🧲] Comet 1080p',
      description: '📄 American.Crime.Story.S03E08.VOSTFR.1080p.WEB-DL.DDP5.1.H.264-LPKFM\n📹 avc | 🔊 Dolby Digital Plus • 5.1\n⭐ WEB-DL | 🏷️ LPKFM\n👤 2 💾 3.2 GB 🔎 Comet|Ygg API\n🇫🇷',
      infoHash: 'C396BC6ED04670A5A106ABAD84C7DEA831DE39FC',
      sources: ['udp://tracker-udp.gbitt.info:80/announce'],
    })!;
    expect(stream.server).toBe('Comet');
    expect(stream.title).toBe('American.Crime.Story.S03E08.VOSTFR.1080p.WEB-DL.DDP5.1.H.264-LPKFM');
    expect(stream.link).toMatch(/^magnet:\?xt=urn:btih:c396bc6ed04670a5a106abad84c7dea831de39fc&dn=.+&tr=udp/);
    expect(stream.tags).toEqual(expect.arrayContaining(['1080p', '👤2', 'FR', '3.2 GB']));
  });

  it('names the index a Comet release came from and leaves out a missing seeder count', () => {
    const stream = addonToStream('Comet', {
      description: '📄 American Crime Story S03E08 2160p DSNP WEB-DL mkv\n💾 4.2 GB 🔎 DMM',
      infoHash: 'c270c5ede73a20b7bf1db4783447da8ceb3edb07',
      behaviorHints: {videoSize: 4480055901},
    })!;
    expect(stream.server).toBe('Comet · DMM');
    expect(stream.tags!.some(tag => tag.startsWith('👤'))).toBe(false);
    expect(stream.tags).toEqual(expect.arrayContaining(['2160p', 'EN']));
  });

  it('reads a Peerflix stream and skips items without a valid hash', () => {
    const stream = addonToStream('Peerflix', {
      name: 'Peerflix 1080p',
      title: 'American.Crime.Story.S03.COMPLETE.1080p.WEBRip.AC3.x264-LESS\nAmerican.Crime.Story.S03E08.1080p.WEBRip.mkv\n🇬🇧\n  👤 8 💾 1.29 GB 🌐 Peerflix',
      infoHash: '5c643793147388eb614c919191a080ed186ded57',
      sources: ['tracker:udp://open.stealth.si:80/announce'],
    })!;
    expect(stream.title).toBe('American.Crime.Story.S03.COMPLETE.1080p.WEBRip.AC3.x264-LESS');
    expect(stream.tags).toEqual(expect.arrayContaining(['👤8', 'EN', '1.29 GB']));
    expect(stream.link).toContain('&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce');
    expect(addonToStream('Peerflix', {infoHash: 'nothex'})).toBeUndefined();
  });
});

import {streamBadges} from '../src/lib/player/streamBadges';

it('keeps seed counts and details from both provider metadata fields without repeats', () => {
  expect(streamBadges({quality: '1080', tags: ['1080p', '👤42', 'AVC'], tag: '1080p • 👤42 • RU, GB • 2.74 GB'}))
    .toEqual(['1080p', '👤42', 'AVC', 'RU, GB', '2.74 GB']);
});

it('retains details supplied only as a tag or only as tags, including zero seeds', () => {
  expect(streamBadges({tag: '👤0 · HDR · 23.98 GB'})).toEqual(['👤0', 'HDR', '23.98 GB']);
  expect(streamBadges({tags: ['WEB-DL', 'EN']})).toEqual(['WEB-DL', 'EN']);
});

it('hides historical peer counts and dates from provider fields and cached entries', () => {
  expect(streamBadges({quality: '1080', tags: ['≈143 seeders, 8 leechers (02.2026)', 'RU', '👤6'], tag: '≈143 seeders, 8 leechers (02.2026) • WEB-DL • ⬇2 • 2 GB'}))
    .toEqual(['1080p', 'RU', '👤6', 'WEB-DL', '⬇2', '2 GB']);
});

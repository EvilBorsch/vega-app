import {streamBadges} from '../src/lib/player/streamBadges';

it('keeps seed counts and details from both provider metadata fields without repeats', () => {
  expect(streamBadges({quality: '1080', tags: ['1080p', '👤42', 'AVC'], tag: '1080p • 👤42 • RU, GB • 2.74 GB'}))
    .toEqual(['1080p', '👤42', 'AVC', 'RU, GB', '2.74 GB']);
});

it('retains details supplied only as a tag or only as tags, including zero seeds', () => {
  expect(streamBadges({tag: '👤0 · HDR · 23.98 GB'})).toEqual(['👤0', 'HDR', '23.98 GB']);
  expect(streamBadges({tags: ['WEB-DL', 'EN']})).toEqual(['WEB-DL', 'EN']);
});

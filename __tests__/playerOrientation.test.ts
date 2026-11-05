import {playerOrientation} from '../src/lib/player/playerOrientation';

describe('player orientation', () => {
  it('lets the source list follow the phone and keeps playback landscape', () => {
    // The source list used to stay landscape however the phone was turned.
    expect(playerOrientation({isTV: false, isRemoteActive: false, choosingSource: true})).toBe('default');
    expect(playerOrientation({isTV: false, isRemoteActive: false, choosingSource: false})).toBe('landscape');
  });

  it('keeps the remote screen portrait and TVs landscape', () => {
    expect(playerOrientation({isTV: false, isRemoteActive: true, choosingSource: true})).toBe('portrait');
    expect(playerOrientation({isTV: true, isRemoteActive: false, choosingSource: true})).toBe('landscape');
  });
});

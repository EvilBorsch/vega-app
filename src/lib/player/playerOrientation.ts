/**
 * The player screen's orientation, applied as its react-native-screens option
 * (the only orientation mechanism the player uses): playback is landscape, the
 * remote screen portrait, and the source list follows the phone. Leaving the
 * player drops the option, so the rest of the app rotates as the system says.
 */
export const playerOrientation = ({
  isTV,
  isRemoteActive,
  choosingSource,
}: {
  isTV: boolean;
  isRemoteActive: boolean;
  choosingSource: boolean;
}): 'landscape' | 'portrait' | 'default' => {
  if (isTV) return 'landscape';
  if (isRemoteActive) return 'portrait';
  return choosingSource ? 'default' : 'landscape';
};

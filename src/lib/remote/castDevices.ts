type CastDeviceLike = {deviceId: string};

/**
 * Google Cast devices for the picker: the connected one first, then the library's
 * list and Vega's own scan (the library's can stay empty for a whole run).
 */
export const mergeCastDevices = <T extends CastDeviceLike>(
  connected: T | null | undefined,
  library: T[],
  scanned: T[],
): T[] => {
  const seen = new Set<string>();
  return [...(connected ? [connected] : []), ...library, ...scanned].filter(device => {
    if (seen.has(device.deviceId)) return false;
    seen.add(device.deviceId);
    return true;
  });
};

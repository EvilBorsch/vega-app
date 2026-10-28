import {dlnaService as dlna} from '../src/lib/remote/dlnaService';
import {NativeModules} from 'react-native';
import {useRemoteStore} from '../src/lib/remote/remoteStore';
jest.mock('react-native', () => ({
  Platform: {OS: 'android'},
  DeviceEventEmitter: {addListener: jest.fn()},
  NativeModules: {
    VegaDlna: {
      setAVTransportURI: jest.fn(async () => {}),
      play: jest.fn(async () => {}),
      stop: jest.fn(async () => {}),
      getPositionInfo: jest.fn(),
    },
  },
}));
const native = NativeModules.VegaDlna;
const device = {
  id: 'tv',
  name: 'TV',
  type: 'dlna' as const,
  controlUrl: 'http://tv',
};
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useRemoteStore.getState().resetSession();
});
it('stops a previous transport before setting a new URI', async () => {
  await dlna.loadMedia(device, 'http://phone/B');
  expect(native.stop).toHaveBeenCalledWith('http://tv');
  expect(native.stop.mock.invocationCallOrder[0]).toBeLessThan(
    native.setAVTransportURI.mock.invocationCallOrder[0],
  );
});
it('does not set a new URI when canceled during Stop', async () => {
  let finish!: () => void;
  native.stop.mockImplementationOnce(() => new Promise<void>(resolve => {finish = resolve;}));
  let current = true;
  const loading = dlna.loadMedia(device, 'http://phone/B', 'B', undefined, 0, 0, () => current);
  const canceled = expect(loading).rejects.toThrow('canceled');
  await tick();
  current = false;
  finish();
  await canceled;
  expect(native.setAVTransportURI).not.toHaveBeenCalled();
});
it('continues when Stop reports an already stopped renderer', async () => {
  native.stop.mockRejectedValueOnce(new Error('Stop failed'));
  await dlna.loadMedia(device, 'http://phone/B');
  expect(native.play).toHaveBeenCalledTimes(1);
});
it('retries a transition rejection once after stopping the renderer', async () => {
  native.setAVTransportURI.mockRejectedValueOnce(new Error('UPnP error 701: Transition not available'));
  const loading = dlna.loadMedia(device, 'http://phone/B');
  await jest.advanceTimersByTimeAsync(500);
  await loading;
  expect(native.setAVTransportURI).toHaveBeenCalledTimes(2);
  expect(native.play).toHaveBeenCalledTimes(1);
});
it('does not retry unsupported media failures', async () => {
  native.setAVTransportURI.mockRejectedValueOnce(new Error('UPnP error 714: Illegal MIME-type'));
  await expect(dlna.loadMedia(device, 'http://phone/B')).rejects.toThrow('714');
  expect(native.setAVTransportURI).toHaveBeenCalledTimes(1);
  expect(native.play).not.toHaveBeenCalled();
});
afterEach(() => {
  dlna.stopPolling();
  jest.useRealTimers();
});
it('allows one poll in flight and discards its reply after a stream replacement', async () => {
  let resolve!: (v: any) => void;
  native.getPositionInfo.mockImplementation(
    () => new Promise(r => (resolve = r)),
  );
  await dlna.loadMedia(device, 'http://phone/A', 'A', undefined, 0, 900);
  jest.advanceTimersByTime(3000);
  expect(native.getPositionInfo).toHaveBeenCalledTimes(1);
  await dlna.loadMedia(device, 'http://phone/B', 'B', undefined, 200, 600);
  resolve({position: 10, duration: 900, trackUri: 'http://phone/A'});
  await tick();
  expect(useRemoteStore.getState().currentTime).toBe(0);
  native.getPositionInfo.mockResolvedValue({position: 5, duration: 600});
  jest.advanceTimersByTime(1000);
  await tick();
  expect(useRemoteStore.getState().currentTime).toBe(205);
  expect(useRemoteStore.getState().duration).toBe(600);
});
it('does not send Play when a load is canceled while setting its URI', async () => {
  let resolve!: () => void;
  native.setAVTransportURI.mockImplementationOnce(
    () => new Promise<void>(r => (resolve = r)),
  );
  let current = true;
  const loading = dlna.loadMedia(
    device,
    'http://phone/A',
    'A',
    undefined,
    0,
    900,
    () => current,
  );
  const canceled = expect(loading).rejects.toThrow('canceled');
  await tick();
  current = false;
  resolve();
  await canceled;
  expect(native.play).not.toHaveBeenCalled();
});

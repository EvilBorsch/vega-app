import {retryWithDelays} from '../src/lib/utils/retryWithDelays';

describe('retryWithDelays', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  it('tries again after each delay until the task succeeds', async () => {
    // A network error on first launch left "No Provider Installed" until a restart.
    const task = jest.fn()
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue(undefined);
    retryWithDelays(task, [5000, 15000, 30000]);
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    await flush();
    expect(task).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(15000);
    await flush();
    expect(task).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(60000);
    await flush();
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last delay and can be stopped', async () => {
    const giveUp = jest.fn();
    const task = jest.fn().mockRejectedValue(new Error('offline'));
    retryWithDelays(task, [1000], giveUp);
    await flush();
    jest.advanceTimersByTime(1000);
    await flush();
    expect(task).toHaveBeenCalledTimes(2);
    expect(giveUp).toHaveBeenCalledWith(expect.any(Error));

    const other = jest.fn().mockRejectedValue(new Error('offline'));
    const stop = retryWithDelays(other, [1000, 1000]);
    await flush();
    stop();
    jest.advanceTimersByTime(5000);
    await flush();
    expect(other).toHaveBeenCalledTimes(1);
  });
});

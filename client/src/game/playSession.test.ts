import { describe, expect, it, vi } from 'vitest';
import { createPlaySession } from './playSession';

function api() {
  return { start: vi.fn(async (_name: string) => 'play-1'), finish: vi.fn(async (_input: unknown) => {}), legacy: vi.fn(async (_score: number, _name: string) => []) };
}
const result = { score: 100, resultType: 'clear' as const, reachedWave: 5 };
describe('play consent and one result per start', () => {
  it('blank and whitespace games never start or submit public records', async () => {
    for (const name of ['', '   ']) {
      const remote = api(); const play = createPlaySession(name, remote);
      await play.submit(result); await play.submit(result);
      expect(remote.start).not.toHaveBeenCalled(); expect(remote.finish).not.toHaveBeenCalled(); expect(remote.legacy).not.toHaveBeenCalled();
    }
  });
  it('captures the start name and shares one result request while the start is pending', async () => {
    const remote = api(); let resolve!: (id: string) => void;
    remote.start.mockImplementation(() => new Promise(r => { resolve = r; }));
    let name = 'Alice'; const play = createPlaySession(name, remote); name = 'Bob';
    const first = play.submit(result); const repeat = play.submit({ ...result, score: 999 });
    expect(first).toBe(repeat); resolve('play-a'); await first;
    expect(remote.finish).toHaveBeenCalledTimes(1); expect(remote.finish).toHaveBeenCalledWith({ ...result, playId: 'play-a', playerName: 'Alice' });
  });
  it('never resubmits an ambiguous failure on result redraw or ranking retry', async () => {
    const remote = api(); remote.finish.mockRejectedValue(new Error('offline'));
    const play = createPlaySession('Alice', remote);
    await expect(play.submit(result)).rejects.toThrow('offline');
    await expect(play.submit(result)).rejects.toThrow('offline');
    expect(remote.finish).toHaveBeenCalledTimes(1); expect(remote.legacy).not.toHaveBeenCalled();
  });
  it('isolates late start responses from the next play and retains the existing legacy fallback once', async () => {
    const remote = api(); remote.start.mockRejectedValue(new Error('offline'));
    const old = createPlaySession('Alice', remote); const next = createPlaySession('Bob', api());
    await old.submit(result); await old.submit(result); await next.submit(result);
    expect(remote.legacy).toHaveBeenCalledTimes(1); expect(remote.legacy).toHaveBeenCalledWith(100, 'Alice');
  });
});

import { describe, expect, it, vi } from "vitest";
import { createPlayQueue } from "./playSession";
const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "20000000-0000-4000-8000-000000000002";
const playId = "30000000-0000-4000-8000-000000000003";
const result = { score: 100, resultType: "clear" as const, reachedWave: 4 };
function storage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  } as Storage;
}
function api() {
  return {
    start: vi.fn(
      async (_name: string, _id?: string, _version?: string) => playId
    ),
    finish: vi.fn(async (_input: unknown) => {}),
  };
}
describe("immutable consent and durable Masumen start/finish queue", () => {
  it("blank/whitespace never call either write and later names do not publish guest results", async () => {
    const remote = api(),
      q = createPlayQueue({
        api: remote,
        storage: storage(),
        uuid: () => firstId,
      });
    await q.create("  ").submit(result);
    q.create("Alice");
    expect(remote.start).toHaveBeenCalledTimes(1);
    expect(remote.finish).not.toHaveBeenCalled();
    expect(q.pending()).toEqual([]);
  });
  it("captures name/version and one final result while start is pending", async () => {
    const remote = api();
    let resolve!: (id: string) => void;
    remote.start.mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    const q = createPlayQueue({
        api: remote,
        storage: storage(),
        uuid: () => firstId,
        clientVersion: "old-version",
      }),
      play = q.create(" Alice ");
    const first = play.submit(result),
      repeat = play.submit({ ...result, score: 999 });
    expect(first).toBe(repeat);
    expect(q.pending()[0].result.score).toBe(100);
    resolve(playId);
    await first;
    expect(remote.start).toHaveBeenCalledWith("Alice", firstId, "old-version");
    expect(remote.finish).toHaveBeenCalledTimes(1);
    expect(remote.finish).toHaveBeenCalledWith({
      ...result,
      playId,
      playerName: "Alice",
      clientVersion: "old-version",
    });
  });
  it("recovers a lost start acknowledgement after reload with the exact UUID and only one logical start", async () => {
    const disk = storage(),
      remote = api(),
      ledger = new Set<string>();
    let lose = true;
    remote.start.mockImplementation(async (_name, id) => {
      ledger.add(id!);
      if (lose) throw Error("lost start ack");
      return playId;
    });
    const q = createPlayQueue({
        api: remote,
        storage: disk,
        uuid: () => firstId,
        clientVersion: "captured",
      }),
      play = q.create("Alice");
    await expect(play.submit(result)).rejects.toThrow("lost start ack");
    await expect(play.submit(result)).rejects.toThrow();
    expect(remote.start).toHaveBeenCalledTimes(1);
    lose = false;
    const reload = createPlayQueue({
      api: remote,
      storage: disk,
      clientVersion: "new-version",
    });
    await reload.restore(firstId)!.retry();
    expect(ledger.size).toBe(1);
    expect(remote.start).toHaveBeenLastCalledWith("Alice", firstId, "captured");
    expect(reload.pending()).toEqual([]);
  });
  it("lost finish acknowledgement retries the same play without another start or legacy fallback", async () => {
    const disk = storage(),
      remote = api(),
      ledger = new Set<string>();
    let lose = true;
    remote.finish.mockImplementation(async (input: any) => {
      ledger.add(input.playId);
      if (lose) throw Error("lost finish ack");
    });
    const q = createPlayQueue({
        api: remote,
        storage: disk,
        uuid: () => firstId,
      }),
      play = q.create("Alice");
    await expect(play.submit(result)).rejects.toThrow();
    lose = false;
    const reload = createPlayQueue({ api: remote, storage: disk });
    await Promise.all([
      reload.restore(firstId)!.retry(),
      reload.restore(firstId)!.retry(),
    ]);
    expect(remote.start).toHaveBeenCalledTimes(1);
    expect(remote.finish).toHaveBeenCalledTimes(2);
    expect(ledger.size).toBe(1);
    expect(reload.pending()).toEqual([]);
    expect(
      JSON.parse(disk.getItem("masumen.pending-play.v1:" + firstId)!)
    ).toMatchObject({ sent: true, result });
  });
  it("one tab acknowledgement never overwrites a second tab pending result", async () => {
    const disk = storage(),
      offline = api();
    offline.finish.mockRejectedValue(Error("offline"));
    const a = createPlayQueue({
      api: offline,
      storage: disk,
      uuid: () => firstId,
    });
    await expect(a.create("Alice").submit(result)).rejects.toThrow();
    const b = createPlayQueue({
      api: offline,
      storage: disk,
      uuid: () => secondId,
    });
    await expect(
      b.create("Bob").submit({ ...result, score: 300 })
    ).rejects.toThrow();
    const online = createPlayQueue({ api: api(), storage: disk });
    await online.restore(firstId)!.retry();
    const reread = createPlayQueue({ api: api(), storage: disk });
    expect(reread.pending().map(x => x.startId)).toEqual([secondId]);
  });
  it("retains a permanent rejection without retrying or replacing its payload", async () => {
    const remote = api();
    remote.finish.mockRejectedValue(
      Object.assign(Error("conflict"), { permanent: true })
    );
    const q = createPlayQueue({
        api: remote,
        storage: storage(),
        uuid: () => firstId,
      }),
      play = q.create("Alice");
    await expect(play.submit(result)).rejects.toThrow();
    await expect(play.retry()).rejects.toThrow();
    expect(remote.finish).toHaveBeenCalledTimes(1);
    expect(play.status()).toBe("rejected");
    expect(q.pending()[0].result).toEqual(result);
  });
  it("drops abandoned unfinished session references without deleting finalized pending results", async () => {
    const remote = api();
    let id = firstId;
    const q = createPlayQueue({
      api: remote,
      storage: storage(),
      uuid: () => id,
    });
    q.create("Alice");
    id = secondId;
    q.create("Bob");
    expect(q.restore(firstId)).toBeNull();
  });
  it("storage denial keeps a retryable result in this session", async () => {
    const disk = {
      get length() {
        throw Error("denied");
      },
      setItem() {
        throw Error("denied");
      },
      removeItem() {
        throw Error("denied");
      },
    } as unknown as Storage;
    const remote = api();
    remote.finish.mockRejectedValueOnce(Error("offline"));
    const q = createPlayQueue({
        api: remote,
        storage: disk,
        uuid: () => firstId,
      }),
      play = q.create("Alice");
    await expect(play.submit(result)).rejects.toThrow();
    expect(q.pending()).toHaveLength(1);
    expect(play.isPersistent()).toBe(false);
    expect(q.pending()[0].persisted).toBe(false);
    await expect(play.retry()).rejects.toThrow();
    expect(remote.finish).not.toHaveBeenCalled();
    expect(q.pending()).toHaveLength(1);
  });
});

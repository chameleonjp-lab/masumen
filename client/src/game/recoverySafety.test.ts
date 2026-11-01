import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayQueue } from "./playSession";
import { normalizeRanking, startMasumenPlay } from "./platform";
const id = "10000000-0000-4000-8000-000000000001",
  remoteId = "30000000-0000-4000-8000-000000000003";
const key = "masumen.pending-play.v1:" + id;
const result = { score: 100, resultType: "clear" as const, reachedWave: 4 };
function storage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
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
  return { start: vi.fn(async () => remoteId), finish: vi.fn(async () => {}) };
}
afterEach(() => vi.restoreAllMocks());
describe("recovery must preserve uncertain records", () => {
  it("does not replace malformed data on an ID collision or start a conflicting play", async () => {
    const disk = storage();
    disk.setItem(key, "{broken");
    const remote = api();
    const play = createPlayQueue({
      api: remote,
      storage: disk,
      uuid: () => id,
    }).create("Alice");
    await expect(play.submit(result)).rejects.toThrow();
    expect(disk.getItem(key)).toBe("{broken");
    expect(remote.start).not.toHaveBeenCalled();
    expect(remote.finish).not.toHaveBeenCalled();
  });
  it("does not finish until the full result is read back from storage", async () => {
    const disk = storage();
    disk.setItem = () => {};
    const remote = api();
    const play = createPlayQueue({
      api: remote,
      storage: disk,
      uuid: () => id,
    }).create("Alice");
    await expect(play.submit(result)).rejects.toThrow();
    expect(play.isPersistent()).toBe(false);
    expect(remote.finish).not.toHaveBeenCalled();
  });
  it("retries persistence before sending after quota recovers", async () => {
    const disk = storage();
    const put = disk.setItem;
    disk.setItem = () => {
      throw Error("quota");
    };
    const remote = api();
    const q = createPlayQueue({ api: remote, storage: disk, uuid: () => id });
    const play = q.create("Alice");
    await expect(play.submit(result)).rejects.toThrow();
    expect(remote.finish).not.toHaveBeenCalled();
    disk.setItem = put;
    await play.retry();
    expect(remote.finish).toHaveBeenCalledTimes(1);
    expect(q.pending()).toEqual([]);
  });
  it("does not consume or overwrite changed payload after finish ACK", async () => {
    const disk = storage();
    const remote = api();
    let accept!: () => void;
    remote.finish.mockImplementation(
      () => new Promise<void>(r => (accept = r))
    );
    const q = createPlayQueue({ api: remote, storage: disk, uuid: () => id });
    const p = q.create("Alice").submit(result);
    await vi.waitFor(() => expect(remote.finish).toHaveBeenCalled());
    const changed = JSON.stringify({
      ...JSON.parse(disk.getItem(key)!),
      result: { ...result, score: 999 },
    });
    disk.setItem(key, changed);
    accept();
    await expect(p).rejects.toThrow();
    expect(disk.getItem(key)).toBe(changed);
  });
  it("does not overwrite changed payload after a delayed failure", async () => {
    const disk = storage();
    const remote = api();
    let reject!: (e: Error) => void;
    remote.finish.mockImplementation(
      () => new Promise<void>((_, r) => (reject = r))
    );
    const q = createPlayQueue({ api: remote, storage: disk, uuid: () => id });
    const p = q.create("Alice").submit(result);
    await vi.waitFor(() => expect(remote.finish).toHaveBeenCalled());
    disk.setItem(key, "not JSON");
    reject(Error("offline"));
    await expect(p).rejects.toThrow();
    expect(disk.getItem(key)).toBe("not JSON");
  });
  it("keeps sent tombstone if removal fails and never starts another play with that UUID", async () => {
    const disk = storage();
    disk.removeItem = () => {
      throw Error("blocked");
    };
    const remote = api();
    await createPlayQueue({ api: remote, storage: disk, uuid: () => id })
      .create("Alice")
      .submit(result);
    const again = createPlayQueue({
      api: remote,
      storage: disk,
      uuid: () => id,
    });
    expect(again.pending()).toEqual([]);
    await expect(again.create("Bob").submit(result)).rejects.toThrow();
    expect(remote.start).toHaveBeenCalledTimes(1);
  });
  it("does not expose mutable internal pending references", async () => {
    const disk = storage(),
      remote = api();
    remote.finish.mockRejectedValue(Error("offline"));
    const q = createPlayQueue({ api: remote, storage: disk, uuid: () => id });
    const play = q.create("Alice");
    await expect(play.submit(result)).rejects.toThrow();
    q.pending()[0].result.score = 999;
    remote.finish.mockResolvedValue();
    await play.retry();
    expect(remote.finish.mock.calls.at(-1)?.[0]).toMatchObject({ score: 100 });
  });
});
describe("ranking transport validation", () => {
  for (const value of [
    null,
    {},
    [null],
    [{ rank_no: 0, display_name: "Alice", best_score: 100 }],
    [{ rank_no: 1, display_name: "Alice", best_score: "oops" }],
    [{ rank_no: 1, best_score: 100 }],
  ])
    it(
      "rejects malformed rows instead of inventing rank/score " +
        JSON.stringify(value),
      () => {
        expect(() => normalizeRanking(value)).toThrow();
      }
    );
  it("retains signed legacy integer scores and ties", () => {
    expect(
      normalizeRanking([
        { rank_no: 3, display_name: "Alice", best_score: -12 },
        { rank_no: 3, display_name: "Bob", best_score: -12 },
      ])
    ).toEqual([
      { rank: 3, displayName: "Alice", score: -12 },
      { rank: 3, displayName: "Bob", score: -12 },
    ]);
  });
  it("rejects non UUID play IDs from an otherwise matching start response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        accepted: true,
        duplicate: false,
        start_id: id,
        play_id: "-".repeat(36),
        game_slug: "masumen",
        display_name: "Alice",
        normalized_name: "Alice",
        client_version: "v1",
      }),
    } as Response);
    await expect(startMasumenPlay("Alice", id, "v1")).rejects.toThrow();
  });
});
it("does not restore an impossible early clear or fifth wave as a normal finished run", () => {
  const disk = storage();
  for (const [resultType, reachedWave] of [
    ["clear", 1],
    ["clear", 5],
    ["game_over", 5],
  ]) {
    disk.setItem(
      key,
      JSON.stringify({
        startId: id,
        playerName: "Alice",
        clientVersion: "v1",
        result: { score: 100, resultType, reachedWave },
      })
    );
    const q = createPlayQueue({ api: api(), storage: disk });
    expect(q.pending()).toEqual([]);
    expect(disk.getItem(key)).not.toBeNull();
  }
});
it("retains every pending result beyond 30 entries without dropping corrupt siblings", async () => {
  const disk = storage(),
    remote = api();
  remote.finish.mockRejectedValue(Error("offline"));
  for (let n = 1; n <= 35; n++) {
    const uuid = `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    await expect(
      createPlayQueue({ api: remote, storage: disk, uuid: () => uuid })
        .create("Alice")
        .submit(result)
    ).rejects.toThrow();
  }
  disk.setItem("masumen.pending-play.v1:broken", "raw");
  expect(
    createPlayQueue({ api: remote, storage: disk }).pending()
  ).toHaveLength(35);
  expect(disk.getItem("masumen.pending-play.v1:broken")).toBe("raw");
});
it("does not mistake a generic finish acknowledgement for newly recorded ranking score", async () => {
  const { finishMasumenPlay } = await import("./platform");
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      accepted: true,
      duplicate: false,
      play_id: remoteId,
      game_slug: "masumen",
      result_type: "clear",
      reached_wave: 4,
      score: 100,
    }),
  } as Response);
  await expect(
    finishMasumenPlay({ playId: remoteId, playerName: "Alice", ...result })
  ).rejects.toThrow();
});
it("does not reuse an unfinished start UUID after dropping its heavy session reference", async () => {
  const remote = api(),
    q = createPlayQueue({ api: remote, storage: storage(), uuid: () => id });
  q.create("Alice");
  const second = q.create("Alice");
  await expect(second.submit(result)).rejects.toThrow();
  expect(remote.start).toHaveBeenCalledTimes(1);
  expect(remote.finish).not.toHaveBeenCalled();
});

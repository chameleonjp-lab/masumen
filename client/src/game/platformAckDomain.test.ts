import { afterEach, describe, expect, it, vi } from "vitest";
import { finishMasumenPlay } from "./platform";
import { createPlayQueue } from "./playSession";

const playId = "11111111-1111-4111-8111-111111111111";
const startId = "22222222-2222-4222-8222-222222222222";
const result = { score: 100, resultType: "game_over" as const, reachedWave: 1 };
const shortAck = { accepted: true, duplicate: true, play_id: playId, game_slug: "masumen", result_type: result.resultType, reached_wave: 1, score: 100 };
const fullAck = { ...shortAck, duplicate: false, score_recorded: true, best_score: 100, play_count: 1, is_new_best: true };
function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return { get length() { return entries.size; }, key: i => [...entries.keys()][i] ?? null, getItem: k => entries.get(k) ?? null, setItem: (k, v) => { entries.set(k, v); }, removeItem: k => { entries.delete(k); }, clear: () => entries.clear() };
}
afterEach(() => vi.restoreAllMocks());

describe("dedicated finish ACK integer contract", () => {
  it.each([
    ["best overflow", { best_score: 2147483648 }],
    ["best underflow", { best_score: -2147483649 }],
    ["count overflow", { play_count: 2147483648 }],
  ])("keeps %s pending and retries the exact play after reload", async (_label, patch) => {
    const requests: unknown[] = [];
    let ack: unknown = { ...fullAck, ...patch };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return { ok: true, json: async () => ack } as Response;
    });
    const storage = memoryStorage();
    const api = { start: async () => playId, finish: finishMasumenPlay };
    const first = createPlayQueue({ storage, api, uuid: () => startId });
    const session = first.create("Alice");
    await expect(session.submit(result)).rejects.toThrow();
    expect(session.status()).toBe("pending");
    expect(first.pending()).toHaveLength(1);
    ack = shortAck;
    const reloaded = createPlayQueue({ storage, api });
    const pending = reloaded.pending()[0]!;
    await reloaded.restore(pending.startId)!.retry();
    expect(reloaded.pending()).toHaveLength(0);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
  });
  it.each([
    ["duplicate short acknowledgement", shortAck],
    ["zero count from fallback", { ...fullAck, play_count: 0 }],
    ["maximum signed integers", { ...fullAck, best_score: 2147483647, play_count: 2147483647 }],
    ["signed historical best", { ...fullAck, best_score: -2147483648 }],
  ])("preserves %s", async (_label, ack) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ack } as Response);
    await expect(finishMasumenPlay({ ...result, playId, playerName: "Alice" })).resolves.toBeUndefined();
  });
});

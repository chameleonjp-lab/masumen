import { it, expect, vi } from "vitest";
import { createPlayQueue } from "./playSession";
import { CardAudio } from "./cardAudio";
it("read lease must bind to the same exact raw payload parsed", async () => {
  const id = "10000000-0000-4000-8000-000000000001",
    key = "masumen.pending-play.v1:" + id;
  const a = {
    startId: id,
    playerName: "Alice",
    clientVersion: "v",
    playId: "30000000-0000-4000-8000-000000000003",
    result: { score: 100, resultType: "clear", reachedWave: 4 },
  };
  const rawA = JSON.stringify(a),
    rawB = JSON.stringify({
      ...a,
      playerName: "Bob",
      result: { ...a.result, score: 900 },
    });
  let raw = rawA,
    reads = 0;
  const storage = {
    length: 1,
    key: () => key,
    getItem() {
      if (++reads === 1) {
        raw = rawB;
        return rawA;
      }
      return raw;
    },
    setItem(_k: string, v: string) {
      raw = v;
    },
    removeItem() {},
    clear() {},
  } as Storage;
  const api = {
    start: vi.fn(async () => a.playId),
    finish: vi.fn(async () => {}),
  };
  const q = createPlayQueue({ api, storage });
  const play = q.restore(id)!;
  await play.retry().catch(() => {});
  expect(api.finish).not.toHaveBeenCalled();
  expect(raw).toBe(rawB);
});
it("interrupted before event delivery clears voices before resume", () => {
  const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  let stopped = 0;
  const ctx = {
    state: "running",
    currentTime: 10,
    destination: {},
    resume() {
      this.state = "running";
      return Promise.resolve();
    },
    createOscillator() {
      return {
        frequency: param,
        connect(g: any) {
          return g;
        },
        disconnect() {},
        start() {},
        stop() {
          stopped++;
        },
      };
    },
    createGain() {
      return { gain: param, connect() {}, disconnect() {} };
    },
  };
  vi.stubGlobal("window", {
    AudioContext: function () {
      return ctx;
    },
  });
  const audio = new CardAudio();
  audio.unlock();
  audio.playPlayerAttack(false);
  const before = stopped;
  ctx.state = "interrupted";
  audio.unlock();
  expect(stopped).toBeGreaterThan(before);
  vi.unstubAllGlobals();
});

it("successful write with transient readback failure can retry exact self-written result", async () => {
  const id = "10000000-0000-4000-8000-000000000002";
  let raw: string | null = null,
    failRead = false;
  const storage = {
    length: 0,
    key: () => null,
    getItem() {
      if (failRead) {
        failRead = false;
        throw Error("temporary readback");
      }
      return raw;
    },
    setItem(_k: string, v: string) {
      raw = v;
      failRead = true;
    },
    removeItem() {},
    clear() {},
  } as Storage;
  const api = {
    start: vi.fn(async () => "30000000-0000-4000-8000-000000000003"),
    finish: vi.fn(async () => {}),
  };
  const q = createPlayQueue({ api, storage, uuid: () => id });
  const p = q.create("Alice");
  await p
    .submit({ score: 100, resultType: "clear", reachedWave: 4 })
    .catch(() => {});
  storage.setItem = (_k, v) => {
    raw = v;
  };
  failRead = false;
  await p.retry().catch(() => {});
  expect(api.finish).toHaveBeenCalledTimes(1);
});
it("never downgrades an acknowledged result after receipt readback was temporarily unavailable", async () => {
  const id = "10000000-0000-4000-8000-000000000003";
  let raw: string | null = null,
    failRead = false,
    once = true;
  const storage = {
    length: 0,
    key: () => null,
    getItem() {
      if (failRead) {
        failRead = false;
        throw Error("readback temporarily blocked");
      }
      return raw;
    },
    setItem(_k: string, v: string) {
      raw = v;
      if (once && JSON.parse(v).sent) {
        once = false;
        failRead = true;
      }
    },
    removeItem() {},
    clear() {},
  } as Storage;
  const api = {
    start: vi.fn(async () => "30000000-0000-4000-8000-000000000003"),
    finish: vi.fn(async () => {}),
  };
  const q = createPlayQueue({ api, storage, uuid: () => id }),
    play = q.create("Alice");
  await play
    .submit({ score: 100, resultType: "clear", reachedWave: 4 })
    .catch(() => {});
  await play.retry();
  expect(api.finish).toHaveBeenCalledTimes(1);
  expect(JSON.parse(raw!).sent).toBe(true);
  expect(q.pending()).toEqual([]);
});

it("closed context before event delivery clears old voices before replacement", () => {
  const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  let stopped = 0;
  const contexts: any[] = [];
  vi.stubGlobal("window", {
    AudioContext: function () {
      const ctx = {
        state: "running",
        currentTime: 10,
        destination: {},
        resume() {
          return Promise.resolve();
        },
        createOscillator() {
          return {
            frequency: param,
            connect(g: any) {
              return g;
            },
            disconnect() {},
            start() {},
            stop() {
              stopped++;
            },
          };
        },
        createGain() {
          return { gain: param, connect() {}, disconnect() {} };
        },
      };
      contexts.push(ctx);
      return ctx;
    },
  });
  const audio = new CardAudio();
  audio.unlock();
  audio.playPlayerAttack(false);
  const before = stopped;
  contexts[0].state = "closed";
  audio.unlock();
  expect(contexts.length).toBe(2);
  expect(stopped).toBeGreaterThan(before);
  vi.unstubAllGlobals();
});

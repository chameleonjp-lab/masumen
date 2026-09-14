import { afterEach, describe, expect, it, vi } from "vitest";
import { CardAudio } from "./cardAudio";

class FakeAudioParam {
  setValueAtTime(_value: number, _time: number): void {}
  exponentialRampToValueAtTime(_value: number, _time: number): void {}
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect(destination: unknown): unknown {
    return destination;
  }
}

class FakeOscillatorNode {
  type: OscillatorType = "sine";
  frequency = new FakeAudioParam();
  connect(destination: FakeGainNode): FakeGainNode {
    return destination;
  }
  start(_time: number): void {}
  stop(_time: number): void {}
}

class FakeBufferSourceNode {
  buffer: unknown = null;
  connect(destination: FakeGainNode): FakeGainNode {
    return destination;
  }
  start(_time: number): void {}
  stop(_time: number): void {}
}

class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  sampleRate = 8_000;
  destination = {};
  oscillatorCount = 0;
  bufferSourceCount = 0;

  createOscillator(): FakeOscillatorNode {
    this.oscillatorCount += 1;
    return new FakeOscillatorNode();
  }
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createBuffer(
    _channels: number,
    length: number,
    _sampleRate: number
  ): {
    getChannelData: () => Float32Array;
  } {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createBufferSource(): FakeBufferSourceNode {
    this.bufferSourceCount += 1;
    return new FakeBufferSourceNode();
  }
  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
}

let contexts: FakeAudioContext[] = [];

class StubAudioContext extends FakeAudioContext {
  constructor() {
    super();
    contexts.push(this);
  }
}

function setupAudio(): { audio: CardAudio; context: FakeAudioContext } {
  vi.stubGlobal("window", { AudioContext: StubAudioContext });
  const audio = new CardAudio();
  audio.unlock();
  const context = contexts[0];
  if (!context) throw new Error("AudioContextが作成されていません");
  return { audio, context };
}

afterEach(() => {
  contexts = [];
  vi.unstubAllGlobals();
});

describe("CardAudioの戦闘SE", () => {
  it("プレイヤー攻撃・敵攻撃・被弾・カード効果を再生できる", () => {
    const { audio, context } = setupAudio();

    audio.playPlayerAttack(false);
    audio.playPlayerAttack(true);
    audio.playEnemyAttack("projectile", "homing");
    audio.playEnemyAttack("melee");
    audio.playEnemyAttack("field");
    audio.playPlayerHit(40);
    audio.playCard("repair", "回復", "standard", "recover");

    expect(context.oscillatorCount).toBeGreaterThan(0);
    expect(context.bufferSourceCount).toBeGreaterThan(0);
  });

  it("SEを無効化した後は新しい音源を作成しない", () => {
    const { audio, context } = setupAudio();
    audio.playPlayerAttack(false);
    const oscillatorCount = context.oscillatorCount;
    const bufferSourceCount = context.bufferSourceCount;

    audio.setEnabled(false);
    audio.playEnemyAttack("melee");
    audio.playPlayerHit(40);
    audio.playCard("repair", "回復", "standard", "recover");

    expect(context.oscillatorCount).toBe(oscillatorCount);
    expect(context.bufferSourceCount).toBe(bufferSourceCount);
  });
});

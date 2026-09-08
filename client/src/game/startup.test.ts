import { describe, expect, it, vi } from "vitest";
import { startGameRuntime, type StartupState } from "./startup";

async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function fixture() {
  let frame = () => {};
  const engine = { dispose: vi.fn(), runRenderLoop: vi.fn((render: () => void) => { frame = render; }) };
  const handle = { dispose: vi.fn(), scene: { render: vi.fn() } };
  const detach = vi.fn();
  const states: StartupState[] = [];
  const options = {
    createEngine: vi.fn(() => engine as typeof engine | null),
    createScene: vi.fn(async () => handle),
    attachResize: vi.fn(() => detach),
    onReady: vi.fn(),
    onState: (state: StartupState) => states.push(state),
  };
  return { engine, handle, detach, states, options, frame: () => frame() };
}

describe("起動・失敗・画面破棄", () => {
  it("初回描画が成功するまでゲーム操作を公開しない", async () => {
    const f = fixture();
    const dispose = startGameRuntime(f.options);
    await flush();
    expect(f.states.at(-1)).toEqual({ status: "loading", stage: "render" });
    expect(f.options.onReady).not.toHaveBeenCalled();
    f.frame(); f.frame();
    expect(f.states.at(-1)).toEqual({ status: "ready" });
    expect(f.options.onReady).toHaveBeenCalledOnce();
    dispose(); dispose(); f.frame();
    expect(f.handle.scene.render).toHaveBeenCalledTimes(2);
    expect(f.engine.dispose).toHaveBeenCalledOnce();
    expect(f.handle.dispose).toHaveBeenCalledOnce();
    expect(f.detach).toHaveBeenCalledOnce();
  });
  it("WebGL生成不可を特定し、シーン生成へ進まない", async () => {
    const f = fixture(); f.options.createEngine.mockReturnValue(null);
    startGameRuntime(f.options); await flush();
    expect(f.states.at(-1)).toEqual({ status: "failed", stage: "engine", code: "WebGLUnavailable" });
    expect(f.options.createScene).not.toHaveBeenCalled();
  });
  it("シーン生成失敗でエンジンとresize監視を解放し、例外本文は画面に出さない", async () => {
    const f = fixture(); f.options.createScene.mockRejectedValue(new TypeError("private URL"));
    const dispose = startGameRuntime(f.options); await flush(); dispose();
    expect(f.states.at(-1)).toEqual({ status: "failed", stage: "scene", code: "TypeError" });
    expect(f.engine.dispose).toHaveBeenCalledOnce();
    expect(f.detach).toHaveBeenCalledOnce();
  });
  it("初回描画の例外を診断でき、再描画しない", async () => {
    const f = fixture(); f.handle.scene.render.mockImplementation(() => { throw new RangeError(); });
    startGameRuntime(f.options); await flush(); f.frame(); f.frame();
    expect(f.states.at(-1)).toEqual({ status: "failed", stage: "render", code: "RangeError" });
    expect(f.options.onReady).not.toHaveBeenCalled();
    expect(f.handle.dispose).toHaveBeenCalledOnce();
    expect(f.handle.scene.render).toHaveBeenCalledOnce();
  });
  it("画面を閉じた後にシーン生成が完了しても資源を残さない", async () => {
    const f = fixture();
    let resolve!: (handle: typeof f.handle) => void;
    f.options.createScene.mockReturnValue(new Promise(done => { resolve = done; }));
    const dispose = startGameRuntime(f.options); await flush();
    dispose(); const before = f.states.length;
    resolve(f.handle); await flush();
    expect(f.handle.dispose).toHaveBeenCalledOnce();
    expect(f.engine.dispose).toHaveBeenCalledOnce();
    expect(f.engine.runRenderLoop).not.toHaveBeenCalled();
    expect(f.states).toHaveLength(before);
  });
  it("直ちに破棄した場合はシーンを生成しない（StrictMode再マウント）", async () => {
    const f = fixture(); startGameRuntime(f.options)(); await flush();
    expect(f.options.createScene).not.toHaveBeenCalled();
    expect(f.engine.dispose).toHaveBeenCalledOnce();
  });
});

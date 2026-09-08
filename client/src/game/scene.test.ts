import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGameScene } from "./scene";
import { projectileRenderPosition } from "./render/projectileVisuals";
import type { BattleSnapshot } from "./types";

// Keep Babylon geometry/material ownership real; omit browser image decoding only.
vi.mock("@babylonjs/core/Materials/Textures/texture", async importOriginal => {
  const actual = await importOriginal<typeof import("@babylonjs/core/Materials/Textures/texture")>();
  return { ...actual, Texture: class extends actual.Texture {
    constructor(_url: string, scene: Scene) { super(null, scene); }
  } };
});

const engines: NullEngine[] = [];
function setup(search = "?seed=12345") {
  const engine = new NullEngine(); engines.push(engine);
  const storage = new Map<string, string>();
  const listeners = new Map<string, Set<unknown>>();
  const events = (scope: string) => ({
    addEventListener: (name: string, callback: unknown) => {
      const key = scope + name;
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(callback);
    },
    removeEventListener: (name: string, callback: unknown) => listeners.get(scope + name)?.delete(callback),
  });
  vi.stubGlobal("window", {
    ...events("window:"), location: { search },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    matchMedia: vi.fn(() => ({ matches: false })),
  });
  vi.stubGlobal("document", { ...events("document:"), hidden: false });
  vi.stubGlobal("Element", class {});
  vi.spyOn(engine, "getDeltaTime").mockReturnValue(50);
  const canvas = { clientWidth: 390, clientHeight: 844 } as HTMLCanvasElement;
  return { engine, canvas, listeners, countListeners: () => Array.from(listeners.values()).reduce((n, set) => n + set.size, 0) };
}
afterEach(() => {
  engines.splice(0).forEach(engine => engine.dispose());
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("実シーンとGameWorldの接続", () => {
  it("各ウェーブに出現する全敵の描画が生成される", async () => {
    const seen = new Set<string>();
    for (let wave = 1; wave <= 4; wave++) {
      const f = setup(`?seed=12345&wave=${wave}`);
      let snapshot!: BattleSnapshot;
      const handle = await createGameScene(f.engine as unknown as Engine, f.canvas, { onSnapshot: next => { snapshot = next; } });
      for (const enemy of snapshot.enemies) {
        seen.add(enemy.id);
        const root = handle.scene.getTransformNodeByName(`enemy-${enemy.id}`);
        expect(root, `wave ${wave}: ${enemy.id}`).not.toBeNull();
        expect(root!.getChildMeshes().length).toBeGreaterThan(3);
      }
      handle.dispose(); handle.dispose();
      expect(f.countListeners()).toBe(0);
      expect(f.engine.scenes).toHaveLength(0);
    }
    expect(seen.size).toBeGreaterThan(5);
  });
  it("射撃・予兆・被弾を含む再挑戦10回でメッシュ・素材・ノードが増加しない", async () => {
    const f = setup();
    const handle = await createGameScene(f.engine as unknown as Engine, f.canvas);
    const counts = () => [handle.scene.meshes.length, handle.scene.materials.length, handle.scene.transformNodes.length];
    const frame = () => handle.scene.onBeforeRenderObservable.notifyObservers(handle.scene);
    frame();
    const baseline = counts();
    for (let cycle = 0; cycle < 10; cycle++) {
      handle.controller.confirmCustom();
      for (let step = 0; step < 120; step++) {
        if (step % 12 === 0) handle.controller.fire();
        if (step === 20) handle.controller.useSkill();
        frame();
      }
      handle.controller.restart(); frame();
      expect(counts(), `restart ${cycle + 1}`).toEqual(baseline);
    }
    handle.dispose();
    expect(f.countListeners()).toBe(0);
  });
  it("表示弾の位置をスナップショットの進行率から更新する", async () => {
    const f = setup();
    let latest!: BattleSnapshot;
    const handle = await createGameScene(f.engine as unknown as Engine, f.canvas, {
      onSnapshot: snapshot => { latest = snapshot; },
    });
    handle.controller.confirmCustom();
    handle.controller.fire();

    const projectile = latest.projectiles.find(candidate => candidate.owner === "player");
    if (!projectile) throw new Error("表示位置検査用のプレイヤー弾が生成されていません");
    const mesh = handle.scene.getMeshByName(`projectile-${projectile.id}`);
    expect(mesh).not.toBeNull();
    const renderPosition = projectileRenderPosition(projectile, latest.elapsed * 1000);
    expect(mesh!.position.x).toBeCloseTo((renderPosition.col - 2.5) * 1.48);
    expect(mesh!.position.z).toBeCloseTo((renderPosition.row - 1) * 1.48);
    expect(mesh!.position.y).toBeCloseTo(renderPosition.height + 0.12);

    handle.dispose();
  });
  it("シーン組立途中の例外でも外部イベント・resize監視・シーンを解放する", async () => {
    const f = setup();
    vi.mocked(window.matchMedia).mockImplementation(() => { throw new Error("construction failure"); });
    const before = f.engine.onResizeObservable.observers.length;
    await expect(createGameScene(f.engine as unknown as Engine, f.canvas)).rejects.toThrow("construction failure");
    expect(f.countListeners()).toBe(0);
    expect(f.engine.onResizeObservable.observers.filter(observer => !observer._willBeUnregistered)).toHaveLength(before);
    expect(f.engine.scenes).toHaveLength(0);
  });
  it("名前入力中はEnterで戦闘開始せず、ゲーム時間も進まない", async () => {
    const f = setup(); let snapshot!: BattleSnapshot;
    const handle = await createGameScene(f.engine as unknown as Engine, f.canvas, {
      canAcceptInput: () => false, onSnapshot: next => { snapshot = next; },
    });
    for (const listener of f.listeners.get("window:keydown") ?? [])
      (listener as (event: unknown) => void)({ key: "Enter", preventDefault: vi.fn() });
    for (let i = 0; i < 20; i++) handle.scene.onBeforeRenderObservable.notifyObservers(handle.scene);
    expect(snapshot.mode).toBe("custom"); expect(snapshot.elapsed).toBe(0);
    handle.dispose();
  });
});

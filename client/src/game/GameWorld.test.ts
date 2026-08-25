import { describe, expect, it, beforeEach } from "vitest";
import { GameWorld } from "./GameWorld";
import type { BattleSnapshot } from "./types";

function installWindowStub(): void {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { search: "" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  });
}

describe("GameWorldの現行Wave基準", () => {
  beforeEach(() => installWindowStub());

  it("keeps four wave entry points and the five protected enemy patterns", () => {
    const snapshots: BattleSnapshot[] = [];
    for (let wave = 1; wave <= 4; wave += 1) {
      const world = new GameWorld(
        snapshot => snapshots.push(snapshot),
        () => undefined,
        wave
      );
      expect(snapshots.at(-1)?.mode).toBe("custom");
      expect(snapshots.at(-1)?.wave).toBe(wave);
      expect(snapshots.at(-1)?.customHand).toHaveLength(5);
      expect(snapshots.at(-1)?.enemies.length).toBeGreaterThan(0);
      world.controller.cancelCharge();
    }

    const names = new Set(
      snapshots.flatMap(snapshot => snapshot.enemies.map(enemy => enemy.name))
    );
    expect(names).toEqual(
      new Set([
        "BULWARK-3",
        "SCANNER-8",
        "RAZOR-6",
        "MORTAR-NODE",
        "VOLT-SENTINEL",
      ])
    );
  });

  it("keeps battle time stable across render rates", () => {
    const run = (renderRate: number): BattleSnapshot => {
      let latest: BattleSnapshot | undefined;
      const world = new GameWorld(
        snapshot => {
          latest = snapshot;
        },
        () => undefined
      );
      world.controller.toggleCard(0);
      world.controller.toggleCard(0);
      world.controller.confirmCustom();
      for (let frame = 0; frame < renderRate; frame += 1)
        world.update(1 / renderRate);
      world.controller.move(0, 0);
      if (!latest) throw new Error("snapshot was not emitted");
      return latest;
    };

    const thirty = run(30);
    const sixty = run(60);
    const oneTwenty = run(120);

    expect(thirty.elapsed).toBeCloseTo(1, 5);
    expect(sixty.elapsed).toBeCloseTo(1, 5);
    expect(oneTwenty.elapsed).toBeCloseTo(1, 5);
    expect(thirty.customRemaining).toBeCloseTo(sixty.customRemaining, 5);
    expect(sixty.customRemaining).toBeCloseTo(oneTwenty.customRemaining, 5);
  });

  it("does not catch up after a long interruption or while paused", () => {
    let latest: BattleSnapshot | undefined;
    const world = new GameWorld(
      snapshot => {
        latest = snapshot;
      },
      () => undefined
    );
    world.controller.toggleCard(0);
    world.controller.toggleCard(0);
    world.controller.confirmCustom();
    world.update(1 / 60);
    world.update(2);
    world.controller.move(0, 0);
    expect(latest?.elapsed).toBeCloseTo(1 / 60, 5);

    world.controller.togglePause();
    world.update(1);
    world.controller.togglePause();
    world.update(1 / 60);
    world.controller.move(0, 0);
    expect(latest?.elapsed).toBeCloseTo(1 / 30, 5);
  });

  it("resets transient battle state on ten consecutive restarts", () => {
    let latest: BattleSnapshot | undefined;
    const world = new GameWorld(
      snapshot => {
        latest = snapshot;
      },
      () => undefined
    );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      world.controller.toggleCard(0);
      world.controller.toggleCard(0);
      world.controller.confirmCustom();
      world.update(1 / 60);
      world.controller.restart();
      expect(latest?.mode).toBe("custom");
      expect(latest?.wave).toBe(1);
      expect(latest?.elapsed).toBe(0);
      expect(latest?.playerHp).toBe(latest?.playerMaxHp);
      expect(latest?.queue).toHaveLength(0);
      expect(latest?.selected).toHaveLength(0);
      expect(latest?.paused).toBe(false);
    }
  });
});

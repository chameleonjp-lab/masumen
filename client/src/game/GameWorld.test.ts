import { describe, expect, it, beforeEach } from "vitest";
import { GameWorld } from "./GameWorld";
import { CARD_CATALOG } from "./deck";
import type { BattleSnapshot, Card } from "./types";

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

function advanceAtFixedRate(world: GameWorld, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let step = 0; step < steps; step += 1) world.update(1 / 60);
}

function queueCardForTest(world: GameWorld, id: string): void {
  const card = CARD_CATALOG.find(candidate => candidate.id === id);
  if (!card) throw new Error(`Missing card: ${id}`);
  const internal = world as unknown as {
    mode: BattleSnapshot["mode"];
    queue: Card[];
  };
  internal.mode = "battle";
  internal.queue = [card];
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

  it("starts from five folder cards with stable instance identities", () => {
    let latest: BattleSnapshot | undefined;
    new GameWorld(
      snapshot => {
        latest = snapshot;
      },
      () => undefined
    );
    expect(latest?.customHand).toHaveLength(5);
    expect(new Set(latest?.customHand.map(card => card.instanceId)).size).toBe(
      5
    );
    expect(latest?.customHand.every(card => card.selectedCode)).toBe(true);
  });

  it("allows returning to battle with zero selected cards", () => {
    let latest: BattleSnapshot | undefined;
    const world = new GameWorld(
      snapshot => {
        latest = snapshot;
      },
      () => undefined
    );
    world.controller.confirmCustom();
    expect(latest?.mode).toBe("battle");
    expect(latest?.queue).toHaveLength(0);
    expect(latest?.message).toContain("カードなし");
  });

  it("rejects a mixed-name and mixed-code selection using the whole set", () => {
    let latest: BattleSnapshot | undefined;
    const world = new GameWorld(
      snapshot => {
        latest = snapshot;
      },
      () => undefined
    );
    world.controller.toggleCard(0);
    world.controller.toggleCard(0);
    world.controller.toggleCard(1);
    world.controller.toggleCard(1);
    expect(latest?.mode).toBe("custom");
    expect(latest?.selectionError).toContain("同名、同じ接続コード");
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

  it("keeps the battle open at a full gauge until the player opens custom", () => {
    let latest: BattleSnapshot | undefined;
    const world = new GameWorld(
      snapshot => {
        latest = snapshot;
      },
      () => undefined
    );
    world.controller.confirmCustom();
    advanceAtFixedRate(world, 10);
    world.controller.move(0, 0);
    expect(latest?.mode).toBe("battle");
    expect(latest?.gauge).toBeCloseTo(100, 5);
    expect(latest?.customRemaining).toBeCloseTo(0, 5);
    world.controller.openCustom();
    expect(latest?.mode).toBe("custom");
  });

  it("does not open custom before full or while charge is held", () => {
    let latest: BattleSnapshot | undefined;
    const world = new GameWorld(
      snapshot => {
        latest = snapshot;
      },
      () => undefined
    );
    world.controller.confirmCustom();
    advanceAtFixedRate(world, 2);
    world.controller.openCustom();
    expect(latest?.mode).toBe("battle");
    expect(latest?.message).toContain("満タン");

    advanceAtFixedRate(world, 8);
    world.controller.startCharge();
    world.controller.openCustom();
    expect(latest?.mode).toBe("battle");
    expect(latest?.message).toContain("チャージ");
    world.controller.cancelCharge();
  });

  it("does not advance the gauge while paused or during hitstop", () => {
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
    advanceAtFixedRate(world, 1);
    const beforePause = latest?.gauge ?? 0;
    world.controller.togglePause();
    advanceAtFixedRate(world, 1);
    expect(latest?.gauge).toBeCloseTo(beforePause, 5);
    world.controller.togglePause();
    world.controller.useSkill();
    const duringHitstop = latest?.gauge ?? 0;
    world.update(0.03);
    world.controller.move(0, 0);
    expect(latest?.gauge).toBeCloseTo(duringHitstop, 5);
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

  it("publishes the board state, blocks enemy-territory entry, and resets it on restart", () => {
    let latest: BattleSnapshot | undefined;
    const world = new GameWorld(
      snapshot => {
        latest = snapshot;
      },
      () => undefined
    );
    const initial = latest;
    expect(initial?.panels).toHaveLength(18);
    expect(
      initial?.panels.filter(panel => panel.owner === "player")
    ).toHaveLength(9);
    expect(
      initial?.panels
        .filter(panel => panel.occupantId !== null)
        .map(panel => panel.occupantId)
    ).toEqual(expect.arrayContaining(["player", "bulwark", "scanner"]));
    expect(
      new Set(
        initial?.panels
          .filter(panel => panel.occupantId !== null)
          .map(panel => panel.occupantId)
      ).size
    ).toBe(initial?.enemies.length ? initial.enemies.length + 1 : 0);

    world.controller.toggleCard(0);
    world.controller.toggleCard(0);
    world.controller.confirmCustom();
    world.controller.move(1, 0);
    expect(latest?.playerGrid).toEqual({ col: 2, row: 1 });
    world.controller.move(1, 0);
    expect(latest?.playerGrid).toEqual({ col: 2, row: 1 });

    world.controller.restart();
    expect(latest?.playerGrid).toEqual({ col: 1, row: 1 });
    expect(latest?.objects).toHaveLength(0);
    expect(
      latest?.panels.filter(panel => panel.owner === "player")
    ).toHaveLength(9);
    expect(
      latest?.panels.find(panel => panel.occupantId === "player")?.terrain
    ).toBe("normal");
  });

  it("moves normal and card attacks as projectiles instead of applying immediate damage", () => {
    let latest: BattleSnapshot | undefined;
    const world = new GameWorld(
      snapshot => {
        latest = snapshot;
      },
      () => undefined
    );
    const enemyBefore =
      latest?.enemies.find(enemy => enemy.id === "bulwark")?.hp ?? 0;
    world.controller.toggleCard(0);
    world.controller.toggleCard(0);
    world.controller.confirmCustom();
    world.controller.fire();

    expect(latest?.projectiles).toHaveLength(1);
    expect(latest?.enemies.find(enemy => enemy.id === "bulwark")?.hp).toBe(
      enemyBefore
    );
    world.update(0.12);
    world.controller.move(0, 0);
    expect(latest?.projectiles[0]?.position.col).toBeGreaterThan(1);

    world.update(0.2);
    world.update(0.2);
    world.update(0.2);
    expect(
      latest?.enemies.find(enemy => enemy.id === "bulwark")?.hp
    ).toBeLessThan(enemyBefore);
  });

  it("creates three independent projectiles for a multi-shot card", () => {
    let latest: BattleSnapshot | undefined;
    const world = new GameWorld(
      snapshot => {
        latest = snapshot;
      },
      () => undefined
    );
    const cardIndex =
      latest?.customHand.findIndex(card => card.id === "triplet") ?? -1;
    expect(cardIndex).toBeGreaterThanOrEqual(0);
    world.controller.toggleCard(cardIndex);
    world.controller.toggleCard(cardIndex);
    world.controller.confirmCustom();
    world.controller.useSkill();

    expect(latest?.projectiles).toHaveLength(3);
    expect(
      latest?.projectiles.map(projectile => projectile.sourceCardId)
    ).toEqual(["triplet", "triplet", "triplet"]);
  });

  it("keeps PR8 installation cards as visible or hidden board objects", () => {
    let latest: BattleSnapshot | undefined;
    const world = new GameWorld(snapshot => {
      latest = snapshot;
    }, () => undefined);

    queueCardForTest(world, "watchmine");
    world.controller.useSkill();
    expect(latest?.objects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "mine",
        effectId: "watch-mine",
        damage: 100,
        hidden: true,
      }),
    ]));

    queueCardForTest(world, "turret");
    world.controller.useSkill();
    expect(latest?.objects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "turret",
        effectId: "turret",
        damage: 12,
        collision: "solid",
      }),
    ]));
  });

  it("applies PR8 self effects and cancels repair when damaged", () => {
    let latest: BattleSnapshot | undefined;
    const world = new GameWorld(snapshot => {
      latest = snapshot;
    }, () => undefined);
    const internal = world as unknown as {
      playerHp: number;
      customSystem: { multiplier: number };
      applyPlayerHit: (damage: number, enemyId?: string) => void;
    };

    internal.playerHp = 100;
    queueCardForTest(world, "sanctum");
    world.controller.useSkill();
    expect(latest?.playerHp).toBe(120);
    expect(latest?.panels.find(panel => panel.occupantId === "player")?.terrain).toBe("holy");

    queueCardForTest(world, "prism");
    world.controller.useSkill();
    expect(latest?.barrier).toBe(100);

    queueCardForTest(world, "phase");
    world.controller.useSkill();
    expect(latest?.invincible).toBe(true);

    queueCardForTest(world, "fastsync");
    world.controller.useSkill();
    expect(internal.customSystem.multiplier).toBe(2);

    let repairLatest: BattleSnapshot | undefined;
    const repairWorld = new GameWorld(snapshot => {
      repairLatest = snapshot;
    }, () => undefined);
    const repairInternal = repairWorld as unknown as {
      playerHp: number;
      applyPlayerHit: (damage: number, enemyId?: string) => void;
    };
    repairInternal.playerHp = 100;
    queueCardForTest(repairWorld, "repair");
    repairWorld.controller.useSkill();
    repairInternal.applyPlayerHit(5, "bulwark");
    advanceAtFixedRate(repairWorld, 0.7);
    repairWorld.controller.move(0, 0);
    expect(repairLatest?.playerHp).toBe(95);
  });

  it("reaches full charge at the configured 850ms and keeps the shot in flight", () => {
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
    world.controller.startCharge();
    world.update(0.2);
    world.update(0.2);
    world.update(0.2);
    world.update(0.2);
    world.update(0.1);
    world.controller.move(0, 0);
    expect(latest?.charging).toBeCloseTo(1, 4);
    world.controller.releaseCharge();

    expect(latest?.projectiles[0]?.charged).toBe(true);
    expect(latest?.projectiles[0]?.damage).toBe(42);
  });
});

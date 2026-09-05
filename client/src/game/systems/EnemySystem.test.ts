import { describe, expect, it } from "vitest";
import {
  applyEnemyPhase,
  availableEnemyActions,
  chooseEnemyAction,
  currentEnemyAction,
  prepareEnemyAttack,
  resolveEnemyTargets,
  type EnemyRuleState,
} from "./EnemySystem";
import type { GridPosition } from "../types";

function makeEnemy(overrides: Partial<EnemyRuleState> = {}): EnemyRuleState {
  return {
    definitionId: "bulwark",
    hp: 150,
    maxHp: 150,
    actionId: null,
    actionIndex: 0,
    cycle: 0,
    bossPhase: 0,
    bossPhaseLabel: null,
    defense: "none",
    movement: "stationary",
    weaknessElement: "none",
    baseDefense: "none",
    baseMovement: "stationary",
    ...overrides,
  };
}

describe("EnemySystem", () => {
  it("applies a boss phase and resets the action cursor only on transition", () => {
    const enemy = makeEnemy({
      definitionId: "climate-engine",
      hp: 160,
      maxHp: 400,
      actionIndex: 3,
    });

    const update = applyEnemyPhase(enemy);

    expect(update.changed).toBe(true);
    expect(enemy.bossPhase).toBe(2);
    expect(enemy.bossPhaseLabel).toBe("複合気象段階");
    expect(enemy.weaknessElement).toBe("electric");
    expect(enemy.actionIndex).toBe(0);

    enemy.actionIndex = 2;
    const unchanged = applyEnemyPhase(enemy);
    expect(unchanged.changed).toBe(false);
    expect(enemy.actionIndex).toBe(2);
  });

  it("rotates actions without repeating the current action", () => {
    const enemy = makeEnemy();
    const actions = availableEnemyActions(enemy);

    const first = chooseEnemyAction(enemy, actions);
    expect(first?.id).toBe("bulwark-lane-cannon");
    expect(enemy.actionIndex).toBe(1);

    enemy.actionId = first?.id ?? null;
    const second = chooseEnemyAction(enemy, actions);
    expect(second?.id).toBe("bulwark-shield-bash");
    expect(second?.id).not.toBe(first?.id);
    expect(enemy.actionIndex).toBe(0);
  });

  it("uses weather terrain to prefer the matching weather action", () => {
    const enemy = makeEnemy({ definitionId: "weather-core" });
    const actions = availableEnemyActions(enemy);

    expect(
      chooseEnemyAction(enemy, actions, { playerTerrain: "grass" })?.id
    ).toBe("weather-firefront");
    expect(
      chooseEnemyAction(enemy, actions, { playerTerrain: "ice" })?.id
    ).toBe("weather-electric-pulse");
  });

  it("selects climate dual storm on every third phase-two cycle", () => {
    const enemy = makeEnemy({
      definitionId: "climate-engine",
      hp: 160,
      maxHp: 400,
      cycle: 2,
    });
    const actions = availableEnemyActions(enemy);

    expect(chooseEnemyAction(enemy, actions)?.id).toBe("climate-dual-storm");
  });

  it("resolves the current action from the definition", () => {
    const enemy = makeEnemy({
      actionId: "bulwark-shield-bash",
    });

    expect(currentEnemyAction(enemy)?.name).toBe("近距離盾打ち");
  });

  it("prepares one attack with slow, warning, and counter timing", () => {
    const enemy = makeEnemy();
    const actions = availableEnemyActions(enemy);
    const action = actions[0];
    if (!action) throw new Error("攻撃準備検査用の敵行動がありません");

    const prepared = prepareEnemyAttack(enemy, {
      actions,
      now: 1000,
      slowExtraMs: 280,
      counterEndMarginMs: 20,
    });

    expect(prepared?.action.id).toBe(action.id);
    expect(enemy.actionId).toBe(action.id);
    expect(enemy.cycle).toBe(1);
    expect(prepared?.windupUntil).toBe(1000 + action.startupMs + 280);
    expect(prepared?.warningAt).toBe(1000 + (action.warningDelayMs ?? 0));
    expect(prepared?.counterWindowState).toEqual({
      startAt: 1000 + action.startupMs + 280 - action.counterWindowMs,
      endAt: 1000 + action.startupMs + 280 - 20,
    });
  });

  it("locks row, column, and cross targets from the current player tile", () => {
    const enemy = { grid: { col: 4, row: 1 }, cycle: 0 };
    const player = { col: 2, row: 1 };
    const context = {
      player,
      playerTiles: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 2, row: 0 },
        { col: 0, row: 1 },
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 0, row: 2 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
      ],
      isInside: (position: GridPosition) =>
        position.col >= 0 &&
        position.col < 6 &&
        position.row >= 0 &&
        position.row < 3,
      findSupportTarget: () => enemy.grid,
      findHopperLanding: () => player,
      findObjectPlacement: () => player,
      findMinePlacement: () => player,
    };

    expect(
      resolveEnemyTargets(enemy, { id: "row", target: "row" }, context)
    ).toEqual([
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ]);
    expect(
      resolveEnemyTargets(enemy, { id: "column", target: "column" }, context)
    ).toEqual([
      { col: 2, row: 0 },
      { col: 2, row: 1 },
      { col: 2, row: 2 },
    ]);
    expect(
      resolveEnemyTargets(enemy, { id: "cross", target: "cross" }, context)
    ).toEqual([
      { col: 2, row: 1 },
      { col: 1, row: 1 },
      { col: 3, row: 1 },
      { col: 2, row: 0 },
      { col: 2, row: 2 },
    ]);
  });

  it("uses the dedicated locked tile for special enemy actions", () => {
    const player = { col: 1, row: 1 };
    const specialTile = { col: 4, row: 0 };
    const context = {
      player,
      playerTiles: [],
      isInside: () => true,
      findSupportTarget: () => ({ col: 5, row: 2 }),
      findHopperLanding: () => specialTile,
      findObjectPlacement: () => ({ col: 3, row: 2 }),
      findMinePlacement: () => ({ col: 5, row: 1 }),
    };
    const enemy = { grid: { col: 5, row: 2 }, cycle: 0 };

    expect(
      resolveEnemyTargets(
        enemy,
        { id: "hopper-jump-land", target: "landing" },
        context
      )
    ).toEqual([specialTile]);
    expect(
      resolveEnemyTargets(
        enemy,
        { id: "hopper-bomb-drop", target: "player" },
        context
      )
    ).toEqual([{ col: 3, row: 2 }]);
    expect(
      resolveEnemyTargets(enemy, { id: "mine", target: "mine" }, context)
    ).toEqual([{ col: 5, row: 1 }]);
  });
});

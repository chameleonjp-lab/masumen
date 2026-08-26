import { describe, expect, it } from "vitest";
import {
  BOSS_ENEMY_IDS,
  ENEMY_DEFINITIONS,
  PR10_ENEMY_IDS,
  PR11_NORMAL_ENEMY_IDS,
} from "./enemies";

describe("PR10の既存5敵定義", () => {
  it("5体の名前と役割を定義する", () => {
    expect(PR10_ENEMY_IDS).toHaveLength(5);
    expect(PR10_ENEMY_IDS.map(id => ENEMY_DEFINITIONS[id].name)).toEqual([
      "BULWARK-3",
      "SCANNER-8",
      "RAZOR-6",
      "MORTAR-NODE",
      "VOLT-SENTINEL",
    ]);
  });

  it("すべての敵に2種類以上の行動と個別カウンター時間がある", () => {
    for (const id of PR10_ENEMY_IDS) {
      const definition = ENEMY_DEFINITIONS[id];
      expect(definition.actions.length).toBeGreaterThanOrEqual(2);
      expect(
        definition.actions.every(
          action => action.counterWindowMs >= 100 && action.counterWindowMs <= 180
        )
      ).toBe(true);
    }
    const windows = PR10_ENEMY_IDS.flatMap(id =>
      ENEMY_DEFINITIONS[id].actions.map(action => action.counterWindowMs)
    );
    expect(new Set(windows).size).toBeGreaterThan(1);
  });

  it("区別できる移動・防御方式を持つ", () => {
    expect(ENEMY_DEFINITIONS.bulwark.defense).toBe("guard");
    expect(ENEMY_DEFINITIONS.scanner.movement).toBe("flying");
    expect(ENEMY_DEFINITIONS.razor.movement).toBe("pursuit");
    expect(ENEMY_DEFINITIONS.mortar.movement).toBe("stationary");
    expect(ENEMY_DEFINITIONS.sentinel.element).toBe("electric");
  });
});


describe("PR11の新規敵とボス定義", () => {
  it("新規通常敵7体とボス4体を定義する", () => {
    expect(PR11_NORMAL_ENEMY_IDS).toHaveLength(7);
    expect(PR11_NORMAL_ENEMY_IDS.map(id => ENEMY_DEFINITIONS[id].name)).toEqual([
      "WAVE-RUNNER",
      "BOOMER-ARC",
      "HOPPER-BOMB",
      "GAIA-HAMMER",
      "WEATHER-CORE",
      "SUPPORT-RELAY",
      "MIRROR-NODE",
    ]);
    expect(BOSS_ENEMY_IDS).toHaveLength(4);
    expect(BOSS_ENEMY_IDS.map(id => ENEMY_DEFINITIONS[id].name)).toEqual([
      "BASTION PRIME",
      "PRISM HUNTER",
      "CLIMATE ENGINE",
      "CORE ARBITER",
    ]);
  });

  it("全12通常敵の行動受付と役割を定義する", () => {
    const ids = [...PR10_ENEMY_IDS, ...PR11_NORMAL_ENEMY_IDS];
    expect(ids).toHaveLength(12);
    for (const id of ids) {
      const definition = ENEMY_DEFINITIONS[id];
      expect(definition.rank).toBe("normal");
      expect(definition.actions.length).toBeGreaterThanOrEqual(2);
      expect(
        definition.actions.every(
          action => action.counterWindowMs >= 100 && action.counterWindowMs <= 180
        )
      ).toBe(true);
    }
    expect(ENEMY_DEFINITIONS["wave-runner"].movement).toBe("row-align");
    expect(ENEMY_DEFINITIONS["boomer-arc"].movement).toBe("outer");
    expect(ENEMY_DEFINITIONS["gaia-hammer"].defense).toBe("armor");
    expect(ENEMY_DEFINITIONS["mirror-node"].defense).toBe("reflect");
  });

  it("ボスの段階表が定義済み行動だけを参照する", () => {
    for (const id of BOSS_ENEMY_IDS) {
      const definition = ENEMY_DEFINITIONS[id];
      expect(definition.rank).toBe("boss");
      expect(definition.phases?.length).toBeGreaterThanOrEqual(2);
      for (const phase of definition.phases ?? []) {
        expect(phase.maxHpRatio).toBeGreaterThan(0);
        expect(phase.maxHpRatio).toBeLessThanOrEqual(1);
        expect(
          phase.actionIds.every(actionId =>
            definition.actions.some(action => action.id === actionId)
          )
        ).toBe(true);
      }
    }
  });
});

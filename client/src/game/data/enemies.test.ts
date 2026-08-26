import { describe, expect, it } from "vitest";
import {
  ENEMY_DEFINITIONS,
  PR10_ENEMY_IDS,
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

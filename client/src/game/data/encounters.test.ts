import { describe, expect, it } from "vitest";
import {
  allEncounterTemplates,
  encounterHasSafeStart,
  getEncounterTemplates,
  validateEncounterTemplate,
} from "./encounters";

describe("検査済み敵編成", () => {
  it("Wave1〜3の全編成が安全開始条件を満たす", () => {
    const templates = allEncounterTemplates();
    expect(templates).toHaveLength(9);
    for (const template of templates) {
      expect(validateEncounterTemplate(template)).toEqual([]);
      expect(encounterHasSafeStart(template.spawns)).toBe(true);
      expect(template.spawns.length).toBeLessThanOrEqual(4);
    }
    expect(getEncounterTemplates(1)[0]?.id).toBe("wave-1-formation-a");
    expect(getEncounterTemplates(2)[1]?.id).toBe("wave-2-formation-b");
    expect(getEncounterTemplates(3)[2]?.id).toBe("wave-3-formation-c");
  });
});

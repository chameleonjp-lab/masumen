import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { ENEMY_DEFINITIONS, type EnemyId } from "../data/enemies";
import type { EnemySnapshot } from "../types";
import { createEnemyVisual, createEnemyVisualMap, ENEMY_VISUAL_PROFILES, enemyWorldPosition, updateEnemyPose } from "./enemyVisuals";

describe("全16種の敵描画", () => {
  it("未登録の敵を黙って省略せずエラーにする", () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    try {
      expect(() => createEnemyVisual(scene, "unregistered-enemy")).toThrow("Enemy visual is not registered");
      expect(scene.meshes).toHaveLength(0);
      expect(scene.materials).toHaveLength(0);
    } finally { engine.dispose(); }
  });
  it("定義と描画の登録が一致し、実体・行動姿勢・退場・再出現を持つ", () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    try {
      const ids = Object.keys(ENEMY_DEFINITIONS) as EnemyId[];
      expect(Object.keys(ENEMY_VISUAL_PROFILES).sort()).toEqual([...ids].sort());
      expect(ids).toHaveLength(16);
      const baseline = [scene.meshes.length, scene.materials.length, scene.transformNodes.length];
      const visuals = createEnemyVisualMap(scene);
      for (let cycle = 0; cycle < 10; cycle++) {
        for (const id of ids) {
          const definition = ENEMY_DEFINITIONS[id];
          const enemy: EnemySnapshot = {
            id, name: definition.name, hp: 1, maxHp: 1, grid: { col: 4, row: 1 },
            state: "idle", pattern: definition.pattern, counterWindow: false,
          };
          visuals.sync([enemy]);
          const visual = visuals.get(id)!;
          expect(visual.root.isEnabled()).toBe(true);
          expect(visual.root.position.equals(enemyWorldPosition(enemy.grid))).toBe(true);
          expect(visual.body.getChildMeshes().length).toBeGreaterThan(2);
          for (const mesh of visual.body.getChildMeshes()) {
            expect(mesh.isVisible).toBe(true);
            expect(mesh.getTotalVertices()).toBeGreaterThan(0);
            expect(mesh.material).not.toBeNull();
          }
          updateEnemyPose(visual, { ...enemy, state: "windup" });
          expect(visual.body.position.x).toBeGreaterThan(0);
          updateEnemyPose(visual, { ...enemy, actionPhase: "active" });
          expect(visual.body.position.x).toBeLessThan(0);
          updateEnemyPose(visual, { ...enemy, state: "stunned" });
          expect(visual.core.emissiveColor.toHexString()).toBe("#7FF4EF");
          visuals.sync([]);
          expect(visual.root.isDisposed()).toBe(true);
          expect([scene.meshes.length, scene.materials.length, scene.transformNodes.length]).toEqual(baseline);
        }
      }
    } finally { engine.dispose(); }
  });
});

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { afterEach, describe, expect, it } from "vitest";
import { disposeOwnedVisual, TransientMeshResources, VisualEntityMap } from "./visualResources";

const engines: NullEngine[] = [];
function scene() { const engine = new NullEngine(); engines.push(engine); return new Scene(engine); }
afterEach(() => engines.splice(0).forEach(engine => engine.dispose()));

describe("描画資源の所有と解放", () => {
  it("共有素材を最後のエフェクトが消えるまで保持し、10サイクルで増加しない", () => {
    const s = scene(); const resources = new TransientMeshResources();
    const baseline = { meshes: s.meshes.length, materials: s.materials.length };
    for (let cycle = 0; cycle < 10; cycle++) {
      const material = new StandardMaterial("shared", s);
      const first = MeshBuilder.CreateBox("first", {}, s);
      const second = MeshBuilder.CreateBox("second", {}, s);
      first.material = second.material = material;
      resources.track(first); resources.track(first); resources.track(second);
      resources.release(first);
      expect(s.materials).toContain(material);
      expect(second.isDisposed()).toBe(false);
      resources.release(first); resources.clear(); resources.clear();
      expect(resources.size).toBe(0);
      expect({ meshes: s.meshes.length, materials: s.materials.length }).toEqual(baseline);
    }
  });
  it("同じIDの種類・所有者変更と消滅で古い本体・素材を解放する", () => {
    const s = scene();
    const baseline = [s.meshes.length, s.materials.length, s.transformNodes.length];
    const map = new VisualEntityMap(
      (entity: { id: string; kind: string; owner: string }) => `${entity.kind}:${entity.owner}`,
      entity => {
        const root = new TransformNode(entity.id, s);
        const material = new StandardMaterial(entity.owner, s);
        for (let i = 0; i < 2; i++) {
          const mesh = MeshBuilder.CreateBox(entity.kind, {}, s);
          mesh.parent = root; mesh.material = material;
        }
        return root;
      }, disposeOwnedVisual,
    );
    for (let cycle = 0; cycle < 10; cycle++) {
      map.sync([{ id: "object-1", kind: "cube", owner: "player" }]);
      const previous = map.get("object-1")!;
      map.sync([{ id: "object-1", kind: "mine", owner: "enemy" }]);
      expect(previous.isDisposed()).toBe(true);
      expect(map.get("object-1")!.getChildMeshes()[0].material?.name).toBe("enemy");
      map.sync([]);
      expect([s.meshes.length, s.materials.length, s.transformNodes.length]).toEqual(baseline);
    }
  });
});

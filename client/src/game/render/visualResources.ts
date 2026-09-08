import type { Material } from "@babylonjs/core/Materials/material";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** A unit owns its materials; meshes inside the same unit may share them. */
export function disposeOwnedVisual(root: TransformNode): void {
  const materials = new Set(
    root.getChildMeshes().map(mesh => mesh.material).filter((m): m is Material => m !== null),
  );
  root.dispose();
  materials.forEach(material => material.dispose(false, true));
}

/** Only transient meshes/materials belong here, never shared arena materials. */
export class TransientMeshResources {
  private readonly meshes = new Map<Mesh, Material | null>();
  private readonly references = new Map<Material, number>();

  track(mesh: Mesh): void {
    if (this.meshes.has(mesh)) return;
    const material = mesh.material;
    this.meshes.set(mesh, material);
    if (material) this.references.set(material, (this.references.get(material) ?? 0) + 1);
  }

  release(mesh: Mesh): void {
    if (!this.meshes.has(mesh)) return;
    const material = this.meshes.get(mesh);
    this.meshes.delete(mesh);
    mesh.dispose();
    if (!material) return;
    const remaining = (this.references.get(material) ?? 1) - 1;
    if (remaining > 0) this.references.set(material, remaining);
    else {
      this.references.delete(material);
      material.dispose(false, true);
    }
  }

  clear(): void {
    Array.from(this.meshes.keys()).forEach(mesh => this.release(mesh));
  }

  get size(): number { return this.meshes.size; }
}

/** Reconciles live entities instead of retaining every historical object. */
export class VisualEntityMap<T extends { id: string }, V> {
  private readonly entries = new Map<string, { signature: string; visual: V }>();

  constructor(
    private readonly signature: (entity: T) => string,
    private readonly create: (entity: T) => V,
    private readonly destroy: (visual: V) => void,
  ) {}

  sync(entities: readonly T[]): void {
    const live = new Set(entities.map(entity => entity.id));
    for (const [id, entry] of Array.from(this.entries)) {
      if (!live.has(id)) {
        this.destroy(entry.visual);
        this.entries.delete(id);
      }
    }
    for (const entity of entities) {
      const signature = this.signature(entity);
      const entry = this.entries.get(entity.id);
      if (entry?.signature === signature) continue;
      if (entry) {
        this.destroy(entry.visual);
        this.entries.delete(entity.id);
      }
      this.entries.set(entity.id, { signature, visual: this.create(entity) });
    }
  }

  get(id: string): V | undefined { return this.entries.get(id)?.visual; }
  get size(): number { return this.entries.size; }

  clear(): void {
    this.entries.forEach(entry => this.destroy(entry.visual));
    this.entries.clear();
  }
}

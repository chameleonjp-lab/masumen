import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { EnemyId } from "../data/enemies";
import type { EnemySnapshot, GridPosition } from "../types";
import { disposeOwnedVisual, VisualEntityMap } from "./visualResources";

type Triple = readonly [number, number, number];
type Part = {
  shape: "box" | "sphere" | "cylinder" | "ring";
  position: Triple;
  size: Triple;
  tone: "shell" | "edge" | "core";
  rotation?: Triple;
};
const box = (position: Triple, size: Triple, tone: Part["tone"] = "shell", rotation?: Triple): Part =>
  ({ shape: "box", position, size, tone, rotation });
const sphere = (position: Triple, size: Triple, tone: Part["tone"] = "shell"): Part =>
  ({ shape: "sphere", position, size, tone });
const cylinder = (position: Triple, size: Triple, tone: Part["tone"] = "shell", rotation?: Triple): Part =>
  ({ shape: "cylinder", position, size, tone, rotation });
const ring = (position: Triple, size: Triple, rotation?: Triple): Part =>
  ({ shape: "ring", position, size, tone: "edge", rotation });
const eye = box([-0.37, 0.63, 0], [0.08, 0.13, 0.3], "core");
const feet = [box([0, 0.17, -0.32], [0.65, 0.18, 0.18]), box([0, 0.17, 0.32], [0.65, 0.18, 0.18])];

interface EnemyVisualProfile {
  color: string;
  boss?: boolean;
  parts: readonly Part[];
}

/** Exhaustive, image-independent bodies; all parts stay close to their tile. */
export const ENEMY_VISUAL_PROFILES: Record<EnemyId, EnemyVisualProfile> = {
  bulwark: { color: "#E4A33A", parts: [
    ...feet, box([0.1, 0.55, 0], [0.6, 0.64, 0.62]),
    box([-0.4, 0.58, 0], [0.16, 0.85, 0.94], "edge"), eye,
    cylinder([-0.35, 0.54, 0], [0.2, 0.53, 0.2], "core", [0, 0, Math.PI / 2]),
  ] },
  scanner: { color: "#76DAEB", parts: [
    sphere([0, 0.69, 0], [0.68, 0.68, 0.68]),
    ring([0, 0.69, 0], [1.08, 1.08, 1.08]),
    sphere([-0.33, 0.69, 0], [0.19, 0.28, 0.28], "core"),
  ] },
  razor: { color: "#F1B174", parts: [
    ...feet, box([0, 0.55, 0], [0.58, 0.58, 0.42]), eye,
    box([-0.12, 0.6, -0.38], [0.85, 0.07, 0.16], "edge", [0, -0.5, 0]),
    box([-0.12, 0.6, 0.38], [0.85, 0.07, 0.16], "edge", [0, 0.5, 0]),
  ] },
  mortar: { color: "#CDB16E", parts: [
    cylinder([0, 0.25, 0], [0.9, 0.25, 0.9]),
    cylinder([0, 0.65, 0], [0.61, 0.68, 0.61]),
    ring([0, 1, 0], [0.72, 0.72, 0.72]),
    sphere([0, 1, 0], [0.28, 0.13, 0.28], "core"),
  ] },
  sentinel: { color: "#BA9CF1", parts: [
    sphere([0, 0.64, 0], [0.65, 0.75, 0.65]),
    ring([0, 0.64, 0], [1.02, 1.02, 1.02], [Math.PI / 2, 0, 0]),
    box([0, 1.09, 0], [0.12, 0.23, 0.12], "core"), eye,
  ] },
  "wave-runner": { color: "#59C5ED", parts: [
    sphere([0, 0.4, 0], [0.88, 0.4, 0.58]),
    box([0.15, 0.62, 0], [0.32, 0.32, 0.08], "edge", [0, 0, -0.3]),
    box([0, 0.22, -0.4], [0.95, 0.08, 0.2], "edge"),
    box([0, 0.22, 0.4], [0.95, 0.08, 0.2], "edge"),
    sphere([-0.4, 0.44, 0], [0.12, 0.12, 0.28], "core"),
  ] },
  "boomer-arc": { color: "#F5B96A", parts: [
    cylinder([0.18, 0.56, 0], [0.4, 0.62, 0.4]),
    box([-0.14, 0.74, -0.24], [0.7, 0.16, 0.2], "edge", [0, -0.6, 0]),
    box([-0.14, 0.74, 0.24], [0.7, 0.16, 0.2], "edge", [0, 0.6, 0]), eye,
  ] },
  "hopper-bomb": { color: "#EB895C", parts: [
    sphere([0, 0.63, 0], [0.68, 0.65, 0.68]),
    box([0.13, 0.28, -0.32], [0.21, 0.36, 0.17], "edge", [0, 0, -0.4]),
    box([0.13, 0.28, 0.32], [0.21, 0.36, 0.17], "edge", [0, 0, -0.4]),
    cylinder([0.12, 1.02, 0], [0.09, 0.22, 0.09], "core"), eye,
  ] },
  "gaia-hammer": { color: "#BCB57B", parts: [
    ...feet, box([0.17, 0.66, 0], [0.52, 0.84, 0.6]),
    box([-0.35, 0.5, 0], [0.15, 0.74, 0.15], "edge"),
    box([-0.35, 0.93, 0], [0.38, 0.28, 0.96], "edge"), eye,
  ] },
  "weather-core": { color: "#89D0CD", parts: [
    sphere([0, 0.68, 0], [0.59, 0.59, 0.59], "core"),
    ring([0, 0.68, 0], [1.05, 1.05, 1.05], [0.7, 0, 0.6]),
    sphere([0, 1.14, 0], [0.17, 0.17, 0.17], "edge"),
    sphere([0, 0.27, 0], [0.17, 0.17, 0.17], "edge"),
  ] },
  "support-relay": { color: "#83D6AC", parts: [
    cylinder([0, 0.23, 0], [0.72, 0.18, 0.72]),
    box([0, 0.62, 0], [0.35, 0.67, 0.35]),
    box([0, 1.02, 0], [0.1, 0.1, 0.98], "edge"),
    sphere([0, 1.04, -0.45], [0.16, 0.16, 0.16], "core"),
    sphere([0, 1.04, 0.45], [0.16, 0.16, 0.16], "core"),
  ] },
  "mirror-node": { color: "#B6BDEB", parts: [
    cylinder([0.15, 0.26, 0], [0.61, 0.24, 0.61]),
    box([0, 0.73, 0], [0.19, 0.82, 0.82], "edge"),
    box([-0.11, 0.73, 0], [0.035, 0.64, 0.63], "core"),
    box([0.23, 0.63, 0], [0.27, 0.57, 0.38]),
  ] },
  "bastion-prime": { color: "#EDBA65", boss: true, parts: [
    ...feet, box([0.11, 0.62, 0], [0.76, 0.83, 0.83]),
    box([-0.4, 0.66, 0], [0.16, 0.99, 1.09], "edge"),
    box([0.17, 1.15, -0.32], [0.23, 0.22, 0.23], "edge"),
    box([0.17, 1.15, 0.32], [0.23, 0.22, 0.23], "edge"),
    cylinder([-0.5, 0.74, 0], [0.22, 0.26, 0.22], "core", [0, 0, Math.PI / 2]),
  ] },
  "prism-hunter": { color: "#DBA3EC", boss: true, parts: [
    ...feet, cylinder([0, 0.7, 0], [0.51, 0.83, 0.51]), eye,
    box([-0.1, 0.85, -0.38], [0.95, 0.09, 0.17], "edge", [0, -0.48, 0.35]),
    box([-0.1, 0.85, 0.38], [0.95, 0.09, 0.17], "edge", [0, 0.48, 0.35]),
    sphere([0, 1.18, 0], [0.27, 0.28, 0.27], "core"),
  ] },
  "climate-engine": { color: "#8BC7F2", boss: true, parts: [
    sphere([0, 0.71, 0], [0.72, 0.72, 0.72]),
    ring([0, 0.71, 0], [1.17, 1.17, 1.17], [0.7, 0, 0.5]),
    ring([0, 0.71, 0], [0.99, 0.99, 0.99], [-0.7, 0, -0.5]),
    sphere([-0.39, 0.73, 0], [0.18, 0.3, 0.3], "core"),
    cylinder([0, 0.22, 0], [0.64, 0.16, 0.64]),
  ] },
  "core-arbiter": { color: "#EB9C8B", boss: true, parts: [
    cylinder([0, 0.25, 0], [0.86, 0.2, 0.86]),
    box([0, 0.69, 0], [0.53, 0.72, 0.53], "shell", [0, Math.PI / 4, 0]),
    ring([0, 1.18, 0], [0.86, 0.86, 0.86]),
    box([0, 0.67, -0.46], [0.24, 0.58, 0.16], "edge"),
    box([0, 0.67, 0.46], [0.24, 0.58, 0.16], "edge"), eye,
  ] },
};

export function enemyWorldPosition(position: GridPosition): Vector3 {
  return new Vector3((position.col - 2.5) * 1.48, 0.12, (position.row - 1) * 1.48);
}

export interface EnemyVisual {
  root: TransformNode;
  body: TransformNode;
  ring: Mesh;
  core: StandardMaterial;
  accent: Color3;
}

export function createEnemyVisual(scene: Scene, id: string): EnemyVisual {
  // Fail visibly rather than silently fighting an unrendered unknown enemy.
  if (!Object.prototype.hasOwnProperty.call(ENEMY_VISUAL_PROFILES, id))
    throw new Error(`Enemy visual is not registered: ${id}`);
  const profile = ENEMY_VISUAL_PROFILES[id as EnemyId];
  const root = new TransformNode(`enemy-${id}`, scene);
  const body = new TransformNode(`enemy-${id}-body`, scene);
  body.parent = root;
  const accent = Color3.FromHexString(profile.color);
  const materials = Object.fromEntries(Array.from(new Set(profile.parts.map(part => part.tone))).map(tone => {
    const material = new StandardMaterial(`enemy-${id}-${tone}`, scene);
    material.diffuseColor = accent.scale(tone === "shell" ? 0.4 : 0.7);
    material.emissiveColor = accent.scale(tone === "shell" ? 0.12 : tone === "core" ? 0.9 : 0.35);
    material.specularColor = accent.scale(0.25);
    return [tone, material];
  })) as Record<Part["tone"], StandardMaterial>;
  profile.parts.forEach((part, index) => {
    const name = `enemy-${id}-part-${index}`;
    const mesh = part.shape === "sphere"
      ? MeshBuilder.CreateSphere(name, { diameter: 1, segments: 8 }, scene)
      : part.shape === "cylinder"
        ? MeshBuilder.CreateCylinder(name, { height: 1, diameter: 1, tessellation: 8 }, scene)
        : part.shape === "ring"
          ? MeshBuilder.CreateTorus(name, { diameter: 1, thickness: 0.045, tessellation: 24 }, scene)
          : MeshBuilder.CreateBox(name, { size: 1 }, scene);
    mesh.parent = body;
    mesh.position.set(...part.position);
    mesh.scaling.set(...part.size);
    if (part.rotation) mesh.rotation.set(...part.rotation);
    mesh.material = materials[part.tone];
    mesh.isPickable = false;
  });
  const foot = MeshBuilder.CreateTorus(`enemy-${id}-foot`, {
    diameter: profile.boss ? 1.13 : 0.85, thickness: profile.boss ? 0.055 : 0.035, tessellation: 24,
  }, scene);
  foot.parent = root;
  foot.position.y = 0.09;
  const footMaterial = new StandardMaterial(`enemy-${id}-foot-material`, scene);
  footMaterial.emissiveColor = accent.scale(0.65);
  foot.material = footMaterial;
  foot.isPickable = false;
  return { root, body, ring: foot, core: materials.core, accent };
}

export function createEnemyVisualMap(scene: Scene): VisualEntityMap<EnemySnapshot, EnemyVisual> {
  return new VisualEntityMap(
    enemy => enemy.id,
    enemy => {
      const visual = createEnemyVisual(scene, enemy.id);
      visual.root.position.copyFrom(enemyWorldPosition(enemy.grid));
      return visual;
    },
    visual => disposeOwnedVisual(visual.root),
  );
}

export function updateEnemyPose(visual: EnemyVisual, enemy: EnemySnapshot): void {
  const preparing = enemy.state === "windup";
  const active = enemy.actionPhase === "active";
  visual.body.position.x = preparing ? 0.08 : active ? -0.12 : 0;
  visual.body.rotation.z = preparing ? -0.08 : active ? 0.08 : 0;
  visual.core.emissiveColor = preparing
    ? Color3.FromHexString("#FFC6A6")
    : enemy.state === "stunned" ? Color3.FromHexString("#7FF4EF") : visual.accent.scale(0.9);
}

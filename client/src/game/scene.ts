/** Signal Relay Tactical scene: a compact 2.5D arena in which charcoal terminal geometry frames teal and ochre territories. */
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { GameWorld } from "./GameWorld";
import { ASSET_URLS } from "./assets";
import { CardAudio } from "./cardAudio";
import { getCardVfxRecipe } from "./cardVisuals";
import { CARD_CATALOG } from "./deck";
import type { BattleEvent, BattleSnapshot, FieldObject, GameHandle, GridPosition, PanelTerrain } from "./types";

const TEAL = Color3.FromHexString("#2AD4D9");
const OCHRE = Color3.FromHexString("#E4A33A");
const EMBER = Color3.FromHexString("#FF5E3B");
const GRAPHITE = Color3.FromHexString("#10171F");

interface SceneCallbacks {
  onSnapshot?: (snapshot: BattleSnapshot) => void;
}

interface ActiveBeam {
  mesh: Mesh;
  from: Vector3;
  to: Vector3;
  progress: number;
  speed: number;
}

interface WarningEffect {
  ring: Mesh;
  scan: Mesh;
  startedAt: number;
}

interface TimedEffect {
  mesh: Mesh;
  age: number;
  duration: number;
  startScale: number;
  endScale: number;
  spin: number;
  rise: number;
}

interface EnemyReaction {
  startedAt: number;
  strength: number;
  id: string;
}

interface PlayerReaction {
  startedAt: number;
  kind: Extract<BattleEvent, { type: "player-reaction" }>["kind"];
  damage: number;
}

function key(position: GridPosition): string {
  return `${position.col}:${position.row}`;
}

function gridToWorld(position: GridPosition): Vector3 {
  return new Vector3((position.col - 2.5) * 1.48, 0.12, (position.row - 1) * 1.48);
}

function spriteMaterial(scene: Scene, name: string, url: string): StandardMaterial {
  const material = new StandardMaterial(`${name}-material`, scene);
  const texture = new Texture(url, scene, true, false);
  // Babylon's plane UV origin is opposite to the generated sprite convention; flip V once so every unit is upright.
  texture.vScale = -1;
  texture.vOffset = 1;
  texture.hasAlpha = true;
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.disableLighting = true;
  material.backFaceCulling = false;
  return material;
}

function makeUnit(scene: Scene, name: string, url: string, width: number, height: number): { root: TransformNode; plane: Mesh; ring: Mesh } {
  const root = new TransformNode(`${name}-root`, scene);
  const plane = MeshBuilder.CreatePlane(`${name}-plane`, { width, height }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.position.y = height * 0.48 + 0.08;
  plane.material = spriteMaterial(scene, name, url);
  plane.parent = root;
  const ring = MeshBuilder.CreateTorus(`${name}-ring`, { thickness: 0.04, diameter: width * 0.72, tessellation: 32 }, scene);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.16;
  const ringMaterial = new StandardMaterial(`${name}-ring-mat`, scene);
  ringMaterial.emissiveColor = name === "pilot" ? TEAL : OCHRE;
  ringMaterial.alpha = 0.65;
  ring.material = ringMaterial;
  ring.parent = root;
  return { root, plane, ring };
}

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement, callbacks: SceneCallbacks = {}): Promise<GameHandle> {
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString("#061017FF");
  scene.ambientColor = Color3.FromHexString("#355060");

  const camera = new ArcRotateCamera("arena-camera", -Math.PI / 2, 1.06, 12.4, new Vector3(0, 0, 0), scene);
  camera.fov = 0.76;
  camera.lowerRadiusLimit = 12.4;
  camera.upperRadiusLimit = 12.4;
  camera.lowerBetaLimit = 1.06;
  camera.upperBetaLimit = 1.06;
  camera.attachControl(canvas, false);
  camera.inputs.clear();
  scene.activeCamera = camera;
  const adaptCameraToViewport = () => {
    const portrait = canvas.clientHeight > canvas.clientWidth;
    const distance = portrait ? 16.2 : 12.4;
    camera.radius = distance;
    camera.lowerRadiusLimit = distance;
    camera.upperRadiusLimit = distance;
    camera.fov = portrait ? 0.88 : 0.76;
  };
  adaptCameraToViewport();
  engine.onResizeObservable.add(adaptCameraToViewport);

  const light = new HemisphericLight("arena-light", new Vector3(-0.3, 1, -0.5), scene);
  light.intensity = 1.5;
  const glow = new GlowLayer("signal-glow", scene, { blurKernelSize: 28 });
  glow.intensity = 0.52;
  const audio = new CardAudio();
  const unlockAudio = () => audio.unlock();
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio);

  const base = MeshBuilder.CreateBox("arena-base", { width: 9.65, depth: 4.95, height: 0.3 }, scene);
  base.position.y = -0.18;
  const baseMaterial = new StandardMaterial("arena-base-mat", scene);
  baseMaterial.diffuseColor = Color3.FromHexString("#0A1119");
  baseMaterial.emissiveColor = Color3.FromHexString("#07141B");
  base.material = baseMaterial;

  const gridTiles = new Map<string, Mesh>();
  const warningTiles = new Set<string>();
  const warningCounts = new Map<string, number>();
  const warningEffects = new Map<string, WarningEffect>();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (let col = 0; col < 6; col += 1) {
    for (let row = 0; row < 3; row += 1) {
      const tile = MeshBuilder.CreateBox(`tile-${col}-${row}`, { width: 1.34, depth: 1.34, height: 0.12 }, scene);
      tile.position = gridToWorld({ col, row });
      const material = new StandardMaterial(`tile-mat-${col}-${row}`, scene);
      const side = col <= 2 ? TEAL : OCHRE;
      material.diffuseColor = side.scale(0.14);
      material.emissiveColor = side.scale(0.055);
      material.specularColor = side.scale(0.15);
      tile.material = material;
      gridTiles.set(`${col}:${row}`, tile);
    }
  }

  const terrainMaterials: Record<PanelTerrain, StandardMaterial> = {
    normal: (() => {
      const material = new StandardMaterial("terrain-normal", scene);
      material.emissiveColor = GRAPHITE;
      return material;
    })(),
    cracked: (() => {
      const material = new StandardMaterial("terrain-cracked", scene);
      material.emissiveColor = EMBER;
      return material;
    })(),
    hole: (() => {
      const material = new StandardMaterial("terrain-hole", scene);
      material.emissiveColor = Color3.FromHexString("#02060A");
      return material;
    })(),
    grass: (() => {
      const material = new StandardMaterial("terrain-grass", scene);
      material.emissiveColor = Color3.FromHexString("#45C58A");
      return material;
    })(),
    ice: (() => {
      const material = new StandardMaterial("terrain-ice", scene);
      material.emissiveColor = Color3.FromHexString("#A6F2FF");
      return material;
    })(),
    lava: (() => {
      const material = new StandardMaterial("terrain-lava", scene);
      material.emissiveColor = Color3.FromHexString("#FF7A42");
      return material;
    })(),
    poison: (() => {
      const material = new StandardMaterial("terrain-poison", scene);
      material.emissiveColor = Color3.FromHexString("#BE77E8");
      return material;
    })(),
    holy: (() => {
      const material = new StandardMaterial("terrain-holy", scene);
      material.emissiveColor = Color3.FromHexString("#FFF0A8");
      return material;
    })(),
  };
  const terrainDecorations = new Map<string, Map<PanelTerrain, Mesh[]>>();
  const makeTerrainDecoration = (position: GridPosition): Map<PanelTerrain, Mesh[]> => {
    const center = gridToWorld(position).add(new Vector3(0, 0.19, 0));
    const decorations = new Map<PanelTerrain, Mesh[]>([
      ["normal", []],
      ["cracked", []],
      ["hole", []],
      ["grass", []],
      ["ice", []],
      ["lava", []],
      ["poison", []],
      ["holy", []],
    ]);
    const bar = (terrain: PanelTerrain, name: string, width: number, depth: number, rotation: number): void => {
      const mesh = MeshBuilder.CreateBox(name, { width, depth, height: 0.028 }, scene);
      mesh.position = center.clone();
      mesh.rotation.y = rotation;
      mesh.material = terrainMaterials[terrain];
      mesh.isVisible = false;
      decorations.get(terrain)?.push(mesh);
    };
    bar("cracked", `crack-a-${position.col}-${position.row}`, 0.86, 0.045, 0.36);
    bar("cracked", `crack-b-${position.col}-${position.row}`, 0.54, 0.045, -0.7);
    const hole = MeshBuilder.CreateCylinder(`hole-${position.col}-${position.row}`, { diameter: 0.88, height: 0.025, tessellation: 24 }, scene);
    hole.position = center.clone();
    hole.material = terrainMaterials.hole;
    hole.isVisible = false;
    decorations.get("hole")?.push(hole);
    const holeRing = MeshBuilder.CreateTorus(`hole-ring-${position.col}-${position.row}`, { diameter: 0.96, thickness: 0.035, tessellation: 24 }, scene);
    holeRing.rotation.x = Math.PI / 2;
    holeRing.position = center.add(new Vector3(0, 0.03, 0));
    holeRing.material = terrainMaterials.hole;
    holeRing.isVisible = false;
    decorations.get("hole")?.push(holeRing);
    for (let index = 0; index < 3; index += 1) {
      const grass = MeshBuilder.CreateCylinder(
        `grass-${position.col}-${position.row}-${index}`,
        {
          diameterTop: 0.025,
          diameterBottom: 0.16,
          height: 0.3,
          tessellation: 5,
        },
        scene
      );
      grass.position = center.add(new Vector3((index - 1) * 0.2, 0.15, index % 2 ? 0.12 : -0.1));
      grass.material = terrainMaterials.grass;
      grass.isVisible = false;
      decorations.get("grass")?.push(grass);
    }
    bar("ice", `ice-a-${position.col}-${position.row}`, 0.98, 0.05, 0);
    bar("ice", `ice-b-${position.col}-${position.row}`, 0.98, 0.05, Math.PI / 2);
    const lava = MeshBuilder.CreateDisc(`lava-${position.col}-${position.row}`, { radius: 0.44, tessellation: 6 }, scene);
    lava.rotation.x = Math.PI / 2;
    lava.position = center.clone();
    lava.material = terrainMaterials.lava;
    lava.isVisible = false;
    decorations.get("lava")?.push(lava);
    for (let index = 0; index < 2; index += 1) {
      const ember = MeshBuilder.CreateSphere(`lava-ember-${position.col}-${position.row}-${index}`, { diameter: 0.12 }, scene);
      ember.position = center.add(new Vector3(index ? 0.22 : -0.18, 0.13, index ? -0.12 : 0.16));
      ember.material = terrainMaterials.lava;
      ember.isVisible = false;
      decorations.get("lava")?.push(ember);
    }
    const poison = MeshBuilder.CreateTorus(`poison-${position.col}-${position.row}`, { diameter: 0.78, thickness: 0.07, tessellation: 18 }, scene);
    poison.rotation.x = Math.PI / 2;
    poison.position = center.clone();
    poison.material = terrainMaterials.poison;
    poison.isVisible = false;
    decorations.get("poison")?.push(poison);
    bar("holy", `holy-h-${position.col}-${position.row}`, 0.7, 0.06, 0);
    bar("holy", `holy-v-${position.col}-${position.row}`, 0.7, 0.06, Math.PI / 2);
    return decorations;
  };
  for (const position of Array.from(gridTiles.keys()).map(tileKey => {
    const [col, row] = tileKey.split(":").map(Number);
    return { col, row };
  }))
    terrainDecorations.set(key(position), makeTerrainDecoration(position));

  const objectMeshes = new Map<string, { root: TransformNode; meshes: Mesh[] }>();
  const makeObjectVisual = (object: FieldObject): { root: TransformNode; meshes: Mesh[] } => {
    const root = new TransformNode(`field-object-${object.id}`, scene);
    root.position = gridToWorld(object.panel);
    const tint = object.owner === "player" ? TEAL : OCHRE;
    const material = new StandardMaterial(`field-object-${object.id}-mat`, scene);
    material.emissiveColor = tint;
    material.diffuseColor = tint.scale(0.4);
    material.alpha = object.collision === "passable" ? 0.62 : 0.9;
    const meshes: Mesh[] = [];
    if (object.kind === "bomb" || object.kind === "mine") {
      const body = MeshBuilder.CreateCylinder(`field-object-${object.id}-body`, { diameter: 0.46, height: 0.34, tessellation: 8 }, scene);
      body.position.y = 0.32;
      body.material = material;
      body.parent = root;
      meshes.push(body);
    } else if (object.kind === "stake") {
      const body = MeshBuilder.CreateCylinder(`field-object-${object.id}-body`, { diameter: 0.18, height: 0.78, tessellation: 6 }, scene);
      body.position.y = 0.45;
      body.material = material;
      body.parent = root;
      meshes.push(body);
    } else if (object.kind === "field-device") {
      const body = MeshBuilder.CreateTorus(`field-object-${object.id}-body`, { diameter: 0.74, thickness: 0.1, tessellation: 18 }, scene);
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.3;
      body.material = material;
      body.parent = root;
      meshes.push(body);
    } else {
      const body = MeshBuilder.CreateBox(
        `field-object-${object.id}-body`,
        {
          width: object.kind === "cube" ? 0.84 : 0.54,
          height: object.kind === "cube" ? 0.84 : 0.42,
          depth: object.kind === "cube" ? 0.84 : 0.54,
        },
        scene
      );
      body.position.y = object.kind === "cube" ? 0.52 : 0.34;
      body.material = material;
      body.parent = root;
      meshes.push(body);
    }
    const ring = MeshBuilder.CreateTorus(`field-object-${object.id}-ring`, { diameter: 0.8, thickness: 0.035, tessellation: 24 }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.18;
    ring.material = material;
    ring.parent = root;
    meshes.push(ring);
    return { root, meshes };
  };
  const syncObjectVisuals = (snapshot: BattleSnapshot): void => {
    const activeIds = new Set(snapshot.objects.map(object => object.id));
    for (const [id, visual] of Array.from(objectMeshes.entries())) visual.root.setEnabled(activeIds.has(id));
    for (const object of snapshot.objects) {
      let visual = objectMeshes.get(object.id);
      if (!visual) {
        visual = makeObjectVisual(object);
        objectMeshes.set(object.id, visual);
      }
      visual.root.position = gridToWorld(object.panel);
      visual.root.setEnabled(true);
      visual.root.scaling.setAll(0.9 + Math.min(0.35, object.hp / 280));
    }
  };
  const updatePanelVisuals = (snapshot: BattleSnapshot): void => {
    const panels = new Map(snapshot.panels.map(panel => [key(panel), panel]));
    for (const [tileKey, tile] of Array.from(gridTiles.entries())) {
      const panel = panels.get(tileKey);
      const terrain = panel?.terrain ?? "normal";
      const ownerColor = panel?.owner === "player" ? TEAL : panel?.owner === "neutral" ? Color3.FromHexString("#7D8A92") : OCHRE;
      const material = tile.material as StandardMaterial;
      const terrainColor = terrain === "normal" ? ownerColor : terrainMaterials[terrain].emissiveColor;
      material.diffuseColor = terrainColor.scale(terrain === "hole" ? 0.045 : 0.14);
      material.emissiveColor = terrainColor.scale(terrain === "hole" ? 0.02 : 0.055);
      tile.scaling.y = terrain === "hole" ? 0.45 : 1;
      const decorations = terrainDecorations.get(tileKey);
      if (decorations)
        for (const [decorationTerrain, meshes] of Array.from(decorations.entries()))
          meshes.forEach((mesh: Mesh) => {
            mesh.isVisible = decorationTerrain === terrain && Boolean(panel);
          });
    }
  };

  const divider = MeshBuilder.CreateBox("divider", { width: 0.12, depth: 4.55, height: 0.13 }, scene);
  divider.position = new Vector3(0, 0.14, 0);
  const dividerMaterial = new StandardMaterial("divider-mat", scene);
  dividerMaterial.emissiveColor = EMBER.scale(0.78);
  divider.material = dividerMaterial;

  const player = makeUnit(scene, "pilot", ASSET_URLS.pilot, 1.18, 1.54);
  const playerAttack = MeshBuilder.CreatePlane("pilot-attack-plane", { width: 1.18, height: 1.54 }, scene);
  playerAttack.billboardMode = Mesh.BILLBOARDMODE_ALL;
  playerAttack.position.y = 0.82;
  playerAttack.material = spriteMaterial(scene, "pilot-attack", ASSET_URLS.pilotAttack);
  playerAttack.parent = player.root;
  playerAttack.isVisible = false;
  const bulwark = makeUnit(scene, "bulwark", ASSET_URLS.shieldDrone, 1.12, 1.42);
  const scanner = makeUnit(scene, "scanner", ASSET_URLS.sensorOrb, 0.94, 1.06);
  const razor = makeUnit(scene, "razor", ASSET_URLS.razorScout, 1.02, 1.16);
  const mortar = makeUnit(scene, "mortar", ASSET_URLS.mortarNode, 1.16, 1.28);
  const sentinel = makeUnit(scene, "sentinel", ASSET_URLS.voltSentinel, 1.04, 1.12);
  scanner.root.position.y = 0.34;
  sentinel.root.position.y = 0.29;
  const units = new Map([
    ["bulwark", bulwark],
    ["scanner", scanner],
    ["razor", razor],
    ["mortar", mortar],
    ["sentinel", sentinel],
  ]);

  const beams: ActiveBeam[] = [];
  const effects: TimedEffect[] = [];
  const enemyReactions = new Map<string, EnemyReaction>();
  let playerReaction: PlayerReaction | null = null;
  const addEffect = (mesh: Mesh, duration: number, startScale = 1, endScale = 2, spin = 0, rise = 0) => effects.push({ mesh, age: 0, duration, startScale, endScale, spin, rise });
  const createWarningEffect = (position: GridPosition) => {
    const tileKey = key(position);
    if (warningEffects.has(tileKey)) return;
    const center = gridToWorld(position);
    const ring = MeshBuilder.CreateTorus("warning-ring", { diameter: 1.12, thickness: 0.045, tessellation: 32 }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.position = center.add(new Vector3(0, 0.2, 0));
    const ringMaterial = new StandardMaterial("warning-ring-mat", scene);
    ringMaterial.emissiveColor = EMBER;
    ringMaterial.alpha = 0.8;
    ring.material = ringMaterial;
    const scan = MeshBuilder.CreateDisc("warning-scan", { radius: 0.52, tessellation: 32 }, scene);
    scan.rotation.x = Math.PI / 2;
    scan.position = center.add(new Vector3(0, 0.205, 0));
    const scanMaterial = new StandardMaterial("warning-scan-mat", scene);
    scanMaterial.emissiveColor = EMBER;
    scanMaterial.alpha = 0.3;
    scanMaterial.backFaceCulling = false;
    scan.material = scanMaterial;
    warningEffects.set(tileKey, { ring, scan, startedAt: performance.now() });
  };
  const clearWarningEffect = (tileKey: string) => {
    const effect = warningEffects.get(tileKey);
    if (!effect) return;
    effect.ring.dispose();
    effect.scan.dispose();
    warningEffects.delete(tileKey);
  };
  const makeImpact = (position: GridPosition, color: Color3, counter = false) => {
    const ring = MeshBuilder.CreateTorus(
      "impact-ring",
      {
        diameter: counter ? 1.35 : 0.85,
        thickness: counter ? 0.08 : 0.045,
        tessellation: 30,
      },
      scene
    );
    ring.rotation.x = Math.PI / 2;
    ring.position = gridToWorld(position).add(new Vector3(0, 0.25, 0));
    const material = new StandardMaterial("impact-mat", scene);
    material.emissiveColor = color;
    material.alpha = 0.9;
    ring.material = material;
    addEffect(ring, counter ? 0.85 : 0.42, 0.72, counter ? 3.4 : 2.8, counter ? 2.1 : 0.55, 0.05);
  };
  const makePlayerReaction = (event: Extract<BattleEvent, { type: "player-reaction" }>) => {
    playerReaction = {
      startedAt: performance.now(),
      kind: event.kind,
      damage: event.damage ?? 0,
    };
    const center = gridToWorld(event.at).add(new Vector3(0, 0.55, 0));
    const material = (name: string, color: Color3, alpha = 0.86) => {
      const mat = new StandardMaterial(name, scene);
      mat.emissiveColor = color;
      mat.alpha = alpha;
      mat.backFaceCulling = false;
      return mat;
    };
    const ring = (name: string, color: Color3, diameter: number, duration: number, y = 0) => {
      const mesh = MeshBuilder.CreateTorus(name, { diameter, thickness: 0.045, tessellation: 28 }, scene);
      mesh.rotation.x = Math.PI / 2;
      mesh.position = center.add(new Vector3(0, y, 0));
      mesh.material = material(`${name}-mat`, color);
      addEffect(mesh, duration, 0.52, 1.7, 3.8, 0.05);
    };
    const orb = (name: string, offset: Vector3, color: Color3, diameter = 0.13, duration = 0.34) => {
      const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 8 }, scene);
      mesh.position = center.add(offset);
      mesh.material = material(`${name}-mat`, color);
      addEffect(mesh, duration, 0.45, 1.32, 3.2, 0.24);
    };
    if (event.kind === "damage") {
      ring("player-damage-ring", EMBER, 0.9, 0.48, -0.34);
      orb("player-damage-spark-a", new Vector3(-0.22, 0.16, 0.18), EMBER, 0.16, 0.34);
      orb("player-damage-spark-b", new Vector3(0.22, 0.3, -0.18), Color3.FromHexString("#FFC45C"), 0.12, 0.3);
      return;
    }
    if (event.kind === "barrier") {
      ring("player-barrier-ring-a", Color3.FromHexString("#F4FFF9"), 1.08, 0.56, -0.22);
      ring("player-barrier-ring-b", TEAL, 0.72, 0.5, 0.06);
      [-0.34, 0.34].forEach((z, index) => {
        const plate = MeshBuilder.CreateBox("player-barrier-plate", { width: 0.08, height: 0.78, depth: 0.44 }, scene);
        plate.position = center.add(new Vector3(0.48, 0.02, z));
        plate.material = material("player-barrier-plate-mat", index ? TEAL : Color3.FromHexString("#F4FFF9"), 0.68);
        addEffect(plate, 0.5, 0.54, 1.06, index ? -2.4 : 2.4, 0.03);
      });
      return;
    }
    if (event.kind === "phase") {
      [0.62, 0.9, 1.18].forEach((diameter, index) => ring("player-phase-ring", index % 2 ? Color3.FromHexString("#DDFBFF") : Color3.FromHexString("#75E6FF"), diameter, 0.54 + index * 0.05, index * 0.08));
      [-0.32, 0, 0.32].forEach((z, index) => orb("player-phase-node", new Vector3(-0.1 - index * 0.1, index * 0.09, z), Color3.FromHexString("#A9F5FF"), 0.11, 0.4));
      return;
    }
    if (event.kind === "counter") {
      ring("player-counter-ring-a", EMBER, 1.02, 0.64, -0.2);
      ring("player-counter-ring-b", OCHRE, 0.66, 0.58, 0.08);
      addDirectionLine(center.add(new Vector3(0.16, 0.12, 0)), center.add(new Vector3(1.1, 0.12, 0)), EMBER, 0.9);
      return;
    }
    ring("player-dodge-ring", TEAL, 0.72, 0.38, -0.26);
  };
  const makeEnemyHitReaction = (event: Extract<BattleEvent, { type: "impact" }>) => {
    if (event.side !== "player" || !event.enemyId) return;
    const recipe = event.cardId ? getCardVfxRecipe(event.cardId) : undefined;
    const color = recipe ? Color3.FromHexString(recipe.accent) : event.charged ? EMBER : TEAL;
    const secondary = recipe ? Color3.FromHexString(recipe.secondary) : Color3.FromHexString("#F0FFFF");
    const statusStrength = event.status === "stun" || event.status === "root" ? 0.35 : event.status === "burn" || event.status === "slow" ? 0.18 : 0;
    const strength = Math.min(1.45, 0.34 + (event.damage ?? 12) / 82 + statusStrength + (event.charged ? 0.2 : 0) + (event.counter ? 0.25 : 0));
    enemyReactions.set(event.enemyId, {
      startedAt: performance.now(),
      strength,
      id: event.enemyId,
    });
    const center = gridToWorld(event.at).add(new Vector3(0, 0.56, 0));
    const material = (name: string, tint: Color3, alpha = 0.86) => {
      const mat = new StandardMaterial(name, scene);
      mat.emissiveColor = tint;
      mat.alpha = alpha;
      mat.backFaceCulling = false;
      return mat;
    };
    const burstOrb = (name: string, offset: Vector3, tint: Color3, diameter = 0.13, duration = 0.36) => {
      const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 8 }, scene);
      mesh.position = center.add(offset);
      mesh.material = material(`${name}-mat`, tint);
      addEffect(mesh, duration, 0.38, 1.4, 3.2, 0.23);
    };
    if (event.enemyId === "bulwark") {
      const shield = MeshBuilder.CreateBox("bulwark-hit-plate", { width: 0.7, height: 0.14, depth: 0.06 }, scene);
      shield.position = center.add(new Vector3(-0.15, 0.08, 0));
      shield.material = material("bulwark-hit-plate-mat", color);
      addEffect(shield, 0.5, 0.54, 1.22, 0.8, 0.08);
      burstOrb("bulwark-hit-spark", new Vector3(-0.34, 0.1, 0), secondary, 0.16, 0.42);
    } else if (event.enemyId === "scanner") {
      for (let index = 0; index < 3; index += 1) {
        const ring = MeshBuilder.CreateTorus("scanner-hit-ring", { diameter: 0.46 + index * 0.17, thickness: 0.026, tessellation: 22 }, scene);
        ring.position = center.add(new Vector3(0, index * 0.08, 0));
        ring.material = material("scanner-hit-ring-mat", index === 1 ? secondary : color);
        addEffect(ring, 0.48 + index * 0.04, 0.55, 1.35, index % 2 ? -5.2 : 5.2, 0.05);
      }
    } else if (event.enemyId === "razor") {
      [-0.23, 0, 0.23].forEach((z, index) => burstOrb("razor-hit-spark", new Vector3(-0.14 + index * 0.14, 0.05 + index * 0.08, z), index === 1 ? secondary : color, 0.13, 0.34));
    } else if (event.enemyId === "mortar") {
      const cap = MeshBuilder.CreateCylinder("mortar-hit-cap", { height: 0.16, diameter: 0.58, tessellation: 8 }, scene);
      cap.position = center.add(new Vector3(0, 0.1, 0));
      cap.material = material("mortar-hit-cap-mat", color);
      addEffect(cap, 0.52, 0.45, 1.28, 2.4, 0.26);
      burstOrb("mortar-hit-core", new Vector3(0, 0.24, 0), secondary, 0.22, 0.48);
    } else {
      for (let index = 0; index < 4; index += 1) {
        const angle = (Math.PI * 2 * index) / 4;
        burstOrb("sentinel-hit-node", new Vector3(Math.cos(angle) * 0.31, 0.06, Math.sin(angle) * 0.31), index % 2 ? secondary : color, 0.12, 0.42);
      }
    }
    if (event.status === "burn") {
      burstOrb("hit-burn-a", new Vector3(-0.16, 0.28, 0.12), EMBER, 0.1, 0.34);
      burstOrb("hit-burn-b", new Vector3(0.16, 0.36, -0.12), Color3.FromHexString("#FFC45C"), 0.09, 0.32);
    }
    if (event.status === "stun") {
      const ring = MeshBuilder.CreateTorus("hit-stun-ring", { diameter: 0.78, thickness: 0.04, tessellation: 20 }, scene);
      ring.rotation.x = Math.PI / 2;
      ring.position = center;
      ring.material = material("hit-stun-ring-mat", Color3.FromHexString("#B58CFF"));
      addEffect(ring, 0.52, 0.46, 1.35, 5.6, 0.08);
    }
    if (event.status === "root" || event.status === "slow") {
      const bind = MeshBuilder.CreateTorus("hit-bind-ring", { diameter: 0.74, thickness: 0.045, tessellation: 20 }, scene);
      bind.rotation.x = Math.PI / 2;
      bind.position = center.add(new Vector3(0, -0.26, 0));
      bind.material = material("hit-bind-ring-mat", Color3.FromHexString("#45C5A0"));
      addEffect(bind, 0.58, 0.5, 1.22, event.status === "root" ? -4.2 : 3.2, 0.03);
    }
  };
  const cardColor = (event: Extract<BattleEvent, { type: "card" }>): Color3 => {
    if (event.tier === "mega") return Color3.FromHexString("#B783FF");
    if (event.status === "burn") return EMBER;
    if (event.status === "stun") return Color3.FromHexString("#A580FF");
    if (event.status === "root" || event.status === "slow") return Color3.FromHexString("#45C5A0");
    if (event.status === "barrier" || event.status === "invincible" || event.status === "recover" || event.status === "boost" || event.status === "gauge") return Color3.FromHexString("#DDFBF4");
    if (event.family === "近接") return Color3.FromHexString("#FFF1CD");
    if (event.family === "設置" || event.family === "地形") return OCHRE;
    if (event.family === "反撃") return EMBER;
    return TEAL;
  };
  const deleteColor = (id: string): Color3 => {
    if (id === "bulwark" || id === "mortar") return OCHRE;
    if (id === "scanner") return TEAL;
    if (id === "razor") return EMBER;
    return Color3.FromHexString("#B783FF");
  };
  const cardEffectTargets = (event: Extract<BattleEvent, { type: "card" }>): GridPosition[] => event.tiles;
  const makeCardEffect = (event: Extract<BattleEvent, { type: "card" }>) => {
    const color = cardColor(event);
    const targets = cardEffectTargets(event);
    const mega = event.tier === "mega";
    targets.forEach((position, index) => {
      const center = gridToWorld(position).add(new Vector3(0, 0.23, 0));
      const ring = MeshBuilder.CreateTorus(
        "card-ring",
        {
          diameter: mega ? 1.72 : 1.1,
          thickness: mega ? 0.075 : 0.045,
          tessellation: 32,
        },
        scene
      );
      ring.rotation.x = Math.PI / 2;
      ring.position = center;
      const ringMaterial = new StandardMaterial("card-ring-mat", scene);
      ringMaterial.emissiveColor = color;
      ringMaterial.alpha = mega ? 0.9 : 0.72;
      ring.material = ringMaterial;
      addEffect(ring, mega ? 1.05 : 0.62, 0.38 + index * 0.06, mega ? 3.8 : 2.55, mega ? 2.8 : 1.4, 0.06);
      const disc = MeshBuilder.CreateDisc("card-scan", { radius: mega ? 0.7 : 0.48, tessellation: 28 }, scene);
      disc.rotation.x = Math.PI / 2;
      disc.position = center.add(new Vector3(0, 0.012, 0));
      const discMaterial = new StandardMaterial("card-scan-mat", scene);
      discMaterial.emissiveColor = color;
      discMaterial.alpha = mega ? 0.3 : 0.22;
      discMaterial.backFaceCulling = false;
      disc.material = discMaterial;
      addEffect(disc, mega ? 0.92 : 0.48, 0.2, mega ? 2.7 : 1.9, mega ? -1.2 : -0.45);
      if (event.status === "burn" || event.family === "設置") {
        const spark = MeshBuilder.CreateSphere("card-spark", { diameter: mega ? 0.38 : 0.19, segments: 10 }, scene);
        spark.position = center.add(new Vector3(0, 0.35, 0));
        const sparkMaterial = new StandardMaterial("card-spark-mat", scene);
        sparkMaterial.emissiveColor = color;
        spark.material = sparkMaterial;
        addEffect(spark, mega ? 0.8 : 0.42, 0.5, 0.1, 0, 0.28);
      }
      if (event.status === "stun") {
        for (let node = 0; node < 3; node += 1) {
          const bolt = MeshBuilder.CreateSphere("stun-node", { diameter: 0.12, segments: 8 }, scene);
          const angle = (Math.PI * 2 * node) / 3;
          bolt.position = center.add(new Vector3(Math.cos(angle) * 0.34, 0.16 + node * 0.06, Math.sin(angle) * 0.34));
          const boltMaterial = new StandardMaterial("stun-node-mat", scene);
          boltMaterial.emissiveColor = Color3.FromHexString("#B58CFF");
          bolt.material = boltMaterial;
          addEffect(bolt, 0.5, 0.55, 0.1, 4, 0.16);
        }
      }
      if (event.status === "root" || event.status === "slow") {
        const bind = MeshBuilder.CreateTorus("status-bind", { diameter: 0.72, thickness: 0.05, tessellation: 20 }, scene);
        bind.rotation.x = Math.PI / 2;
        bind.position = center.add(new Vector3(0, 0.1, 0));
        const bindMaterial = new StandardMaterial("status-bind-mat", scene);
        bindMaterial.emissiveColor = Color3.FromHexString("#45C5A0");
        bind.material = bindMaterial;
        addEffect(bind, 0.7, 0.32, 1.9, event.status === "root" ? -2.4 : 1.6, 0.02);
      }
      if (event.status === "barrier" || event.status === "invincible" || event.status === "recover" || event.status === "boost" || event.status === "gauge") {
        const pillar = MeshBuilder.CreateCylinder("self-status-pillar", { height: mega ? 1.7 : 1.15, diameter: 0.045, tessellation: 8 }, scene);
        pillar.position = center.add(new Vector3(0, 0.48, 0));
        const pillarMaterial = new StandardMaterial("self-status-pillar-mat", scene);
        pillarMaterial.emissiveColor = color;
        pillarMaterial.alpha = 0.72;
        pillar.material = pillarMaterial;
        addEffect(pillar, mega ? 0.9 : 0.52, 0.34, 1.4, 0, 0.2);
      }
      if (mega) {
        const halo = MeshBuilder.CreateTorus("mega-halo", { diameter: 1.36, thickness: 0.035, tessellation: 32 }, scene);
        halo.rotation.x = Math.PI / 2;
        halo.position = center.add(new Vector3(0, 0.05, 0));
        const haloMaterial = new StandardMaterial("mega-halo-mat", scene);
        haloMaterial.emissiveColor = Color3.FromHexString("#F1E5FF");
        haloMaterial.alpha = 0.85;
        halo.material = haloMaterial;
        addEffect(halo, 0.92, 0.3, 4.3, -2.2, 0.12);
      }
    });
  };
  const guideMaterial = (name: string, color: Color3, alpha = 0.82) => {
    const material = new StandardMaterial(name, scene);
    material.emissiveColor = color;
    material.alpha = alpha;
    return material;
  };
  const guidePoint = (position: GridPosition, y = 0.64) => gridToWorld(position).add(new Vector3(0, y, 0));
  const addDirectionLine = (from: Vector3, to: Vector3, color: Color3, strength = 1) => {
    const delta = to.subtract(from);
    const length = delta.length();
    if (length < 0.08) return;
    const direction = delta.normalize();
    const center = from.add(to).scale(0.5);
    const line = MeshBuilder.CreateCylinder("direction-line", { height: length, diameter: 0.035 * strength, tessellation: 8 }, scene);
    const lineRotation = new Quaternion();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, lineRotation);
    line.position = center;
    line.rotationQuaternion = lineRotation;
    line.material = guideMaterial("direction-line-mat", color, 0.78);
    addEffect(line, 0.78, 0.2, 1, 0, 0);
    const arrow = MeshBuilder.CreateCylinder(
      "direction-arrow",
      {
        height: 0.28 * strength,
        diameterTop: 0,
        diameterBottom: 0.16 * strength,
        tessellation: 3,
      },
      scene
    );
    const arrowRotation = new Quaternion();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, arrowRotation);
    arrow.position = to.subtract(direction.scale(0.12 * strength));
    arrow.rotationQuaternion = arrowRotation;
    arrow.material = guideMaterial("direction-arrow-mat", color, 0.94);
    addEffect(arrow, 0.66, 0.42, 1.5, 2.6, 0);
  };
  const addRangeBar = (from: GridPosition, to: GridPosition, color: Color3) => addDirectionLine(guidePoint(from, 0.34), guidePoint(to, 0.34), color, 0.78);
  const makeDirectionGuide = (event: Extract<BattleEvent, { type: "card" }>) => {
    const color = cardColor(event);
    const origin = guidePoint(latest?.playerGrid ?? event.at);
    const targets = cardEffectTargets(event);
    if (event.target === "self") {
      const halo = MeshBuilder.CreateTorus("self-direction-halo", { diameter: 1.06, thickness: 0.045, tessellation: 30 }, scene);
      halo.rotation.x = Math.PI / 2;
      halo.position = origin;
      halo.material = guideMaterial("self-direction-halo-mat", color, 0.85);
      addEffect(halo, 0.6, 0.35, 2.3, 2.5, 0.26);
      const pillar = MeshBuilder.CreateCylinder("self-direction-pillar", { height: 1.45, diameter: 0.05, tessellation: 8 }, scene);
      pillar.position = origin.add(new Vector3(0, 0.5, 0));
      pillar.material = guideMaterial("self-direction-pillar-mat", color, 0.66);
      addEffect(pillar, 0.48, 0.35, 1.2, 0, 0.18);
      return;
    }
    targets.forEach((target, index) => addDirectionLine(origin, guidePoint(target), color, event.target === "enemy-field" ? 0.72 + index * 0.05 : 1));
    if (event.target === "row") {
      const row = targets[0]?.row ?? event.at.row;
      addRangeBar({ col: 3, row }, { col: 5, row }, color);
    }
    if (event.target === "column") {
      const column = targets[0]?.col ?? event.at.col;
      addRangeBar({ col: column, row: 0 }, { col: column, row: 2 }, color);
    }
    if (event.target === "near") addRangeBar({ col: 3, row: 0 }, { col: 3, row: 2 }, color);
    if (event.target === "cross") {
      const center = targets.find(position => position.col === 4 && position.row === (latest?.playerGrid.row ?? event.at.row)) ?? event.at;
      addRangeBar({ col: 3, row: center.row }, { col: 5, row: center.row }, color);
      addRangeBar({ col: 4, row: 0 }, { col: 4, row: 2 }, color);
    }
    if (event.target === "enemy-field") {
      const field = MeshBuilder.CreateTorus("field-direction-boundary", { diameter: 2.7, thickness: 0.035, tessellation: 4 }, scene);
      field.rotation.x = Math.PI / 2;
      field.rotation.z = Math.PI / 4;
      field.position = gridToWorld({ col: 4, row: 1 }).add(new Vector3(0, 0.3, 0));
      field.scaling.z = 0.72;
      field.material = guideMaterial("field-direction-boundary-mat", color, 0.65);
      addEffect(field, 0.55, 0.55, 1.6, 1.1, 0.05);
    }
  };
  const makeSlashMotion = (event: Extract<BattleEvent, { type: "card" }>) => {
    if (event.family !== "近接" || !latest) return;
    const profiles = {
      slash: {
        arcs: 2,
        radius: 0.64,
        spread: 2.1,
        start: -1.05,
        color: "#FFF1CD",
      },
      sweep: {
        arcs: 1,
        radius: 1.18,
        spread: 2.62,
        start: -1.31,
        color: "#FFE2A0",
      },
      dashslash: {
        arcs: 3,
        radius: 0.84,
        spread: 1.75,
        start: -0.88,
        color: "#FFF5D8",
      },
      gridcut: {
        arcs: 2,
        radius: 0.9,
        spread: 2.95,
        start: -1.48,
        color: "#F5E4FF",
      },
      moonblade: {
        arcs: 1,
        radius: 1.26,
        spread: 2.35,
        start: -1.18,
        color: "#F7F0C2",
      },
    } as const;
    const profile = profiles[event.cardId as keyof typeof profiles];
    if (!profile) return;
    const origin = gridToWorld(latest.playerGrid).add(new Vector3(0.58, 0.72, 0));
    for (let index = 0; index < profile.arcs; index += 1) {
      const radius = profile.radius + index * 0.1;
      const offset = event.cardId === "dashslash" ? index * 0.17 : index * 0.05;
      const path = Array.from({ length: 14 }, (_, step) => {
        const theta = profile.start + (profile.spread * step) / 13;
        return origin.add(new Vector3(Math.cos(theta) * radius + offset, Math.sin(theta) * radius + index * 0.06, event.cardId === "gridcut" ? (index === 0 ? -0.12 : 0.12) : 0));
      });
      const arc = MeshBuilder.CreateTube(
        "slash-arc",
        {
          path,
          radius: event.cardId === "moonblade" ? 0.052 : 0.035,
          tessellation: 8,
          cap: Mesh.CAP_ALL,
        },
        scene
      );
      const material = new StandardMaterial("slash-arc-mat", scene);
      material.emissiveColor = index === 0 ? Color3.FromHexString(profile.color) : EMBER;
      material.alpha = 0.92;
      arc.material = material;
      addEffect(arc, 0.52 + index * 0.06, 0.68, 1.18, index % 2 ? -4.1 : 5.2, 0.1);
    }
  };
  const makeCardSignature = (event: Extract<BattleEvent, { type: "card" }>) => {
    const recipe = getCardVfxRecipe(event.cardId);
    if (!recipe) return;
    const main = Color3.FromHexString(recipe.accent);
    const secondary = Color3.FromHexString(recipe.secondary);
    const targets = event.tiles.length > 0 ? event.tiles : [event.at];
    const playerGrid = latest?.playerGrid ?? (event.target === "self" ? event.at : { col: 2, row: 1 });
    const center = (position: GridPosition, y = 0.42) => gridToWorld(position).add(new Vector3(0, y, 0));
    const playerCenter = center(playerGrid, 0.72);
    const material = (name: string, color: Color3, alpha = 0.86) => {
      const mat = new StandardMaterial(name, scene);
      mat.emissiveColor = color;
      mat.alpha = alpha;
      mat.backFaceCulling = false;
      return mat;
    };
    const orb = (name: string, position: Vector3, color: Color3, diameter = 0.18, duration = 0.5, rise = 0.16) => {
      const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 10 }, scene);
      mesh.position = position;
      mesh.material = material(`${name}-mat`, color);
      addEffect(mesh, duration, 0.48, 1.18, 2.5, rise);
      return mesh;
    };
    const ring = (name: string, position: Vector3, color: Color3, diameter = 0.8, duration = 0.58, vertical = false, tessellation = 28) => {
      const mesh = MeshBuilder.CreateTorus(name, { diameter, thickness: 0.04, tessellation }, scene);
      if (!vertical) mesh.rotation.x = Math.PI / 2;
      mesh.position = position;
      mesh.material = material(`${name}-mat`, color, 0.8);
      addEffect(mesh, duration, 0.52, 1.75, vertical ? 1.8 : 3.2, 0.05);
      return mesh;
    };
    const disc = (name: string, position: Vector3, color: Color3, radius = 0.46, duration = 0.5) => {
      const mesh = MeshBuilder.CreateDisc(name, { radius, tessellation: 24 }, scene);
      mesh.rotation.x = Math.PI / 2;
      mesh.position = position;
      mesh.material = material(`${name}-mat`, color, 0.26);
      addEffect(mesh, duration, 0.28, 1.72, -2.2, 0);
      return mesh;
    };
    const pillar = (name: string, position: Vector3, color: Color3, height = 1.15, diameter = 0.12, duration = 0.58, fall = false) => {
      const mesh = MeshBuilder.CreateCylinder(name, { height, diameter, tessellation: 8 }, scene);
      mesh.position = position;
      mesh.material = material(`${name}-mat`, color, 0.8);
      addEffect(mesh, duration, 0.45, 1.04, 0.8, fall ? -0.7 : 0.22);
      return mesh;
    };
    const cube = (name: string, position: Vector3, color: Color3, size = 0.22, duration = 0.55) => {
      const mesh = MeshBuilder.CreateBox(name, { size }, scene);
      mesh.position = position;
      mesh.material = material(`${name}-mat`, color, 0.84);
      addEffect(mesh, duration, 0.5, 1.15, 3.4, 0.18);
      return mesh;
    };
    const ray = (from: Vector3, to: Vector3, color: Color3, strength = 1) => addDirectionLine(from, to, color, strength);
    const targetCenters = targets.map(target => center(target));
    const fieldCenter = center({ col: 4, row: 1 });
    const horizontal = (color: Color3, y = 0.34, strength = 0.74) => targets.forEach(target => ray(center({ col: 2, row: playerGrid.row }, y), center(target, y), color, strength));
    switch (event.cardId) {
      case "rapid":
        targetCenters.slice(0, 3).forEach((target, index) => {
          const start = playerCenter.add(new Vector3(0.18 + index * 0.1, 0.08 - index * 0.08, 0));
          orb("rapid-shot", start, main, 0.11, 0.32 + index * 0.08, 0);
          ray(start, target, main, 0.56);
        });
        break;
      case "lance":
        ray(playerCenter, targetCenters.at(-1) ?? fieldCenter, main, 1.72);
        ring("lance-tip", targetCenters.at(-1) ?? fieldCenter, secondary, 0.56, 0.55, true);
        break;
      case "seeker":
        targets.forEach(target => {
          const point = center(target, 0.6);
          orb("seeker-lock", point, main, 0.28, 0.54, 0.05);
          ring("seeker-sight", point, secondary, 0.66, 0.48);
        });
        break;
      case "triplet":
        targetCenters.slice(0, 3).forEach((target, index) => {
          orb("triplet-muzzle", playerCenter.add(new Vector3(0.12, index * 0.1, (index - 1) * 0.12)), secondary, 0.14, 0.32 + index * 0.08, 0);
          ring("triplet-hit", target, main, 0.48 + index * 0.08, 0.44 + index * 0.07);
        });
        break;
      case "wide":
        targets.forEach((target, index) => ray(playerCenter.add(new Vector3(0, 0, (index - 1) * 0.18)), center(target), main, 0.92));
        break;
      case "column":
        targets.forEach(target => {
          const targetPoint = center(target);
          const point = targetPoint.add(new Vector3(0, 1.55, 0));
          orb("column-shell", point, main, 0.2, 0.56, -1.08);
          pillar("column-flash", targetPoint.add(new Vector3(0, 0.35, 0)), secondary, 0.9, 0.07, 0.5, false);
        });
        break;
      case "cross":
        ring("cross-core", fieldCenter, main, 0.72, 0.6);
        targets.forEach(target => ray(fieldCenter, center(target), secondary, 0.84));
        break;
      case "fan":
        [-0.44, 0, 0.44].forEach((offset, index) => {
          const fan = disc("fan-blade", playerCenter.add(new Vector3(0.72, 0.03, offset)), main, 0.34 + index * 0.04, 0.55);
          fan.rotation.z = offset * 1.3;
        });
        break;
      case "ember":
        targets.forEach(target => {
          orb("ember-fireball", playerCenter, main, 0.24, 0.5, 0.04);
          orb("ember-spark", center(target).add(new Vector3(0, 0.35, 0)), secondary, 0.1, 0.36, 0.38);
        });
        break;
      case "fireline":
        targetCenters.forEach((target, index) => pillar("fireline-flame", target.add(new Vector3(0, 0.38, 0)), index % 2 ? secondary : main, 1.02, 0.17, 0.52));
        break;
      case "frost":
        targetCenters.forEach(target => {
          disc("frost-wave", target.add(new Vector3(0, -0.18, 0)), main, 0.62, 0.62);
          cube("frost-crystal", target.add(new Vector3(0.18, 0.22, -0.16)), secondary, 0.13, 0.54);
        });
        break;
      case "icewall":
        targetCenters.forEach((target, index) => {
          const wall = MeshBuilder.CreateBox("icewall-panel", { width: 0.78, height: 0.82, depth: 0.09 }, scene);
          wall.position = target.add(new Vector3(0, 0.35, 0));
          wall.material = material("icewall-panel-mat", index % 2 ? secondary : main, 0.72);
          addEffect(wall, 0.68, 0.55, 1.08, 0.42, 0.1);
        });
        break;
      case "volt":
        targetCenters.forEach((target, index) => {
          const previous = index === 0 ? playerCenter : targetCenters[index - 1];
          orb("volt-node", target, main, 0.17, 0.5, 0.12);
          ray(previous, target, secondary, 0.52);
        });
        break;
      case "thunderline":
        targetCenters.forEach(target => {
          pillar("thunderline-bolt", target.add(new Vector3(0, 1.12, 0)), main, 1.55, 0.07, 0.46, true);
          orb("thunderline-spark", target, secondary, 0.14, 0.38, 0.24);
        });
        break;
      case "root":
        targetCenters.forEach(target => {
          ring("root-bind-a", target, main, 0.74, 0.66);
          ring("root-bind-b", target.add(new Vector3(0, 0.17, 0)), secondary, 0.48, 0.56, true);
        });
        break;
      case "web":
        [0, 1, 2].forEach(row => ray(center({ col: 3, row }, 0.35), center({ col: 5, row }, 0.35), main, 0.58));
        [3, 4, 5].forEach(col => ray(center({ col, row: 0 }, 0.35), center({ col, row: 2 }, 0.35), secondary, 0.48));
        break;
      case "sweep":
        horizontal(main, 0.62, 1.3);
        break;
      case "dashslash":
        targets.forEach((target, index) => ray(playerCenter.add(new Vector3(index * 0.12, 0, 0)), center(target, 0.82), main, 1.05));
        break;
      case "gridcut": {
        const points = targetCenters;
        if (points.length >= 4) {
          ray(points[0], points.at(-1) ?? points[0], main, 0.82);
          ray(points[1] ?? points[0], points[3] ?? points[0], secondary, 0.82);
        }
        break;
      }
      case "timer": {
        const core = fieldCenter.add(new Vector3(0, 0.35, 0));
        orb("timer-core", core, main, 0.28, 0.78, 0.04);
        ring("timer-clock", core, secondary, 0.82, 0.78);
        targets.forEach(target => ring("timer-blast", center(target), main, 0.64, 0.54));
        break;
      }
      case "watchmine":
        targets
          .filter((_, index) => index % 2 === 0)
          .forEach(target => {
            const point = center(target, 0.32);
            orb("watchmine-node", point, main, 0.16, 0.74, 0.08);
            ring("watchmine-ping", point, secondary, 0.58, 0.68);
          });
        break;
      case "turret":
        targetCenters.forEach((target, index) => {
          pillar("turret-pod", target.add(new Vector3(0, 0.28, 0)), main, 0.5, 0.26, 0.72);
          ray(target.add(new Vector3(-0.34, 0.22, 0)), target.add(new Vector3(0.38, 0.22, 0)), secondary, 0.6 + index * 0.08);
        });
        break;
      case "stake":
        targetCenters.forEach(target => pillar("stake-spike", target.add(new Vector3(0, 0.35, 0)), main, 0.96, 0.11, 0.7));
        break;
      case "breakpillar":
        targetCenters.forEach(target => {
          pillar("breakpillar-drop", target.add(new Vector3(0, 1.18, 0)), main, 1.75, 0.24, 0.62, true);
          ring("breakpillar-crack", target, secondary, 0.9, 0.6);
        });
        break;
      case "block":
        [
          [-0.52, -0.52],
          [-0.52, 0.52],
          [0.52, -0.52],
          [0.52, 0.52],
        ].forEach(([x, z]) => cube("block-wall", playerCenter.add(new Vector3(x, -0.24, z)), main, 0.26, 0.78));
        break;
      case "toxic":
        targets.filter((_, index) => index % 2 === 0).forEach((target, index) => orb("toxic-cloud", center(target, 0.32 + (index % 3) * 0.12), index % 3 === 0 ? main : secondary, 0.34, 0.7, 0.24));
        break;
      case "sanctum":
        ring("sanctum-cell", playerCenter, main, 1.08, 0.8, false, 6);
        disc("sanctum-glow", playerCenter.add(new Vector3(0, -0.5, 0)), secondary, 0.52, 0.76);
        [0, 1, 2].forEach(index => orb("sanctum-particle", playerCenter.add(new Vector3((index - 1) * 0.22, 0, 0.2)), main, 0.1, 0.52, 0.42));
        break;
      case "crack":
        [0, 1].forEach(line => ray(center({ col: 3, row: playerGrid.row }, 0.2 + line * 0.045), center({ col: 5, row: playerGrid.row }, 0.2 + line * 0.045), line === 0 ? main : secondary, 0.52));
        break;
      case "rush":
        ring("rush-portal-a", playerCenter, main, 0.88, 0.66);
        ring("rush-portal-b", playerCenter.add(new Vector3(0, 0.26, 0)), secondary, 0.64, 0.6, true);
        break;
      case "sector":
        ring("sector-frame", playerCenter, main, 1.16, 0.74, false, 4);
        [-0.48, 0.48].forEach(x => [-0.48, 0.48].forEach(z => orb("sector-node", playerCenter.add(new Vector3(x, -0.34, z)), secondary, 0.1, 0.56, 0.22)));
        break;
      case "gravity":
        [0.54, 0.82, 1.12].forEach((diameter, index) => ring("gravity-well", fieldCenter.add(new Vector3(0, index * 0.07, 0)), index % 2 ? secondary : main, diameter, 0.72));
        break;
      case "gustwall":
        targetCenters.forEach((target, index) => {
          const gust = disc("gustwall-disc", target.add(new Vector3(0, 0.03 + index * 0.04, 0)), index % 2 ? secondary : main, 0.58, 0.7);
          gust.rotation.z = index * 0.38;
        });
        break;
      case "hole":
        disc("phase-hole", fieldCenter.add(new Vector3(0, -0.25, 0)), main, 1.15, 0.8);
        ring("phase-hole-rim", fieldCenter, secondary, 1.36, 0.8);
        break;
      case "prism":
        [0, 1, 2].forEach(index => {
          const angle = (Math.PI * 2 * index) / 3;
          const shard = MeshBuilder.CreateCylinder("prism-shard", { height: 0.48, diameter: 0.18, tessellation: 3 }, scene);
          shard.position = playerCenter.add(new Vector3(Math.cos(angle) * 0.58, 0.08, Math.sin(angle) * 0.58));
          shard.material = material("prism-shard-mat", index === 1 ? secondary : main);
          addEffect(shard, 0.76, 0.58, 1.04, 4.2, 0.1);
        });
        break;
      case "phase":
        [0, 1, 2, 3].forEach(index => {
          const angle = (Math.PI * 2 * index) / 4;
          orb("phase-afterimage", playerCenter.add(new Vector3(Math.cos(angle) * 0.42, (index % 2) * 0.15, Math.sin(angle) * 0.42)), index % 2 ? secondary : main, 0.12, 0.7, 0.15);
        });
        ring("phase-ring", playerCenter, main, 1.02, 0.74);
        break;
      case "return":
        [0, 1, 2, 3].forEach(index => {
          const blade = MeshBuilder.CreateBox("return-blade", { width: 0.42, height: 0.07, depth: 0.1 }, scene);
          blade.position = playerCenter.add(new Vector3(0.42, 0.02 + (index % 2) * 0.12, 0));
          blade.rotation.y = (Math.PI * index) / 2;
          blade.material = material("return-blade-mat", index % 2 ? secondary : main);
          addEffect(blade, 0.72, 0.45, 1.15, 5.6, 0.08);
        });
        break;
      case "substitute":
        ring("substitute-membrane-a", playerCenter, main, 1.18, 0.8, true);
        ring("substitute-membrane-b", playerCenter.add(new Vector3(0, 0.2, 0)), secondary, 0.84, 0.72, true);
        break;
      case "magguard": {
        const nodes = [new Vector3(-0.46, 0, -0.46), new Vector3(-0.46, 0, 0.46), new Vector3(0.46, 0, -0.46), new Vector3(0.46, 0, 0.46)].map(offset => playerCenter.add(offset));
        nodes.forEach(node => orb("magguard-node", node, main, 0.13, 0.72, 0.12));
        ray(nodes[0], nodes[1], secondary, 0.46);
        ray(nodes[1], nodes[3], secondary, 0.46);
        ray(nodes[3], nodes[2], secondary, 0.46);
        ray(nodes[2], nodes[0], secondary, 0.46);
        break;
      }
      case "premonition":
        ring("premonition-eye", playerCenter.add(new Vector3(0.46, 0, 0)), main, 0.72, 0.74, true);
        ray(playerCenter, center({ col: 3, row: playerGrid.row }, 0.72), secondary, 0.72);
        break;
      case "rectify":
        [-0.22, 0, 0.22].forEach((x, index) => orb("rectify-drop", playerCenter.add(new Vector3(x, -0.2, 0)), index === 1 ? secondary : main, 0.14, 0.64 + index * 0.06, 0.62));
        break;
      case "repair": {
        pillar("repair-cross-v", playerCenter.add(new Vector3(0, 0.18, 0)), main, 0.82, 0.08, 0.68);
        ray(playerCenter.add(new Vector3(-0.38, 0.18, 0)), playerCenter.add(new Vector3(0.38, 0.18, 0)), secondary, 0.72);
        cube("repair-module", playerCenter.add(new Vector3(0.3, 0.06, 0.24)), main, 0.16, 0.62);
        break;
      }
      case "fastsync":
        ring("fastsync-a", playerCenter, main, 1.06, 0.7);
        ring("fastsync-b", playerCenter.add(new Vector3(0, 0.17, 0)), secondary, 0.7, 0.64);
        break;
      case "stamp": {
        const seal = MeshBuilder.CreateBox("stamp-seal", { width: 0.72, height: 0.1, depth: 0.72 }, scene);
        seal.position = playerCenter.add(new Vector3(0, 0.82, 0));
        seal.material = material("stamp-seal-mat", main);
        addEffect(seal, 0.58, 0.75, 1.2, 1.4, -0.76);
        ring("stamp-impact", playerCenter, secondary, 0.86, 0.56);
        break;
      }
      case "reroute": {
        const path = [playerCenter.add(new Vector3(0.1, 0, 0)), playerCenter.add(new Vector3(0.55, 0.12, -0.24)), playerCenter.add(new Vector3(0.92, 0.08, 0.24)), playerCenter.add(new Vector3(1.34, 0.18, 0))];
        const circuit = MeshBuilder.CreateTube("reroute-circuit", { path, radius: 0.035, tessellation: 8, cap: Mesh.CAP_ALL }, scene);
        circuit.material = material("reroute-circuit-mat", main);
        addEffect(circuit, 0.72, 0.35, 1.24, 1.8, 0.1);
        path.forEach(point => orb("reroute-node", point, secondary, 0.1, 0.46, 0.12));
        break;
      }
      case "meteor":
        targets
          .filter((_, index) => index % 2 === 0)
          .forEach((target, index) => {
            const point = center(target, 1.6 + (index % 2) * 0.24);
            orb("meteor-core", point, index % 2 ? secondary : main, 0.34, 0.78, -1.12);
            ray(point, center(target, 0.18), secondary, 0.82);
            ring("meteor-impact", center(target), main, 0.92, 0.66);
          });
        break;
      case "dream": {
        const dome = MeshBuilder.CreateSphere("dream-dome", { diameter: 1.6, segments: 16 }, scene);
        dome.position = playerCenter.add(new Vector3(0, -0.26, 0));
        dome.material = material("dream-dome-mat", main, 0.22);
        addEffect(dome, 0.98, 0.62, 1.18, 1.8, 0.08);
        [0.76, 1.08, 1.38].forEach((diameter, index) => ring("dream-orbit", playerCenter.add(new Vector3(0, index * 0.14, 0)), index % 2 ? secondary : main, diameter, 0.9, index === 1));
        break;
      }
      case "sanctuary":
        ring("sanctuary-field", playerCenter, main, 1.62, 0.98, false, 6);
        [-0.42, 0, 0.42].forEach((x, index) => pillar("sanctuary-pillar", playerCenter.add(new Vector3(x, 0.56, 0)), index === 1 ? secondary : main, 1.7, 0.08, 0.86));
        break;
      case "overdrive":
        ring("overdrive-core", fieldCenter, main, 1.18, 0.9);
        orb("overdrive-reactor", fieldCenter.add(new Vector3(0, 0.46, 0)), secondary, 0.42, 0.82, 0.14);
        targets.forEach((target, index) => ray(fieldCenter, center(target, 0.74), index % 2 ? secondary : main, 1.24));
        break;
      default:
        break;
    }
  };
  const makeDeletedEffect = (event: Extract<BattleEvent, { type: "deleted" }>) => {
    const center = gridToWorld(event.at).add(new Vector3(0, 0.45, 0));
    const color = deleteColor(event.id);
    const burst = MeshBuilder.CreateTorus(
      "delete-burst",
      {
        diameter: event.id === "mortar" ? 1.9 : 1.45,
        thickness: 0.09,
        tessellation: 32,
      },
      scene
    );
    burst.rotation.x = Math.PI / 2;
    burst.position = center;
    const burstMaterial = new StandardMaterial("delete-burst-mat", scene);
    burstMaterial.emissiveColor = color;
    burstMaterial.alpha = 0.95;
    burst.material = burstMaterial;
    addEffect(burst, event.id === "mortar" ? 1.05 : 0.72, 0.25, event.id === "sentinel" ? 4.6 : 3.5, event.id === "razor" ? 3.2 : 1.5, 0.1);
    if (event.id === "scanner" || event.id === "sentinel") {
      for (let index = 0; index < 3; index += 1) {
        const halo = MeshBuilder.CreateTorus("delete-halo", { diameter: 0.76 + index * 0.22, thickness: 0.035, tessellation: 28 }, scene);
        halo.rotation.x = Math.PI / 2;
        halo.position = center.add(new Vector3(0, index * 0.08, 0));
        const haloMaterial = new StandardMaterial("delete-halo-mat", scene);
        haloMaterial.emissiveColor = index === 2 && event.id === "sentinel" ? Color3.FromHexString("#F2E8FF") : color;
        haloMaterial.alpha = 0.85;
        halo.material = haloMaterial;
        addEffect(halo, 0.72 + index * 0.08, 0.4, 3.2 + index, index % 2 ? -2.4 : 2.4, 0.08);
      }
    } else {
      const fragments = event.id === "mortar" ? 7 : event.id === "razor" ? 6 : 4;
      for (let index = 0; index < fragments; index += 1) {
        const angle = (Math.PI * 2 * index) / fragments;
        const fragment = MeshBuilder.CreateBox("delete-fragment", { size: event.id === "mortar" ? 0.18 : 0.12 }, scene);
        fragment.position = center.add(new Vector3(Math.cos(angle) * 0.22, 0.1, Math.sin(angle) * 0.22));
        const fragmentMaterial = new StandardMaterial("delete-fragment-mat", scene);
        fragmentMaterial.emissiveColor = color;
        fragment.material = fragmentMaterial;
        addEffect(fragment, 0.45 + (index % 2) * 0.08, 0.65, 0.1, index % 2 ? -4 : 4, 0.42 + (index % 3) * 0.05);
      }
    }
  };
  const createBeam = (event: Extract<BattleEvent, { type: "projectile" }>) => {
    const beam = MeshBuilder.CreateSphere("signal-beam", { diameter: event.charged ? 0.25 : 0.16, segments: 12 }, scene);
    const material = new StandardMaterial("signal-beam-mat", scene);
    material.emissiveColor = event.side === "player" ? (event.charged ? EMBER : TEAL) : EMBER;
    beam.material = material;
    beam.position = gridToWorld(event.from).add(new Vector3(0, 0.72, 0));
    beams.push({
      mesh: beam,
      from: beam.position.clone(),
      to: gridToWorld(event.to).add(new Vector3(0, 0.72, 0)),
      progress: 0,
      speed: event.charged ? 3.3 : 4.7,
    });
  };

  let latest: BattleSnapshot | null = null;
  let hitstopUntil = 0;
  let attackSpriteUntil = 0;
  let vibrationEnabled = true;
  const vibrate = (pattern: number | number[]) => {
    const canVibrate = (
      navigator as unknown as {
        vibrate?: (value: number | number[]) => boolean;
      }
    ).vibrate;
    if (vibrationEnabled && canVibrate) canVibrate.call(navigator, pattern);
  };
  const handleEvent = (event: BattleEvent) => {
    if (event.type === "attack") attackSpriteUntil = performance.now() + (event.charged ? 360 : 210);
    if (event.type === "projectile") createBeam(event);
    if (event.type === "card") {
      makeDirectionGuide(event);
      makeCardEffect(event);
      makeCardSignature(event);
      makeSlashMotion(event);
      audio.playCard(event.cardId, event.family, event.tier, event.status);
      vibrate(event.tier === "mega" ? [14, 28, 20] : 8);
    }
    if (event.type === "hitstop") hitstopUntil = Math.max(hitstopUntil, performance.now() + event.duration);
    if (event.type === "warning") {
      const tileKey = key(event.at);
      const tile = gridTiles.get(tileKey);
      if (tile) {
        if (event.enabled) {
          const count = (warningCounts.get(tileKey) ?? 0) + 1;
          warningCounts.set(tileKey, count);
          warningTiles.add(tileKey);
          if (count === 1) createWarningEffect(event.at);
        } else {
          const count = Math.max(0, (warningCounts.get(tileKey) ?? 1) - 1);
          if (count === 0) {
            warningCounts.delete(tileKey);
            warningTiles.delete(tileKey);
            clearWarningEffect(tileKey);
          } else warningCounts.set(tileKey, count);
        }
      }
    }
    if (event.type === "counter") {
      makeImpact(event.at, EMBER, true);
      audio.playCounter();
      vibrate([12, 22, 12]);
    }
    if (event.type === "impact") {
      makeImpact(event.at, event.side === "player" ? (event.cardId ? Color3.FromHexString(getCardVfxRecipe(event.cardId)?.accent ?? "#2AD4D9") : event.charged ? EMBER : TEAL) : EMBER, Boolean(event.counter));
      makeEnemyHitReaction(event);
    }
    if (event.type === "player-reaction") makePlayerReaction(event);
    if (event.type === "deleted") {
      makeDeletedEffect(event);
      audio.playDeleted(event.id);
      units.get(event.id)?.root.setEnabled(false);
      vibrate(event.id === "mortar" || event.id === "bulwark" ? [18, 24, 14] : event.id === "sentinel" ? [10, 22, 10, 22, 12] : [11, 16, 8]);
    }
  };
  const query = new URLSearchParams(window.location.search);
  const requestedWave = Number(query.get("wave")) || 1;
  const requestedFocus = Number(query.get("focuscard"));
  const requestedSelections = (query.get("selectcards") ?? "")
    .split(",")
    .map(Number)
    .filter(index => Number.isInteger(index) && index >= 0 && index < 5);
  const requestedVfxCard = CARD_CATALOG.find(card => card.id === query.get("vfx"));
  const requestedReactionEnemy = query.get("react");
  const requestedPlayerReaction = query.get("playerreaction");
  if (query.has("attackpose")) attackSpriteUntil = Number.MAX_SAFE_INTEGER;
  const world = new GameWorld(
    snapshot => {
      latest = snapshot;
      callbacks.onSnapshot?.(snapshot);
    },
    handleEvent,
    requestedWave
  );
  const sceneController = {
    ...world.controller,
    setSoundEnabled: (enabled: boolean) => audio.setEnabled(enabled),
    setSoundVolume: (volume: number) => audio.setVolume(volume),
    setVibrationEnabled: (enabled: boolean) => {
      vibrationEnabled = enabled;
      if (!enabled) (navigator as unknown as { vibrate?: (value: number) => boolean }).vibrate?.(0);
    },
  };
  if (Number.isInteger(requestedFocus) && requestedFocus >= 0 && requestedFocus < 5) world.controller.toggleCard(requestedFocus);
  requestedSelections.forEach(index => {
    world.controller.toggleCard(index);
    world.controller.toggleCard(index);
  });

  const keyDown = (event: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter"].includes(event.key)) event.preventDefault();
    if (event.repeat && event.key !== " ") return;
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") world.controller.move(0, 1);
    if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") world.controller.move(0, -1);
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") world.controller.move(-1, 0);
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") world.controller.move(1, 0);
    if (event.key.toLowerCase() === "z") world.controller.fire();
    if (event.key === " ") world.controller.startCharge();
    if (event.key.toLowerCase() === "x") world.controller.useSkill();
    if (event.key.toLowerCase() === "c") world.controller.openCustom();
    if (event.key === "Enter") world.controller.confirmCustom();
  };
  const keyUp = (event: KeyboardEvent) => {
    if (event.key === " ") {
      event.preventDefault();
      world.controller.releaseCharge();
    }
  };
  const cancelInterruptedInput = () => {
    world.controller.cancelCharge();
    world.onVisibilityChange(false);
    hitstopUntil = 0;
  };
  const handleVisibilityChange = () => {
    if (document.hidden) cancelInterruptedInput();
    else world.onVisibilityChange(true);
  };
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", cancelInterruptedInput);
  window.addEventListener("pagehide", cancelInterruptedInput);
  window.addEventListener("pointercancel", cancelInterruptedInput, {
    passive: true,
  });
  document.addEventListener("visibilitychange", handleVisibilityChange);

  let demoInterval: number | undefined;
  let demoTimeout: number | undefined;
  let pauseTimeout: number | undefined;
  if (query.has("demo")) {
    const demoPicks = query.has("selectall") ? [0, 1, 2, 3, 4] : [0, 1];
    demoTimeout = window.setTimeout(() => {
      demoPicks.forEach(index => {
        world.controller.toggleCard(index);
        world.controller.toggleCard(index);
      });
      world.controller.confirmCustom();
    }, 500);
    demoInterval = window.setInterval(() => {
      if (!latest) return;
      if (latest.mode === "battle") {
        const step = Math.floor(latest.elapsed * 1.7) % 4;
        if (step === 0) world.controller.move(0, -1);
        if (step === 1) world.controller.move(1, 0);
        if (step === 2) world.controller.move(0, 1);
        if (step === 3) world.controller.move(-1, 0);
        if (latest.queue.length > 0) world.controller.useSkill();
        else world.controller.fire();
      }
      if (latest.mode === "custom" && latest.selected.length === 0) {
        demoPicks.forEach(index => {
          world.controller.toggleCard(index);
          world.controller.toggleCard(index);
        });
        world.controller.confirmCustom();
      }
      if (latest.mode === "intermission") {
        world.controller.nextWave();
        window.setTimeout(() => {
          demoPicks.forEach(index => {
            world.controller.toggleCard(index);
            world.controller.toggleCard(index);
          });
          world.controller.confirmCustom();
        }, 260);
      }
      if (latest.mode === "result") world.controller.restart();
    }, 820);
    if (query.has("pause")) pauseTimeout = window.setTimeout(() => world.controller.togglePause(), 1800);
  }

  const debugVfxTiles = (target: NonNullable<typeof requestedVfxCard>["target"], playerGrid: GridPosition): GridPosition[] => {
    const row = playerGrid.row;
    if (target === "self") return [{ ...playerGrid }];
    if (target === "near") return [0, 1, 2].map(targetRow => ({ col: 3, row: targetRow }));
    if (target === "front" || target === "row") return [3, 4, 5].map(col => ({ col, row }));
    if (target === "column") return [0, 1, 2].map(targetRow => ({ col: 4, row: targetRow }));
    if (target === "cross")
      return [
        { col: 3, row },
        { col: 4, row },
        { col: 5, row },
        { col: 4, row: 0 },
        { col: 4, row: 2 },
      ];
    return [3, 4, 5].flatMap(col => [0, 1, 2].map(targetRow => ({ col, row: targetRow })));
  };
  let nextVfxPreviewAt = performance.now();
  let nextReactionPreviewAt = performance.now() + 160;
  let nextPlayerReactionPreviewAt = performance.now() + 240;

  scene.onBeforeRenderObservable.add(() => {
    const rawDelta = Math.max(0, engine.getDeltaTime() / 1000);
    world.update(rawDelta);
    const delta = latest?.paused || performance.now() < hitstopUntil ? 0 : Math.min(rawDelta, 0.05);
    if (!latest) return;
    updatePanelVisuals(latest);
    syncObjectVisuals(latest);
    if (requestedVfxCard && performance.now() >= nextVfxPreviewAt) {
      const tiles = debugVfxTiles(requestedVfxCard.target, latest.playerGrid);
      handleEvent({
        type: "card",
        cardId: requestedVfxCard.id,
        at: { ...(tiles[0] ?? latest.playerGrid) },
        tiles,
        family: requestedVfxCard.family,
        tier: requestedVfxCard.tier,
        target: requestedVfxCard.target,
        status: requestedVfxCard.status,
      });
      nextVfxPreviewAt = performance.now() + 1250;
    }
    if (requestedReactionEnemy && performance.now() >= nextReactionPreviewAt) {
      const enemy = latest.enemies.find(candidate => candidate.id === requestedReactionEnemy && candidate.state !== "deleted");
      if (enemy)
        handleEvent({
          type: "impact",
          at: { ...enemy.grid },
          side: "player",
          enemyId: enemy.id,
          cardId: requestedVfxCard?.id ?? "overdrive",
          damage: requestedVfxCard?.power ?? 92,
          status: requestedVfxCard?.status,
          charged: true,
        });
      nextReactionPreviewAt = performance.now() + 1100;
    }
    if (requestedPlayerReaction && performance.now() >= nextPlayerReactionPreviewAt) {
      const kinds = ["damage", "barrier", "phase", "counter", "dodge"] as const;
      if (kinds.includes(requestedPlayerReaction as (typeof kinds)[number]))
        handleEvent({
          type: "player-reaction",
          at: { ...latest.playerGrid },
          kind: requestedPlayerReaction as (typeof kinds)[number],
          damage: requestedPlayerReaction === "damage" ? 36 : 0,
        });
      nextPlayerReactionPreviewAt = performance.now() + 1150;
    }

    const playerTarget = gridToWorld(latest.playerGrid);
    let playerRecoil = Vector3.Zero();
    let playerTilt = 0;
    let playerScale = 1;
    let playerRingColor = latest.sync ? EMBER : TEAL;
    let playerReactionStrength = 0;
    if (playerReaction) {
      const age = (performance.now() - playerReaction.startedAt) / 1000;
      const duration = playerReaction.kind === "counter" ? 0.5 : 0.42;
      if (age >= duration) playerReaction = null;
      else {
        const beat = Math.sin((age / duration) * Math.PI);
        playerReactionStrength = beat;
        if (playerReaction.kind === "damage") {
          playerRecoil = new Vector3(-0.34 * beat, 0.05 * beat, 0);
          playerTilt = -0.38 * beat;
          playerScale = 1 - 0.11 * beat;
          playerRingColor = EMBER;
        }
        if (playerReaction.kind === "barrier") {
          playerRecoil = new Vector3(-0.06 * beat, 0, 0);
          playerTilt = 0.12 * beat;
          playerScale = 1 + 0.05 * beat;
          playerRingColor = Color3.FromHexString("#F4FFF9");
        }
        if (playerReaction.kind === "phase") {
          playerRecoil = new Vector3(-0.08 * beat, 0.04 * beat, Math.sin(age * 34) * 0.1 * beat);
          playerScale = 1 + 0.04 * beat;
          playerRingColor = Color3.FromHexString("#75E6FF");
        }
        if (playerReaction.kind === "counter") {
          playerRecoil = new Vector3(0.16 * beat, 0.03 * beat, 0);
          playerTilt = 0.2 * beat;
          playerScale = 1 + 0.07 * beat;
          playerRingColor = EMBER;
        }
        if (playerReaction.kind === "dodge") {
          playerRecoil = new Vector3(-0.14 * beat, 0, Math.sin(age * 28) * 0.12 * beat);
          playerTilt = -0.16 * beat;
          playerRingColor = TEAL;
        }
      }
    }
    player.root.position.copyFrom(playerTarget.add(playerRecoil));
    player.root.rotation.z = playerTilt;
    player.root.scaling.setAll(playerScale);
    const attacking = performance.now() < attackSpriteUntil;
    const damageBlink = Boolean(playerReaction?.kind === "damage" && Math.floor((performance.now() - playerReaction.startedAt) / 58) % 2 === 0);
    player.plane.isVisible = !attacking && !damageBlink;
    playerAttack.isVisible = attacking && !damageBlink;
    const pulse = 1 + Math.sin(performance.now() / 150) * 0.035;
    player.ring.scaling.setAll((latest.sync ? pulse * 1.2 : pulse) * (1 + playerReactionStrength * 0.24));
    (player.ring.material as StandardMaterial).emissiveColor = playerRingColor;
    player.ring.isVisible = latest.mode === "battle";

    const activeEnemyIds = new Set(latest.enemies.map(enemy => enemy.id));
    for (const [id, unit] of Array.from(units.entries())) {
      if (!activeEnemyIds.has(id)) unit.root.setEnabled(false);
    }
    for (const enemy of latest.enemies) {
      const unit = units.get(enemy.id);
      if (!unit) continue;
      unit.root.setEnabled(enemy.state !== "deleted");
      const y = enemy.id === "scanner" || enemy.id === "sentinel" ? 0.32 : 0;
      const target = gridToWorld(enemy.grid).add(new Vector3(0, y, 0));
      const reaction = enemyReactions.get(enemy.id);
      let reactionStrength = 0;
      let recoil = Vector3.Zero();
      let tilt = 0;
      let scale = 1;
      if (reaction) {
        const age = (performance.now() - reaction.startedAt) / 1000;
        if (age >= 0.42) enemyReactions.delete(enemy.id);
        else {
          const beat = Math.sin(Math.min(1, age / 0.42) * Math.PI);
          reactionStrength = reaction.strength * beat;
          if (reaction.id === "bulwark") {
            recoil = new Vector3(-0.28 * reactionStrength, 0.03 * reactionStrength, 0);
            tilt = -0.18 * reactionStrength;
            scale = 1 + 0.08 * reactionStrength;
          }
          if (reaction.id === "scanner") {
            recoil = new Vector3(-0.05 * reactionStrength, 0.12 * reactionStrength, Math.sin(age * 44) * 0.16 * reactionStrength);
            tilt = Math.sin(age * 46) * 0.32 * reactionStrength;
            scale = 1 + 0.13 * reactionStrength;
          }
          if (reaction.id === "razor") {
            recoil = new Vector3(-0.38 * reactionStrength, 0.08 * reactionStrength, Math.sin(age * 55) * 0.09 * reactionStrength);
            tilt = 0.28 * reactionStrength;
            scale = 1 + 0.06 * reactionStrength;
          }
          if (reaction.id === "mortar") {
            recoil = new Vector3(-0.1 * reactionStrength, 0.26 * reactionStrength, 0);
            tilt = -0.1 * reactionStrength;
            scale = 1 + 0.16 * reactionStrength;
          }
          if (reaction.id === "sentinel") {
            recoil = new Vector3(-0.08 * reactionStrength, 0.06 * reactionStrength, Math.sin(age * 66) * 0.21 * reactionStrength);
            tilt = Math.sin(age * 62) * 0.22 * reactionStrength;
            scale = 1 + 0.12 * reactionStrength;
          }
        }
      }
      unit.root.position = Vector3.Lerp(unit.root.position, target.add(recoil), Math.min(1, delta * 10));
      unit.root.rotation.z = tilt;
      unit.root.scaling.setAll(scale);
      const windupScale = enemy.state === "windup" ? 1.18 + Math.sin(performance.now() / 85) * 0.14 : 1;
      unit.ring.scaling.setAll(windupScale * (1 + reactionStrength * 0.24));
      (unit.ring.material as StandardMaterial).emissiveColor = enemy.state === "windup" ? EMBER : enemy.state === "stunned" ? TEAL : OCHRE;
    }

    for (const [tileKey, tile] of Array.from(gridTiles.entries())) {
      const material = tile.material as StandardMaterial;
      const warning = warningTiles.has(tileKey);
      const effect = warningEffects.get(tileKey);
      const age = effect ? (performance.now() - effect.startedAt) / 1000 : 0;
      const urgency = reducedMotion ? 0.6 : Math.min(1, 0.35 + age * 0.42);
      const pulseRate = 5 + urgency * 12;
      const pulse = reducedMotion ? 0.72 : 0.5 + 0.5 * Math.sin(age * pulseRate * Math.PI * 2);
      if (warning) {
        material.diffuseColor = EMBER.scale(0.18 + urgency * 0.24 + pulse * 0.1);
        material.emissiveColor = EMBER.scale(0.16 + urgency * 0.44 + pulse * 0.22);
      }
      if (effect) {
        const ringMaterial = effect.ring.material as StandardMaterial;
        const scanMaterial = effect.scan.material as StandardMaterial;
        const cycle = reducedMotion ? 0.55 : (age * (0.62 + urgency * 0.9)) % 1;
        effect.ring.scaling.setAll(0.72 + urgency * 0.16 + pulse * 0.11);
        ringMaterial.alpha = 0.35 + urgency * 0.45 + pulse * 0.2;
        effect.scan.scaling.setAll(0.22 + cycle * 1.15);
        scanMaterial.alpha = Math.max(0.06, (1 - cycle) * (0.14 + urgency * 0.18));
      }
    }

    for (let index = beams.length - 1; index >= 0; index -= 1) {
      const beam = beams[index];
      beam.progress += delta * beam.speed;
      beam.mesh.position = Vector3.Lerp(beam.from, beam.to, Math.min(1, beam.progress));
      beam.mesh.scaling.setAll(1 + Math.sin(beam.progress * Math.PI) * 0.4);
      if (beam.progress >= 1) {
        beam.mesh.dispose();
        beams.splice(index, 1);
      }
    }
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      const effect = effects[index];
      effect.age += delta;
      const ratio = effect.age / effect.duration;
      effect.mesh.scaling.setAll(effect.startScale + (effect.endScale - effect.startScale) * ratio);
      effect.mesh.rotation.y += effect.spin * delta;
      effect.mesh.position.y += effect.rise * delta;
      (effect.mesh.material as StandardMaterial).alpha = Math.max(0, 0.9 * (1 - ratio));
      if (ratio >= 1) {
        effect.mesh.dispose();
        effects.splice(index, 1);
      }
    }
  });

  return {
    scene,
    controller: sceneController,
    dispose: () => {
      if (demoInterval) window.clearInterval(demoInterval);
      if (demoTimeout) window.clearTimeout(demoTimeout);
      if (pauseTimeout) window.clearTimeout(pauseTimeout);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", cancelInterruptedInput);
      window.removeEventListener("pagehide", cancelInterruptedInput);
      window.removeEventListener("pointercancel", cancelInterruptedInput);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      (navigator as unknown as { vibrate?: (value: number) => boolean }).vibrate?.(0);
      for (const visual of Array.from(objectMeshes.values())) visual.root.dispose(false, true);
      audio.dispose();
      glow.dispose();
      scene.dispose();
    },
  };
}

import type { EnemyId } from "./enemies";
import { getEnemyDefinition } from "./enemies";
import type { GridPosition } from "../types";

export interface EncounterSpawn {
  enemyId: EnemyId;
  grid: GridPosition;
}

export interface EncounterTemplate {
  id: string;
  wave: 1 | 2 | 3;
  spawns: readonly EncounterSpawn[];
}

const key = (position: GridPosition): string =>
  String(position.col) + ":" + String(position.row);

const escapeTiles: readonly GridPosition[] = [
  { col: 0, row: 1 },
  { col: 1, row: 0 },
  { col: 1, row: 2 },
  { col: 2, row: 1 },
];

export const WAVE_ENCOUNTERS: Readonly<
  Record<1 | 2 | 3, readonly EncounterTemplate[]>
> = {
  1: [
    {
      id: "wave-1-formation-a",
      wave: 1,
      spawns: [
        { enemyId: "bulwark", grid: { col: 4, row: 1 } },
        { enemyId: "scanner", grid: { col: 5, row: 0 } },
      ],
    },
    {
      id: "wave-1-formation-b",
      wave: 1,
      spawns: [
        { enemyId: "scanner", grid: { col: 5, row: 0 } },
        { enemyId: "gaia-hammer", grid: { col: 4, row: 2 } },
      ],
    },
    {
      id: "wave-1-formation-c",
      wave: 1,
      spawns: [
        { enemyId: "razor", grid: { col: 4, row: 1 } },
        { enemyId: "support-relay", grid: { col: 5, row: 0 } },
      ],
    },
  ],
  2: [
    {
      id: "wave-2-formation-a",
      wave: 2,
      spawns: [
        { enemyId: "razor", grid: { col: 4, row: 0 } },
        { enemyId: "mortar", grid: { col: 5, row: 1 } },
      ],
    },
    {
      id: "wave-2-formation-b",
      wave: 2,
      spawns: [
        { enemyId: "boomer-arc", grid: { col: 5, row: 0 } },
        { enemyId: "hopper-bomb", grid: { col: 4, row: 2 } },
      ],
    },
    {
      id: "wave-2-formation-c",
      wave: 2,
      spawns: [
        { enemyId: "wave-runner", grid: { col: 5, row: 1 } },
        { enemyId: "scanner", grid: { col: 4, row: 0 } },
        { enemyId: "support-relay", grid: { col: 5, row: 2 } },
      ],
    },
  ],
  3: [
    {
      id: "wave-3-formation-a",
      wave: 3,
      spawns: [
        { enemyId: "gaia-hammer", grid: { col: 5, row: 1 } },
        { enemyId: "mirror-node", grid: { col: 4, row: 0 } },
        { enemyId: "support-relay", grid: { col: 5, row: 2 } },
      ],
    },
    {
      id: "wave-3-formation-b",
      wave: 3,
      spawns: [
        { enemyId: "weather-core", grid: { col: 4, row: 1 } },
        { enemyId: "sentinel", grid: { col: 5, row: 0 } },
      ],
    },
    {
      id: "wave-3-formation-c",
      wave: 3,
      spawns: [
        { enemyId: "mirror-node", grid: { col: 5, row: 2 } },
        { enemyId: "razor", grid: { col: 4, row: 1 } },
        { enemyId: "support-relay", grid: { col: 5, row: 0 } },
      ],
    },
  ],
};

export const BOSS_SUPPORT_SPAWN: EncounterSpawn = {
  enemyId: "support-relay",
  grid: { col: 5, row: 0 },
};

export function encounterHasSafeStart(
  spawns: readonly EncounterSpawn[]
): boolean {
  const occupied = new Set(spawns.map(spawn => key(spawn.grid)));
  return escapeTiles.some(
    tile => tile.col <= 2 && !occupied.has(key(tile))
  );
}

export function validateEncounterTemplate(
  template: EncounterTemplate
): string[] {
  const errors: string[] = [];
  if (template.spawns.length === 0 || template.spawns.length > 4)
    errors.push("敵数が1〜4体の範囲外です");
  const positions = new Set<string>();
  let bossCount = 0;
  for (const spawn of template.spawns) {
    const definition = getEnemyDefinition(spawn.enemyId);
    if (!definition) errors.push("未知の敵: " + spawn.enemyId);
    if (definition?.rank === "boss") bossCount += 1;
    const position = key(spawn.grid);
    if (positions.has(position))
      errors.push("同じマスに敵が重なっています: " + position);
    positions.add(position);
    if (
      spawn.grid.col < 3 ||
      spawn.grid.col > 5 ||
      spawn.grid.row < 0 ||
      spawn.grid.row > 2
    )
      errors.push("敵陣外へ敵を配置しています: " + position);
  }
  if (bossCount > 1) errors.push("1編成にボスを2体以上配置しています");
  if (!encounterHasSafeStart(template.spawns))
    errors.push("開始時の安全な退避マスがありません");
  return errors;
}

export function getEncounterTemplates(
  wave: 1 | 2 | 3
): readonly EncounterTemplate[] {
  return WAVE_ENCOUNTERS[wave];
}

export function allEncounterTemplates(): readonly EncounterTemplate[] {
  return (Object.values(WAVE_ENCOUNTERS) as readonly EncounterTemplate[][]).flat();
}

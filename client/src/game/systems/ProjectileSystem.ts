import type { GridPosition, ProjectileMotion, ProjectileState } from "../types";

export interface ProjectileSpawn {
  id?: string;
  owner: "player" | "enemy";
  motion: ProjectileMotion;
  position: GridPosition;
  direction?: GridPosition;
  target?: GridPosition | null;
  damage: number;
  sourceId?: string | null;
  sourceCardId?: string | null;
  charged?: boolean;
  activeAt?: number;
  expiresAt?: number;
  speedCellsPerSecond?: number;
  flightMs?: number;
  bouncesRemaining?: number;
  rowSpan?: boolean;
  splashRadius?: number;
  stopOnObject?: boolean;
}

export interface ProjectileCollision {
  targetIds?: string[];
  objectId?: string | null;
  stop?: boolean;
}

export interface ProjectileCollisionContext {
  collision: (
    projectile: ProjectileState,
    positions: GridPosition[]
  ) => ProjectileCollision;
  findHomingTarget?: (projectile: ProjectileState) => GridPosition | null;
}

export interface ProjectileResolution {
  projectile: ProjectileState;
  position: GridPosition;
  targetIds: string[];
  objectId: string | null;
  kind: "hit" | "blocked" | "expired";
}

const BOARD_COLUMNS = 6;
const BOARD_ROWS = 3;
const DEFAULT_LIFETIME_MS = 1800;
const DEFAULT_SPEED = 12;

function clonePosition(position: GridPosition): GridPosition {
  return { col: position.col, row: position.row };
}

function cloneProjectile(projectile: ProjectileState): ProjectileState {
  return {
    ...projectile,
    position: clonePosition(projectile.position),
    direction: clonePosition(projectile.direction),
    origin: clonePosition(projectile.origin),
    target: projectile.target ? clonePosition(projectile.target) : null,
    hitTargets: [...projectile.hitTargets],
    hitObjects: [...projectile.hitObjects],
  };
}

function normaliseDirection(direction: GridPosition): GridPosition {
  return {
    col: direction.col === 0 ? 0 : Math.sign(direction.col),
    row: direction.row === 0 ? 0 : Math.sign(direction.row),
  };
}

function directionTo(from: GridPosition, to: GridPosition): GridPosition {
  return normaliseDirection({ col: to.col - from.col, row: to.row - from.row });
}

function inside(position: GridPosition): boolean {
  return (
    position.col >= 0 &&
    position.col < BOARD_COLUMNS &&
    position.row >= 0 &&
    position.row < BOARD_ROWS
  );
}

function move(position: GridPosition, direction: GridPosition): GridPosition {
  return {
    col: position.col + direction.col,
    row: position.row + direction.row,
  };
}

function turnClockwise(direction: GridPosition): GridPosition {
  if (direction.col === 1) return { col: 0, row: 1 };
  if (direction.row === 1) return { col: -1, row: 0 };
  if (direction.col === -1) return { col: 0, row: -1 };
  return { col: 1, row: 0 };
}

function collisionPositions(projectile: ProjectileState): GridPosition[] {
  const positions: GridPosition[] = projectile.rowSpan
    ? Array.from({ length: BOARD_ROWS }, (_, row) => ({
        col: projectile.position.col,
        row,
      }))
    : [projectile.position];
  if (projectile.splashRadius <= 0) return positions;
  const expanded = [...positions];
  positions.forEach(position => {
    for (
      let col = position.col - projectile.splashRadius;
      col <= position.col + projectile.splashRadius;
      col += 1
    )
      for (
        let row = position.row - projectile.splashRadius;
        row <= position.row + projectile.splashRadius;
        row += 1
      )
        if (inside({ col, row })) expanded.push({ col, row });
  });
  return expanded.filter(
    (position, index, all) =>
      all.findIndex(
        candidate =>
          candidate.col === position.col && candidate.row === position.row
      ) === index
  );
}

export class ProjectileSystem {
  private readonly projectiles = new Map<string, ProjectileState>();
  private sequence = 0;

  public reset(): void {
    this.projectiles.clear();
    this.sequence = 0;
  }

  public snapshot(): ProjectileState[] {
    return Array.from(this.projectiles.values(), cloneProjectile);
  }

  public spawn(spawn: ProjectileSpawn, nowMs = 0): ProjectileState {
    const id = spawn.id ?? `projectile-${this.sequence++}`;
    const position = clonePosition(spawn.position);
    const target = spawn.target ? clonePosition(spawn.target) : null;
    const direction = spawn.direction
      ? normaliseDirection(spawn.direction)
      : target
        ? directionTo(position, target)
        : { col: 1, row: 0 };
    const projectile: ProjectileState = {
      id,
      owner: spawn.owner,
      motion: spawn.motion,
      position,
      direction,
      origin: clonePosition(position),
      target,
      damage: Math.max(0, spawn.damage),
      sourceId: spawn.sourceId ?? null,
      sourceCardId: spawn.sourceCardId ?? null,
      charged: spawn.charged ?? false,
      activeAt: spawn.activeAt ?? nowMs,
      expiresAt:
        spawn.expiresAt ?? (spawn.activeAt ?? nowMs) + DEFAULT_LIFETIME_MS,
      speedCellsPerSecond: Math.max(
        0.1,
        spawn.speedCellsPerSecond ?? DEFAULT_SPEED
      ),
      travelProgress: 0,
      flightMs: Math.max(0, spawn.flightMs ?? 0),
      bouncesRemaining: Math.max(0, Math.trunc(spawn.bouncesRemaining ?? 0)),
      rowSpan: spawn.rowSpan ?? false,
      splashRadius: Math.max(0, Math.trunc(spawn.splashRadius ?? 0)),
      stopOnObject: spawn.stopOnObject ?? true,
      hitTargets: [],
      hitObjects: [],
    };
    this.projectiles.set(id, projectile);
    return cloneProjectile(projectile);
  }

  public remove(id: string): ProjectileState | null {
    const projectile = this.projectiles.get(id);
    if (!projectile) return null;
    this.projectiles.delete(id);
    return cloneProjectile(projectile);
  }

  public advance(
    nowMs: number,
    deltaMs: number,
    context: ProjectileCollisionContext
  ): ProjectileResolution[] {
    const resolutions: ProjectileResolution[] = [];
    for (const projectile of Array.from(this.projectiles.values())) {
      if (nowMs < projectile.activeAt) continue;
      if (nowMs >= projectile.expiresAt) {
        this.projectiles.delete(projectile.id);
        resolutions.push({
          projectile: cloneProjectile(projectile),
          position: clonePosition(projectile.position),
          targetIds: [],
          objectId: null,
          kind: "expired",
        });
        continue;
      }
      if (projectile.motion === "thrown") {
        if (nowMs < projectile.activeAt + projectile.flightMs) continue;
        if (projectile.target && inside(projectile.target))
          projectile.position = clonePosition(projectile.target);
        const resolution = this.resolveCollision(projectile, context);
        resolutions.push(resolution);
        this.projectiles.delete(projectile.id);
        continue;
      }

      projectile.travelProgress +=
        (Math.max(0, deltaMs) / 1000) * projectile.speedCellsPerSecond;
      while (projectile.travelProgress >= 1) {
        projectile.travelProgress -= 1;
        if (projectile.motion === "homing") {
          const target = context.findHomingTarget?.(projectile);
          if (target)
            projectile.direction = directionTo(projectile.position, target);
        }
        let next = move(projectile.position, projectile.direction);
        if (!inside(next)) {
          if (
            projectile.motion === "reflect" &&
            projectile.bouncesRemaining > 0
          ) {
            projectile.bouncesRemaining -= 1;
            projectile.direction = normaliseDirection({
              col: -projectile.direction.col,
              row: -projectile.direction.row,
            });
            next = move(projectile.position, projectile.direction);
          } else if (projectile.motion === "orbit") {
            projectile.direction = turnClockwise(projectile.direction);
            next = move(projectile.position, projectile.direction);
          }
        }
        if (!inside(next)) {
          this.projectiles.delete(projectile.id);
          resolutions.push({
            projectile: cloneProjectile(projectile),
            position: clonePosition(projectile.position),
            targetIds: [],
            objectId: null,
            kind: "expired",
          });
          break;
        }
        projectile.position = next;
        const collision = context.collision(
          projectile,
          collisionPositions(projectile)
        );
        const targetIds = (collision.targetIds ?? []).filter(
          id => !projectile.hitTargets.includes(id)
        );
        const objectId =
          collision.objectId &&
          !projectile.hitObjects.includes(collision.objectId)
            ? collision.objectId
            : null;
        if (targetIds.length > 0) projectile.hitTargets.push(...targetIds);
        if (objectId) projectile.hitObjects.push(objectId);
        if (targetIds.length > 0 || objectId) {
          const blocked = Boolean(
            objectId && projectile.stopOnObject && (collision.stop ?? true)
          );
          const stopsAtEnemy =
            targetIds.length > 0 &&
            projectile.motion !== "piercing" &&
            projectile.motion !== "wave";
          resolutions.push({
            projectile: cloneProjectile(projectile),
            position: clonePosition(projectile.position),
            targetIds,
            objectId,
            kind: blocked ? "blocked" : "hit",
          });
          if (blocked || stopsAtEnemy) {
            this.projectiles.delete(projectile.id);
            break;
          }
        }
      }
    }
    return resolutions;
  }

  private resolveCollision(
    projectile: ProjectileState,
    context: ProjectileCollisionContext
  ): ProjectileResolution {
    const collision = context.collision(
      projectile,
      collisionPositions(projectile)
    );
    const targetIds = (collision.targetIds ?? []).filter(
      id => !projectile.hitTargets.includes(id)
    );
    const objectId =
      collision.objectId && !projectile.hitObjects.includes(collision.objectId)
        ? collision.objectId
        : null;
    if (targetIds.length > 0) projectile.hitTargets.push(...targetIds);
    if (objectId) projectile.hitObjects.push(objectId);
    return {
      projectile: cloneProjectile(projectile),
      position: clonePosition(projectile.position),
      targetIds,
      objectId,
      kind:
        objectId && projectile.stopOnObject && (collision.stop ?? true)
          ? "blocked"
          : "hit",
    };
  }
}

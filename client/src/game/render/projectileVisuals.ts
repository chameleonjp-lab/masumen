import type { ProjectileState } from "../types";

export interface ProjectileRenderPosition {
  col: number;
  row: number;
  height: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Converts the authoritative projectile state into a display position.
 * The renderer may smooth this result, but it must never invent a target or speed.
 */
export function projectileRenderPosition(
  projectile: ProjectileState,
  gameTimeMs: number,
): ProjectileRenderPosition {
  if (gameTimeMs < projectile.activeAt)
    return { col: projectile.origin.col, row: projectile.origin.row, height: 0.74 };

  if (projectile.motion === "thrown") {
    const target = projectile.target ?? projectile.origin;
    const progress = projectile.flightMs <= 0
      ? 1
      : clamp01((gameTimeMs - projectile.activeAt) / projectile.flightMs);
    return {
      col: projectile.origin.col + (target.col - projectile.origin.col) * progress,
      row: projectile.origin.row + (target.row - projectile.origin.row) * progress,
      height: 0.74 + Math.sin(progress * Math.PI) * 0.44,
    };
  }

  const progress = clamp01(projectile.travelProgress);
  return {
    col: projectile.position.col + projectile.direction.col * progress,
    row: projectile.position.row + projectile.direction.row * progress,
    height: projectile.motion === "orbit" ? 0.86 : 0.74,
  };
}

export interface ProjectileRenderScale {
  width: number;
  height: number;
}

export function projectileRenderScale(projectile: ProjectileState): ProjectileRenderScale {
  const radius = Math.max(0, projectile.splashRadius);
  return {
    width: projectile.rowSpan ? 1 : projectile.charged ? 1.5 : 1,
    height: 1 + radius * 0.28,
  };
}

export function projectileRenderSpan(projectile: ProjectileState): number {
  return projectile.rowSpan ? 25 : projectile.motion === "wave" ? 2.4 : 1;
}

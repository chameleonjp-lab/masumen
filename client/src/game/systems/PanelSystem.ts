import type {
  GridPosition,
  PanelOwner,
  PanelState,
  PanelTerrain,
} from "../types";

export const BOARD_COLUMNS = 6;
export const BOARD_ROWS = 3;
export const PLAYER_FRONT_COLUMN = 2;
export const ENEMY_FRONT_COLUMN = 3;
export const DEFAULT_HOLE_DURATION_MS = 8000;

export interface MovementBlocker {
  (position: GridPosition): boolean;
}

export interface PanelUpdateResult {
  restoredTerritoryColumns: number[];
  expiredTerrains: GridPosition[];
}

const terrainValues: PanelTerrain[] = [
  "normal",
  "cracked",
  "hole",
  "grass",
  "ice",
  "lava",
  "poison",
  "holy",
];

function key(position: GridPosition): string {
  return `${position.col}:${position.row}`;
}

function clonePosition(position: GridPosition): GridPosition {
  return { col: position.col, row: position.row };
}

function clonePanel(panel: PanelState): PanelState {
  return { ...panel, col: panel.col, row: panel.row };
}

function defaultOwner(col: number): PanelOwner {
  if (col <= PLAYER_FRONT_COLUMN) return "player";
  return "enemy";
}

function isTerrain(value: string): value is PanelTerrain {
  return terrainValues.includes(value as PanelTerrain);
}

export class PanelSystem {
  private panels: PanelState[] = [];
  private readonly terrainRestore = new Map<string, PanelTerrain>();
  private readonly terrainExpires = new Map<string, number>();
  private readonly territoryExpires = new Map<number, number>();

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.panels = Array.from({ length: BOARD_COLUMNS }, (_, col) =>
      Array.from({ length: BOARD_ROWS }, (_, row) => ({
        col,
        row,
        owner: defaultOwner(col),
        terrain: "normal" as const,
        occupantId: null,
        objectId: null,
        expiresAt: null,
      }))
    ).flat();
    this.terrainRestore.clear();
    this.terrainExpires.clear();
    this.territoryExpires.clear();
  }

  public snapshot(): PanelState[] {
    return this.panels.map(clonePanel);
  }

  public get(position: GridPosition): PanelState | undefined {
    const panel = this.panelAt(position);
    return panel ? clonePanel(panel) : undefined;
  }

  public isInside(position: GridPosition): boolean {
    return (
      position.col >= 0 &&
      position.col < BOARD_COLUMNS &&
      position.row >= 0 &&
      position.row < BOARD_ROWS
    );
  }

  public canEnter(
    position: GridPosition,
    side: "player" | "enemy",
    blocker: MovementBlocker = () => false,
    flying = false
  ): boolean {
    const panel = this.panelAt(position);
    if (!panel) return false;
    if (!flying && panel.terrain === "hole") return false;
    if (panel.owner !== side) return false;
    if (panel.occupantId !== null || blocker(position)) return false;
    return true;
  }

  public resolveMovement(
    start: GridPosition,
    direction: GridPosition,
    side: "player" | "enemy",
    blocker: MovementBlocker = () => false,
    flying = false
  ): GridPosition | null {
    if (Math.abs(direction.col) + Math.abs(direction.row) !== 1) return null;
    const first = {
      col: start.col + direction.col,
      row: start.row + direction.row,
    };
    if (!this.canEnter(first, side, blocker, flying)) return null;

    let current = first;
    while (this.panelAt(current)?.terrain === "ice") {
      const next = {
        col: current.col + direction.col,
        row: current.row + direction.row,
      };
      if (!this.canEnter(next, side, blocker, flying)) break;
      current = next;
    }
    return clonePosition(current);
  }

  public findNearestSafePosition(
    start: GridPosition,
    side: "player" | "enemy",
    blocker: MovementBlocker = () => false
  ): GridPosition | null {
    return (
      this.panels
        .filter(panel => this.canEnter(panel, side, blocker))
        .sort((a, b) => {
          const rowDistance =
            Math.abs(a.row - start.row) - Math.abs(b.row - start.row);
          if (rowDistance !== 0) return rowDistance;
          const colDistance =
            Math.abs(a.col - start.col) - Math.abs(b.col - start.col);
          if (colDistance !== 0) return colDistance;
          return a.col - b.col;
        })
        .map(clonePosition)[0] ?? null
    );
  }

  public occupy(position: GridPosition, occupantId: string): boolean {
    const panel = this.panelAt(position);
    if (!panel || panel.occupantId !== null || panel.objectId !== null)
      return false;
    panel.occupantId = occupantId;
    return true;
  }

  public vacate(position: GridPosition, nowMs: number): void {
    const panel = this.panelAt(position);
    if (!panel) return;
    panel.occupantId = null;
    if (panel.terrain === "cracked") this.makeHole(panel, nowMs);
    this.refreshExpiry(panel);
  }

  public clearOccupants(): void {
    this.panels.forEach(panel => {
      panel.occupantId = null;
    });
  }

  public setTerrain(
    position: GridPosition,
    terrain: PanelTerrain,
    nowMs = 0,
    durationMs: number | null = null
  ): boolean {
    const panel = this.panelAt(position);
    if (!panel || !isTerrain(terrain)) return false;
    if (terrain === "normal") {
      this.terrainRestore.delete(key(position));
      this.terrainExpires.delete(key(position));
      panel.terrain = "normal";
      this.refreshExpiry(panel);
      return true;
    }
    if (durationMs !== null && durationMs > 0) {
      const panelKey = key(position);
      if (!this.terrainRestore.has(panelKey))
        this.terrainRestore.set(panelKey, panel.terrain);
      this.terrainExpires.set(panelKey, nowMs + durationMs);
    } else {
      this.terrainRestore.delete(key(position));
      this.terrainExpires.delete(key(position));
    }
    panel.terrain = terrain;
    this.refreshExpiry(panel);
    return true;
  }

  public crack(position: GridPosition): boolean {
    const panel = this.panelAt(position);
    if (!panel || panel.terrain === "hole") return false;
    this.terrainRestore.delete(key(position));
    this.terrainExpires.delete(key(position));
    panel.terrain = "cracked";
    this.refreshExpiry(panel);
    return true;
  }

  public expandEnemyFront(nowMs: number, durationMs: number): GridPosition[] {
    const changed: GridPosition[] = [];
    for (const panel of this.panels.filter(
      candidate => candidate.col === ENEMY_FRONT_COLUMN
    )) {
      panel.owner = "player";
      this.territoryExpires.set(panel.col, nowMs + durationMs);
      this.refreshExpiry(panel);
      changed.push(clonePosition(panel));
    }
    return changed;
  }

  public setOwner(
    position: GridPosition,
    owner: PanelOwner,
    nowMs = 0,
    durationMs: number | null = null
  ): boolean {
    const panel = this.panelAt(position);
    if (!panel) return false;
    panel.owner = owner;
    if (durationMs !== null && durationMs > 0)
      this.territoryExpires.set(panel.col, nowMs + durationMs);
    else this.territoryExpires.delete(panel.col);
    this.refreshExpiry(panel);
    return true;
  }

  public attachObject(position: GridPosition, objectId: string): boolean {
    const panel = this.panelAt(position);
    if (!panel || panel.objectId !== null || panel.occupantId !== null)
      return false;
    panel.objectId = objectId;
    return true;
  }

  public detachObject(position: GridPosition, objectId?: string): boolean {
    const panel = this.panelAt(position);
    if (
      !panel ||
      panel.objectId === null ||
      (objectId !== undefined && panel.objectId !== objectId)
    )
      return false;
    panel.objectId = null;
    return true;
  }

  public update(nowMs: number): PanelUpdateResult {
    const result: PanelUpdateResult = {
      restoredTerritoryColumns: [],
      expiredTerrains: [],
    };
    for (const [panelKey, expiresAt] of Array.from(
      this.terrainExpires.entries()
    )) {
      if (nowMs < expiresAt) continue;
      const [col, row] = panelKey.split(":").map(Number);
      const panel = this.panelAt({ col, row });
      if (!panel) continue;
      const restore = this.terrainRestore.get(panelKey) ?? "normal";
      panel.terrain = restore;
      this.terrainRestore.delete(panelKey);
      this.terrainExpires.delete(panelKey);
      result.expiredTerrains.push({ col, row });
      this.refreshExpiry(panel);
    }
    for (const [col, expiresAt] of Array.from(
      this.territoryExpires.entries()
    )) {
      if (nowMs < expiresAt) continue;
      for (const panel of this.panels.filter(
        candidate => candidate.col === col
      )) {
        panel.owner = defaultOwner(panel.col);
        this.refreshExpiry(panel);
      }
      this.territoryExpires.delete(col);
      result.restoredTerritoryColumns.push(col);
    }
    return result;
  }

  private panelAt(position: GridPosition): PanelState | undefined {
    if (!this.isInside(position)) return undefined;
    return this.panels[position.col * BOARD_ROWS + position.row];
  }

  private makeHole(panel: PanelState, nowMs: number): void {
    const panelKey = key(panel);
    this.terrainRestore.set(panelKey, "normal");
    this.terrainExpires.set(panelKey, nowMs + DEFAULT_HOLE_DURATION_MS);
    panel.terrain = "hole";
  }

  private refreshExpiry(panel: PanelState): void {
    const terrainExpiresAt = this.terrainExpires.get(key(panel));
    const territoryExpiresAt = this.territoryExpires.get(panel.col);
    panel.expiresAt =
      terrainExpiresAt === undefined
        ? (territoryExpiresAt ?? null)
        : territoryExpiresAt === undefined
          ? terrainExpiresAt
          : Math.min(terrainExpiresAt, territoryExpiresAt);
  }
}

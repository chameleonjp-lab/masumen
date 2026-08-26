import type {
  FieldObject,
  FieldObjectKind,
  GridPosition,
  ObjectTrigger,
} from "../types";

export const MAX_OBJECTS_PER_SIDE = 6;

export interface ObjectPlacement {
  id: string;
  owner: "player" | "enemy";
  kind: FieldObjectKind;
  panel: GridPosition;
  hp: number;
  expiresAt?: number | null;
  collision?: "solid" | "passable";
  trigger?: ObjectTrigger;
  effectId?: FieldObject["effectId"];
  damage?: number;
  sourceCardId?: string;
  sourceId?: string;
  hidden?: boolean;
  pushable?: boolean;
}

function key(position: GridPosition): string {
  return `${position.col}:${position.row}`;
}

function cloneObject(object: FieldObject): FieldObject {
  return { ...object, panel: { ...object.panel } };
}

export class ObjectSystem {
  private readonly objects = new Map<string, FieldObject>();

  public reset(): void {
    this.objects.clear();
  }

  public snapshot(): FieldObject[] {
    return Array.from(this.objects.values(), cloneObject);
  }

  public get(id: string): FieldObject | undefined {
    const object = this.objects.get(id);
    return object ? cloneObject(object) : undefined;
  }

  public getAt(panel: GridPosition): FieldObject | undefined {
    const object = Array.from(this.objects.values()).find(
      candidate => key(candidate.panel) === key(panel)
    );
    return object ? cloneObject(object) : undefined;
  }

  public isSolidAt(panel: GridPosition): boolean {
    return Array.from(this.objects.values()).some(
      object => object.collision === "solid" && key(object.panel) === key(panel)
    );
  }

  public place(placement: ObjectPlacement): {
    object: FieldObject | null;
    removed: FieldObject | null;
  } {
    const existing = this.getAt(placement.panel);
    if (existing) return { object: null, removed: null };
    const object: FieldObject = {
      id: placement.id,
      owner: placement.owner,
      kind: placement.kind,
      panel: { ...placement.panel },
      hp: Math.max(1, placement.hp),
      expiresAt: placement.expiresAt ?? null,
      collision: placement.collision ?? "solid",
      trigger: placement.trigger ?? "none",
      effectId: placement.effectId,
      damage: placement.damage,
      sourceCardId: placement.sourceCardId,
      sourceId: placement.sourceId,
      hidden: placement.hidden ?? false,
      pushable: placement.pushable ?? false,
    };
    const owned = Array.from(this.objects.values()).filter(
      candidate => candidate.owner === object.owner
    );
    let removed: FieldObject | null = null;
    if (owned.length >= MAX_OBJECTS_PER_SIDE) {
      removed = cloneObject(owned[0]);
      this.objects.delete(owned[0].id);
    }
    this.objects.set(object.id, object);
    return { object: cloneObject(object), removed };
  }


  public move(id: string, panel: GridPosition): boolean {
    const object = this.objects.get(id);
    if (!object) return false;
    const occupied = Array.from(this.objects.values()).some(
      candidate => candidate.id !== id && key(candidate.panel) === key(panel)
    );
    if (occupied) return false;
    object.panel = { ...panel };
    return true;
  }

  public remove(id: string): FieldObject | null {
    const object = this.objects.get(id);
    if (!object) return null;
    this.objects.delete(id);
    return cloneObject(object);
  }

  public removeAt(panel: GridPosition): FieldObject | null {
    const object = Array.from(this.objects.values()).find(
      candidate => key(candidate.panel) === key(panel)
    );
    return object ? this.remove(object.id) : null;
  }

  public damage(
    id: string,
    amount: number
  ): { object: FieldObject | null; destroyed: boolean } {
    const object = this.objects.get(id);
    if (!object) return { object: null, destroyed: false };
    object.hp = Math.max(0, object.hp - Math.max(0, amount));
    if (object.hp === 0) {
      this.objects.delete(id);
      return { object: cloneObject(object), destroyed: true };
    }
    return { object: cloneObject(object), destroyed: false };
  }

  public update(nowMs: number): FieldObject[] {
    const expired: FieldObject[] = [];
    for (const object of Array.from(this.objects.values())) {
      if (object.expiresAt !== null && nowMs >= object.expiresAt) {
        expired.push(cloneObject(object));
        this.objects.delete(object.id);
      }
    }
    return expired;
  }
}

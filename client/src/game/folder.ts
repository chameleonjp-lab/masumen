import { CARD_CATALOG } from "./deck";
import { Random } from "./core/Random";
import { getAllowedCodes, getFolderCardClass } from "./data/cardCodes";
import type {
  Card,
  ConnectionCode,
  FolderCardClass,
} from "./types";

export const FOLDER_SIZE = 30;
export const HAND_SIZE = 5;
export const FOLDER_STORAGE_KEY = "grid-signal-arena-save-v1";

export interface FolderEntry {
  instanceId: string;
  cardId: string;
  code: ConnectionCode;
}

export interface SavedFolder {
  id: string;
  name: string;
  cards: FolderEntry[];
}

export interface GameSettings {
  soundEnabled: boolean;
  soundVolume: number;
  vibrationEnabled: boolean;
}

export interface LocalRecords {
  highScore: number;
  bestWave: number;
}

export interface SaveDataV1 {
  version: 1;
  folders: SavedFolder[];
  activeFolderId: string;
  settings: GameSettings;
  records: LocalRecords;
  tutorialCompleted: boolean;
}

export interface FolderValidationResult {
  valid: boolean;
  errors: string[];
}

export interface MaterializedFolderCard extends Card {
  instanceId: string;
  selectedCode: ConnectionCode;
  allowedCodes: ConnectionCode[];
  folderClass: FolderCardClass;
}

const STANDARD_FOLDER_CARD_IDS = [
  "rapid",
  "rapid",
  "lance",
  "seeker",
  "seeker",
  "triplet",
  "wide",
  "column",
  "cross",
  "fan",
  "ember",
  "fireline",
  "frost",
  "icewall",
  "volt",
  "root",
  "web",
  "slash",
  "slash",
  "sweep",
  "dashslash",
  "gridcut",
  "timer",
  "watchmine",
  "turret",
  "stake",
  "breakpillar",
  "block",
  "sanctum",
  "prism",
] as const;

function cardById(cardId: string): Card | undefined {
  return CARD_CATALOG.find(card => card.id === cardId);
}

function codeForEntry(card: Card, requested: ConnectionCode): ConnectionCode {
  const allowed = getAllowedCodes(card);
  return allowed.includes(requested) ? requested : (allowed[0] ?? "*");
}

function createEntries(cardIds: readonly string[], prefix: string): FolderEntry[] {
  return cardIds.flatMap((cardId, index) => {
    const card = cardById(cardId);
    if (!card) return [];
    return [
      {
        instanceId: `${prefix}-${index + 1}`,
        cardId,
        code: getAllowedCodes(card)[0] ?? "*",
      },
    ];
  });
}

export function createStandardFolder(id = "standard"): SavedFolder {
  return {
    id,
    name: id === "standard" ? "標準フォルダ" : "標準フォルダの複製",
    cards: createEntries(STANDARD_FOLDER_CARD_IDS, id),
  };
}

export function cloneFolder(folder: SavedFolder, id: string, name: string): SavedFolder {
  return {
    id,
    name,
    cards: folder.cards.map((entry, index) => ({
      ...entry,
      instanceId: `${id}-${index + 1}`,
    })),
  };
}

function numericCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function validateFolder(folder: SavedFolder): FolderValidationResult {
  const errors: string[] = [];
  if (!folder || typeof folder !== "object")
    return { valid: false, errors: ["フォルダの形式が壊れています"] };
  if (!Array.isArray(folder.cards)) {
    return { valid: false, errors: ["カード一覧がありません"] };
  }
  if (folder.cards.length !== FOLDER_SIZE)
    errors.push(`カードは${FOLDER_SIZE}枚必要です（現在${folder.cards.length}枚）`);

  const instanceIds = new Set<string>();
  const nameCounts = new Map<string, number>();
  let upperCount = 0;
  let trumpCount = 0;
  let overloadCount = 0;

  folder.cards.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      errors.push(`${index + 1}枚目の定義が壊れています`);
      return;
    }
    if (!entry.instanceId || instanceIds.has(entry.instanceId))
      errors.push(`${index + 1}枚目の識別子が重複しています`);
    instanceIds.add(entry.instanceId);
    const card = cardById(entry.cardId);
    if (!card) {
      errors.push(`${index + 1}枚目のカードが見つかりません`);
      return;
    }
    const allowedCodes = getAllowedCodes(card);
    if (!allowedCodes.includes(entry.code))
      errors.push(`${card.name}の接続コード${entry.code}は選べません`);

    const cardClass = getFolderCardClass(card);
    const nextNameCount = (nameCounts.get(card.name) ?? 0) + 1;
    nameCounts.set(card.name, nextNameCount);
    if (cardClass === "standard" && nextNameCount > 4)
      errors.push(`${card.name}は標準カードの上限4枚を超えています`);
    if (cardClass === "upper") upperCount += 1;
    if (cardClass === "trump") trumpCount += 1;
    if (cardClass === "overload") overloadCount += 1;
    if (cardClass === "upper" && nextNameCount > 1)
      errors.push(`${card.name}は上位カードのため1枚までです`);
  });

  if (upperCount > 5)
    errors.push(`上位カードは合計5枚までです（現在${upperCount}枚）`);
  if (trumpCount > 1)
    errors.push(`切札カードは1枚までです（現在${trumpCount}枚）`);
  if (overloadCount > 0) errors.push("過負荷カードはフォルダへ入れられません");

  return { valid: errors.length === 0, errors: Array.from(new Set(errors)) };
}

export function materializeFolderEntry(entry: FolderEntry): MaterializedFolderCard | undefined {
  const card = cardById(entry.cardId);
  if (!card) return undefined;
  const allowedCodes = getAllowedCodes(card);
  return {
    ...card,
    instanceId: entry.instanceId,
    selectedCode: codeForEntry(card, entry.code),
    allowedCodes,
    folderClass: getFolderCardClass(card),
  };
}

export function defaultSettings(): GameSettings {
  return { soundEnabled: true, soundVolume: 70, vibrationEnabled: true };
}

export function defaultSaveData(): SaveDataV1 {
  const standard = createStandardFolder();
  return {
    version: 1,
    folders: [
      standard,
      cloneFolder(standard, "custom-1", "ユーザー編集フォルダ1"),
      cloneFolder(standard, "custom-2", "ユーザー編集フォルダ2"),
    ],
    activeFolderId: standard.id,
    settings: defaultSettings(),
    records: { highScore: 0, bestWave: 0 },
    tutorialCompleted: false,
  };
}

function parseFolder(value: unknown): SavedFolder | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<SavedFolder>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string")
    return undefined;
  if (!Array.isArray(candidate.cards)) return undefined;
  const cards = candidate.cards.flatMap(entry => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<FolderEntry>;
    if (
      typeof item.instanceId !== "string" ||
      typeof item.cardId !== "string" ||
      typeof item.code !== "string"
    )
      return [];
    return [
      {
        instanceId: item.instanceId,
        cardId: item.cardId,
        code: item.code as ConnectionCode,
      },
    ];
  });
  const folder = { id: candidate.id, name: candidate.name, cards };
  return validateFolder(folder).valid ? folder : undefined;
}

export function loadSaveData(): SaveDataV1 {
  const fallback = defaultSaveData();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(FOLDER_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SaveDataV1>;
    if (parsed.version !== 1 || !Array.isArray(parsed.folders)) return fallback;
    const folders = parsed.folders.flatMap(folder => {
      const parsedFolder = parseFolder(folder);
      return parsedFolder ? [parsedFolder] : [];
    });
    if (folders.length !== 3) return fallback;
    const activeFolderId =
      typeof parsed.activeFolderId === "string" &&
      folders.some(folder => folder.id === parsed.activeFolderId)
        ? parsed.activeFolderId
        : fallback.activeFolderId;
    const settings = parsed.settings as Partial<GameSettings> | undefined;
    return {
      version: 1,
      folders,
      activeFolderId,
      settings: {
        soundEnabled: settings?.soundEnabled !== false,
        soundVolume: Math.max(0, Math.min(100, numericCount(settings?.soundVolume, 70))),
        vibrationEnabled: settings?.vibrationEnabled !== false,
      },
      records: {
        highScore: Math.max(0, numericCount(parsed.records?.highScore, 0)),
        bestWave: Math.max(0, numericCount(parsed.records?.bestWave, 0)),
      },
      tutorialCompleted: parsed.tutorialCompleted === true,
    };
  } catch {
    return fallback;
  }
}

export function saveSaveData(data: SaveDataV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be unavailable in private browsing; the battle remains playable.
  }
}

export function activeFolder(data: SaveDataV1): SavedFolder {
  return (
    data.folders.find(folder => folder.id === data.activeFolderId) ??
    data.folders[0] ??
    createStandardFolder()
  );
}

export class BattleDeck {
  private readonly folder: SavedFolder;
  private random: Random;
  private remaining: FolderEntry[] = [];
  private offered: FolderEntry[] = [];
  private used: FolderEntry[] = [];

  public constructor(folder: SavedFolder, seed: number) {
    if (!validateFolder(folder).valid)
      throw new Error("不正なフォルダは戦闘デッキにできません");
    this.folder = {
      ...folder,
      cards: folder.cards.map(entry => ({ ...entry })),
    };
    this.random = new Random(seed);
    this.resetWave(seed);
  }

  public resetWave(seed: number): void {
    this.random = new Random(seed);
    this.remaining = this.random.shuffle(this.folder.cards);
    this.offered = [];
    this.used = [];
  }

  public drawHand(): MaterializedFolderCard[] {
    this.returnOffered();
    this.offered = this.remaining.splice(0, Math.min(HAND_SIZE, this.remaining.length));
    return this.offered.flatMap(entry => {
      const card = materializeFolderEntry(entry);
      return card ? [card] : [];
    });
  }

  public commitSelection(indices: readonly number[]): MaterializedFolderCard[] {
    const selected = new Set(indices);
    const selectedEntries = this.offered.filter((_entry, index) => selected.has(index));
    const returnedEntries = this.offered.filter((_entry, index) => !selected.has(index));
    this.used.push(...selectedEntries);
    this.remaining.push(...returnedEntries);
    this.offered = [];
    return selectedEntries.flatMap(entry => {
      const card = materializeFolderEntry(entry);
      return card ? [card] : [];
    });
  }

  public returnOffered(): void {
    if (this.offered.length > 0) this.remaining.push(...this.offered);
    this.offered = [];
  }

  public counts(): { remaining: number; offered: number; used: number } {
    return {
      remaining: this.remaining.length,
      offered: this.offered.length,
      used: this.used.length,
    };
  }
}

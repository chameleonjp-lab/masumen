import {
  CLIENT_VERSION,
  cleanPlayerName,
  createRequestId,
  finishMasumenPlay,
  startMasumenPlay,
} from "./platform";
import type { BattleSnapshot } from "./types";
import { rankForScore, calculateScoreTotal } from "./systems/ScoreSystem";

export interface CompletedResult {
  score: number;
  resultType: "clear" | "game_over";
  reachedWave: number;
}
interface PlayApi {
  start: typeof startMasumenPlay;
  finish: typeof finishMasumenPlay;
}
export interface PendingPlay {
  startId: string;
  playerName: string;
  clientVersion: string;
  playId?: string;
  result: CompletedResult;
  presentation?: BattleSnapshot;
  rejected?: boolean;
  persisted?: boolean;
  sent?: boolean;
}
const PREFIX = "masumen.pending-play.v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validResult = (r: CompletedResult) =>
  r &&
  Number.isSafeInteger(r.score) &&
  r.score >= 0 &&
  Number.isSafeInteger(r.reachedWave) &&
  r.reachedWave >= 1 &&
  r.reachedWave <= 4 &&
  ["clear", "game_over"].includes(r.resultType) &&
  (r.resultType !== "clear" || r.reachedWave === 4);
function validEntry(v: PendingPlay): boolean {
  return Boolean(
    v &&
      UUID.test(v.startId) &&
      typeof v.playerName === "string" &&
      v.playerName &&
      cleanPlayerName(v.playerName) === v.playerName &&
      typeof v.clientVersion === "string" &&
      v.clientVersion.length > 0 &&
      v.clientVersion.length <= 80 &&
      (!v.playId || UUID.test(v.playId)) &&
      (v.sent === undefined || typeof v.sent === "boolean") &&
      (v.rejected === undefined || typeof v.rejected === "boolean") &&
      validResult(v.result)
  );
}
function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The existing Masumen start/finish protocol counts each start once. Never fall back to a different write after a lost acknowledgement. */
export function createPlayQueue(
  options: {
    api?: PlayApi;
    storage?: Storage;
    uuid?: () => string;
    clientVersion?: string;
  } = {}
) {
  const api = options.api ?? {
    start: startMasumenPlay,
    finish: finishMasumenPlay,
  };
  const storage = options.storage;
  const memory = new Map<string, PendingPlay>();
  const leases = new Map<string, string | null>();
  const reservedIds = new Set<string>();
  const candidates = new Map<string, string>();
  const sessions = new Map<string, ReturnType<typeof session>>();
  function persist(entry: PendingPlay): boolean {
    memory.set(entry.startId, entry);
    entry.persisted = false;
    if (!storage) return false;
    const key = PREFIX + entry.startId;
    try {
      const current = storage.getItem(key);
      const expected = leases.get(entry.startId) ?? null;
      // Never replace another tab's result, an accepted receipt, or malformed raw data.
      if (current !== expected) {
        // A failed readback is not proof that setItem failed. Confirm only our exact candidate.
        if (current !== candidates.get(entry.startId)) return false;
        leases.set(entry.startId, current);
      }
      const { persisted: _persisted, ...saved } = entry;
      const raw = JSON.stringify(saved);
      candidates.set(entry.startId, raw);
      storage.setItem(key, raw);
      if (storage.getItem(key) !== raw) return false;
      leases.set(entry.startId, raw);
      candidates.delete(entry.startId);
      entry.persisted = true;
    } catch {
      /* Keep this exact result in memory until storage recovers. */
    }
    return entry.persisted;
  }
  function pending(): PendingPlay[] {
    try {
      const keys = Array.from({ length: storage?.length ?? 0 }, (_, i) =>
        storage!.key(i)
      );
      for (const key of keys) {
        if (!key?.startsWith(PREFIX)) continue;
        try {
          const raw = storage!.getItem(key);
          const entry = JSON.parse(raw ?? "null") as PendingPlay;
          if (
            validEntry(entry) &&
            key === PREFIX + entry.startId &&
            !memory.has(entry.startId)
          ) {
            leases.set(entry.startId, raw);
            memory.set(entry.startId, { ...entry, persisted: true });
          }
        } catch {
          /* Preserve corrupt data, do not publish it. */
        }
      }
    } catch {
      /* Storage access can be denied. */
    }
    return Array.from(memory.values())
      .filter(entry => !entry.sent || !entry.persisted)
      .map(entry => structuredClone(entry));
  }
  function session(
    playerName: string,
    startId: string,
    clientVersion: string,
    restored?: PendingPlay,
    blocked = false
  ) {
    let playId = restored?.playId;
    let entry = restored;
    let acknowledged = false;
    let submission: Promise<void> | null = null;
    let starting: Promise<string> | null = null;
    let running: Promise<void> | null = null;
    function start(): Promise<string> {
      if (playId) return Promise.resolve(playId);
      if (!starting) {
        starting = api.start(playerName, startId, clientVersion).then(id => {
          playId = id;
          if (entry) {
            entry.playId = id;
            persist(entry);
          }
          return id;
        });
        void starting.catch(() => {});
      }
      return starting;
    }
    // Preserve the existing start event; it never gates gameplay.
    if (playerName && !restored && !blocked) void start();
    function send(): Promise<void> {
      if (running) return running;
      if (!playerName || acknowledged) return Promise.resolve();
      if (blocked)
        return Promise.reject(new Error("記録を受け付けられませんでした"));
      if (!entry) return Promise.reject(new Error("確定結果がありません"));
      if (entry.rejected)
        return Promise.reject(new Error("記録を受け付けられませんでした"));
      if (!persist(entry))
        return Promise.reject(new Error("結果を保存できませんでした"));
      if (entry.sent) {
        acknowledged = true;
        memory.delete(startId);
        return Promise.resolve();
      }
      running = start()
        .then(id => {
          if (!persist(entry!)) throw new Error("結果を保存できませんでした");
          return api.finish({
            ...entry!.result,
            playId: id,
            playerName,
            clientVersion,
          });
        })
        .then(() => {
          // Acknowledgement belongs only to the exact durable payload sent above.
          if (storage!.getItem(PREFIX + startId) !== leases.get(startId))
            throw new Error("保存内容が変わりました");
          entry!.sent = true;
          if (!persist(entry!)) {
            throw new Error("結果を保存できませんでした");
          }
          acknowledged = true;
          memory.delete(startId);
        })
        .catch(error => {
          if (entry) {
            entry.rejected = Boolean(error?.permanent);
            persist(entry);
          }
          throw error;
        })
        .finally(() => {
          running = null;
        });
      return running;
    }
    return {
      playerName,
      startId,
      submit(
        result: CompletedResult,
        presentation?: BattleSnapshot
      ): Promise<void> {
        if (!playerName) return Promise.resolve();
        if (blocked)
          return Promise.reject(new Error("記録を受け付けられませんでした"));
        if (!entry) {
          if (!validResult(result))
            return Promise.reject(new Error("確定結果が不正です"));
          entry = {
            startId,
            playerName,
            clientVersion,
            playId,
            result: { ...result },
            presentation: presentation
              ? structuredClone(presentation)
              : undefined,
          };
          persist(entry);
        }
        if (!submission) submission = send();
        return submission;
      },
      retry(): Promise<void> {
        // Only a completed prior attempt can be retried, never a concurrent one.
        if (running) return running;
        if (!submission) {
          starting = null;
          submission = send();
          return submission;
        }
        return submission.catch(() => {
          starting = null;
          submission = send();
          return submission;
        });
      },
      hasResult: () => Boolean(entry),
      isPersistent: () => !blocked && entry?.persisted !== false,
      status: () =>
        acknowledged
          ? ("sent" as const)
          : blocked || entry?.rejected
            ? ("rejected" as const)
            : ("pending" as const),
    };
  }
  return {
    pending,
    create(name: string) {
      // Abandoned unfinished sessions do not hold memory across endless retries.
      // Their already-issued server starts retain the existing provisional-retire semantics.
      sessions.forEach((value, id) => {
        if (!value.hasResult()) sessions.delete(id);
      });
      const playerName = cleanPlayerName(name);
      let id = "";
      try {
        id = playerName ? (options.uuid ?? createRequestId)() : "";
      } catch {
        /* No public record without a stable ID. */
      }
      let blocked =
        Boolean(playerName) &&
        (!UUID.test(id) ||
          reservedIds.has(id) ||
          sessions.has(id) ||
          memory.has(id));
      try {
        if (
          id &&
          storage?.getItem(PREFIX + id) !== null &&
          storage?.getItem(PREFIX + id) !== undefined
        )
          blocked = true;
      } catch {
        /* Start event can proceed; finish awaits durable storage. */
      }
      const value = session(
        playerName,
        id,
        options.clientVersion ?? CLIENT_VERSION,
        undefined,
        blocked
      );
      if (id && !blocked) {
        reservedIds.add(id);
        sessions.set(id, value);
      }
      return value;
    },
    restore(id: string) {
      if (sessions.has(id)) return sessions.get(id)!;
      const entry = pending().find(item => item.startId === id);
      if (!entry) return null;
      const value = session(
        entry.playerName,
        entry.startId,
        entry.clientVersion,
        entry
      );
      sessions.set(id, value);
      return value;
    },
  };
}
/** Restore display fields only; stored gameplay objects are never trusted or resumed. Raw storage remains untouched. */
export function restoreResultSnapshot(
  entry: PendingPlay,
  initial: BattleSnapshot
): BattleSnapshot {
  const result = entry.result;
  const restored: BattleSnapshot = {
    ...initial,
    mode: "result",
    score: result.score,
    wave: result.reachedWave,
    reachedWave: result.reachedWave,
    rank: result.resultType === "clear" ? rankForScore(result.score) : "R",
    outcome: result.resultType === "clear" ? "victory" : "defeat",
    usedChainTechniques: [],
  };
  const saved = entry.presentation;
  if (
    !saved ||
    typeof saved !== "object" ||
    saved.mode !== "result" ||
    saved.score !== result.score ||
    ((saved.reachedWave ?? saved.wave) !== undefined &&
      (saved.reachedWave ?? saved.wave) !== result.reachedWave)
  )
    return restored;
  const numbers = [
    "elapsed",
    "counters",
    "highScore",
    "bestWave",
    "totalDamageTaken",
    "simultaneousDefeats",
    "cardsUsed",
    "overloadCardsUsed",
  ] as const;
  for (const key of numbers) {
    const value = saved[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0)
      restored[key] = value;
  }
  if (
    typeof saved.personalBestDelta === "number" &&
    Number.isFinite(saved.personalBestDelta)
  )
    restored.personalBestDelta = saved.personalBestDelta;
  if (result.resultType === "game_over" && saved.outcome === "draw")
    restored.outcome = "draw";
  if (
    Array.isArray(saved.usedChainTechniques) &&
    saved.usedChainTechniques.every(id => typeof id === "string")
  )
    restored.usedChainTechniques = [...saved.usedChainTechniques];
  const breakdown = saved.scoreBreakdown;
  const keys = [
    "enemyDefeatPoints",
    "waveClearPoints",
    "timePoints",
    "counterPoints",
    "simultaneousPoints",
    "noDamagePoints",
    "damagePenalty",
    "overloadPenalty",
    "total",
  ] as const;
  if (
    breakdown &&
    typeof breakdown === "object" &&
    keys.every(
      key =>
        typeof breakdown[key] === "number" &&
        Number.isFinite(breakdown[key]) &&
        breakdown[key] >= 0
    ) &&
    breakdown.total === result.score &&
    calculateScoreTotal(breakdown) === result.score
  ) {
    restored.scoreBreakdown = Object.fromEntries(
      keys.map(key => [key, breakdown[key]])
    ) as unknown as BattleSnapshot["scoreBreakdown"];
  }
  return restored;
}
let defaultQueue: ReturnType<typeof createPlayQueue> | undefined;
function queue() {
  return (defaultQueue ??= createPlayQueue({ storage: browserStorage() }));
}
export const createPlaySession = (name: string) => queue().create(name);
export const readPendingPlays = () => queue().pending();
export const restorePlaySession = (id: string) => queue().restore(id);

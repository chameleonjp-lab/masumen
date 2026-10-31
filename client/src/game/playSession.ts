import { CLIENT_VERSION, cleanPlayerName, createRequestId, finishMasumenPlay, startMasumenPlay } from './platform';
import type { BattleSnapshot } from './types';

export interface CompletedResult { score: number; resultType: 'clear' | 'game_over'; reachedWave: number; }
interface PlayApi { start: typeof startMasumenPlay; finish: typeof finishMasumenPlay; }
export interface PendingPlay {
  startId: string; playerName: string; clientVersion: string; playId?: string;
  result: CompletedResult; presentation?: BattleSnapshot; rejected?: boolean; persisted?: boolean;
}
const PREFIX = 'masumen.pending-play.v1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validResult = (r: CompletedResult) => r && Number.isSafeInteger(r.score) && r.score >= 0 &&
  Number.isSafeInteger(r.reachedWave) && r.reachedWave >= 1 && r.reachedWave <= 30 && ['clear', 'game_over'].includes(r.resultType);
function validEntry(v: PendingPlay): boolean {
  return Boolean(v && UUID.test(v.startId) && typeof v.playerName === 'string' && v.playerName &&
    cleanPlayerName(v.playerName) === v.playerName && typeof v.clientVersion === 'string' && v.clientVersion.length > 0 && v.clientVersion.length <= 80 &&
    (!v.playId || UUID.test(v.playId)) && validResult(v.result));
}
function browserStorage(): Storage | undefined { try { return globalThis.localStorage; } catch { return undefined; } }

/** The existing Masumen start/finish protocol counts each start once. Never fall back to a different write after a lost acknowledgement. */
export function createPlayQueue(options: { api?: PlayApi; storage?: Storage; uuid?: () => string; clientVersion?: string } = {}) {
  const api = options.api ?? { start: startMasumenPlay, finish: finishMasumenPlay };
  const storage = options.storage;
  const memory = new Map<string, PendingPlay>();
  const sessions = new Map<string, ReturnType<typeof session>>();
  function persist(entry: PendingPlay) {
    memory.set(entry.startId, entry);
    entry.persisted = false;
    try {
      if (storage) { const { persisted: _persisted, ...saved } = entry; storage.setItem(PREFIX + entry.startId, JSON.stringify(saved)); entry.persisted = true; }
    } catch { /* The UI explicitly warns that reload retention needs storage. */ }
  }
  function pending(): PendingPlay[] {
    try {
      const keys = Array.from({ length: storage?.length ?? 0 }, (_, i) => storage!.key(i));
      for (const key of keys) {
        if (!key?.startsWith(PREFIX)) continue;
        try {
          const entry = JSON.parse(storage!.getItem(key) ?? 'null') as PendingPlay;
          if (validEntry(entry) && key === PREFIX + entry.startId && !memory.has(entry.startId)) memory.set(entry.startId, { ...entry, persisted: true });
        } catch { /* Preserve corrupt data, do not publish it. */ }
      }
    } catch { /* Storage access can be denied. */ }
    return Array.from(memory.values());
  }
  function session(playerName: string, startId: string, clientVersion: string, restored?: PendingPlay) {
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
          if (entry) { entry.playId = id; persist(entry); }
          return id;
        });
        void starting.catch(() => {});
      }
      return starting;
    }
    // Preserve the existing start event; it never gates gameplay.
    if (playerName && !restored) void start();
    function send(): Promise<void> {
      if (running) return running;
      if (!playerName || acknowledged) return Promise.resolve();
      if (!entry) return Promise.reject(new Error('確定結果がありません'));
      if (entry.rejected) return Promise.reject(new Error('記録を受け付けられませんでした'));
      running = start().then(id => api.finish({ ...entry!.result, playId: id, playerName, clientVersion })).then(() => {
        acknowledged = true;
        memory.delete(startId);
        sessions.delete(startId);
        try { storage?.removeItem(PREFIX + startId); } catch { /* Retrying this same ID after reload is safe. */ }
      }).catch(error => {
        if (entry) { entry.rejected = Boolean(error?.permanent); persist(entry); }
        throw error;
      }).finally(() => { running = null; });
      return running;
    }
    return {
      playerName, startId,
      submit(result: CompletedResult, presentation?: BattleSnapshot): Promise<void> {
        if (!playerName) return Promise.resolve();
        if (!entry) {
          if (!validResult(result)) return Promise.reject(new Error('確定結果が不正です'));
          entry = { startId, playerName, clientVersion, playId, result: { ...result }, presentation: presentation ? structuredClone(presentation) : undefined };
          persist(entry);
        }
        if (!submission) submission = send();
        return submission;
      },
      retry(): Promise<void> {
        // Only a completed prior attempt can be retried, never a concurrent one.
        if (running) return running;
        if (!submission) { starting = null; submission = send(); return submission; }
        return submission.catch(() => { starting = null; submission = send(); return submission; });
      },
      hasResult: () => Boolean(entry),
      isPersistent: () => entry?.persisted !== false,
      status: () => acknowledged ? 'sent' as const : entry?.rejected ? 'rejected' as const : 'pending' as const,
    };
  }
  return {
    pending,
    create(name: string) {
      // Abandoned unfinished sessions do not hold memory across endless retries.
      // Their already-issued server starts retain the existing provisional-retire semantics.
      sessions.forEach((value, id) => { if (!value.hasResult()) sessions.delete(id); });
      const playerName = cleanPlayerName(name);
      let id = '';
      try { id = playerName ? (options.uuid ?? createRequestId)() : ''; } catch { /* No public record without a stable ID. */ }
      const value = session(playerName && UUID.test(id) ? playerName : '', id, options.clientVersion ?? CLIENT_VERSION);
      if (id) sessions.set(id, value);
      return value;
    },
    restore(id: string) {
      if (sessions.has(id)) return sessions.get(id)!;
      const entry = pending().find(item => item.startId === id);
      if (!entry) return null;
      const value = session(entry.playerName, entry.startId, entry.clientVersion, entry);
      sessions.set(id, value);
      return value;
    },
  };
}
let defaultQueue: ReturnType<typeof createPlayQueue> | undefined;
function queue() { return defaultQueue ??= createPlayQueue({ storage: browserStorage() }); }
export const createPlaySession = (name: string) => queue().create(name);
export const readPendingPlays = () => queue().pending();
export const restorePlaySession = (id: string) => queue().restore(id);

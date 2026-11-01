import { t, formatNumber } from "@/i18n";
export const GAME_URL = "https://chameleonjp-lab.github.io/masumen/";
export const LAB_URL =
  "https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=masumen";
const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";
const GAME_SLUG = "masumen";
export const CLIENT_VERSION = "masumen-2026-08-31-platform";
const PLAYER_NAME_KEY = "masumen.player-name";

export interface RankingRow {
  rank: number;
  displayName: string;
  score: number;
}

export function cleanPlayerName(value: string): string {
  // Keep the existing UTF-16 limit without cutting an emoji into invalid text.
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20)
    .replace(/[\uD800-\uDBFF]$/, "");
}

export function readPlayerName(): string {
  try {
    return cleanPlayerName(localStorage.getItem(PLAYER_NAME_KEY) ?? "");
  } catch {
    return "";
  }
}

export function savePlayerName(value: string): string {
  const name = cleanPlayerName(value);
  try {
    if (name) localStorage.setItem(PLAYER_NAME_KEY, name);
    else localStorage.removeItem(PLAYER_NAME_KEY);
  } catch {
    // The current session can still continue when storage is unavailable.
  }
  return name;
}

function apiHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
  };
}

async function callRpc<T>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    if (!response.ok)
      throw new Error(`ランキング通信に失敗しました (${response.status})`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function createRequestId(): string {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* Keep the existing fallback for older browsers. */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, token => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function responseError(reason: unknown): Error {
  const error = new Error(
    typeof reason === "string" ? reason : "ランキング応答を確認できませんでした"
  );
  // Transport/malformed acknowledgements stay retryable. Permanent protocol
  // rejections retain the original pending result without changing its identity.
  Object.assign(error, {
    permanent: [
      "required_input_missing",
      "invalid_input",
      "invalid_score",
      "score_out_of_range",
      "start_id_conflict",
      "play_payload_mismatch",
      "play_already_finished",
    ].includes(String(reason)),
  });
  return error;
}
export async function startMasumenPlay(
  playerName: string,
  startId = createRequestId(),
  clientVersion = CLIENT_VERSION
): Promise<string> {
  const name = cleanPlayerName(playerName);
  const payload = await callRpc<Record<string, unknown>>(
    "start_masumen_play_v1",
    {
      p_start_id: startId,
      p_display_name: name,
      p_client_version: clientVersion,
    }
  );
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw responseError(null);
  if (payload.accepted !== true) throw responseError(payload.reason);
  if (
    payload.start_id !== startId ||
    typeof payload.play_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      payload.play_id
    ) ||
    payload.game_slug !== GAME_SLUG ||
    payload.display_name !== name ||
    payload.normalized_name !== name ||
    payload.client_version !== clientVersion ||
    typeof payload.duplicate !== "boolean"
  )
    throw responseError(null);
  return payload.play_id;
}

export async function finishMasumenPlay(input: {
  playId: string;
  playerName: string;
  resultType: "clear" | "game_over" | "retire";
  reachedWave: number;
  score: number;
  clientVersion?: string;
}): Promise<void> {
  const payload = await callRpc<Record<string, unknown>>(
    "finish_masumen_play_v1",
    {
      p_play_id: input.playId,
      p_display_name: cleanPlayerName(input.playerName),
      p_result_type: input.resultType,
      p_reached_wave: input.reachedWave,
      p_score: input.score,
      p_client_version: input.clientVersion ?? CLIENT_VERSION,
    }
  );
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw responseError(null);
  if (payload.accepted !== true) throw responseError(payload.reason);
  if (
    payload.play_id !== input.playId ||
    payload.game_slug !== GAME_SLUG ||
    payload.result_type !== input.resultType ||
    payload.reached_wave !== input.reachedWave ||
    payload.score !== input.score ||
    (payload.duplicate === false &&
      (payload.score_recorded !== true ||
        typeof payload.best_score !== "number" ||
        !Number.isSafeInteger(payload.best_score) ||
        typeof payload.play_count !== "number" ||
        !Number.isSafeInteger(payload.play_count) ||
        payload.play_count < 0 ||
        typeof payload.is_new_best !== "boolean")) ||
    typeof payload.duplicate !== "boolean"
  )
    throw responseError(null);
}

export function normalizeRanking(payload: unknown): RankingRow[] {
  if (!Array.isArray(payload)) throw responseError(null);
  return payload.slice(0, 30).map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw responseError(null);
    const item = row as Record<string, unknown>;
    // Keep the server's shared ranking order and ties, including legacy signed scores.
    const rank = item.rank_no,
      score = item.best_score;
    if (
      typeof rank !== "number" ||
      !Number.isSafeInteger(rank) ||
      rank < 1 ||
      typeof score !== "number" ||
      !Number.isSafeInteger(score) ||
      typeof item.display_name !== "string" ||
      !item.display_name.trim()
    )
      throw responseError(null);
    return { rank, displayName: item.display_name.trim(), score };
  });
}

export async function loadRanking(): Promise<RankingRow[]> {
  const payload = await callRpc<unknown>("get_best_score_ranking", {
    p_game_slug: GAME_SLUG,
    p_limit: 30,
  });
  return normalizeRanking(payload);
}

export async function submitAndLoadRanking(
  score: number,
  playerName: string
): Promise<RankingRow[]> {
  await callRpc<unknown>("submit_score", {
    p_display_name: cleanPlayerName(playerName),
    p_game_slug: GAME_SLUG,
    p_score: Math.max(0, Math.round(score)),
    p_client_version: CLIENT_VERSION,
  });
  return loadRanking();
}

export async function shareOrCopy(
  text: string
): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (typeof window !== "undefined") {
    const intent = new URL("https://x.com/intent/tweet");
    intent.searchParams.set("text", text);
    try {
      const composer = window.open(intent.href, "_blank");
      if (composer) {
        composer.opener = null;
        return "shared";
      }
    } catch {
      /* A blocked composer still offers a copy fallback. */
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied ? "copied" : "failed";
  } catch {
    return "failed";
  }
}

export function shareStatusText(
  status: "shared" | "copied" | "cancelled" | "failed"
): string {
  if (status === "shared") return "シェア画面を開きました";
  if (status === "copied") return "シェア文をコピーしました";
  if (status === "cancelled") return "シェアをキャンセルしました";
  return "コピーできませんでした。シェア文を長押ししてコピーしてください";
}

export function homeShareText(): string {
  return t(
    "【マスメン】カードを使いながら4ウェーブを戦い抜け！\n{0}",
    GAME_URL
  );
}

export function resultShareText(snapshot: {
  score: number;
  rank: string;
  elapsed: number;
  reachedWave: number;
  counters: number;
  simultaneousDefeats: number;
  cardsUsed: number;
}): string {
  return t(
    "【マスメン】今回の結果：{0}点\n{1}",
    formatNumber(snapshot.score),
    GAME_URL
  );
}

const SOUND_PREFERENCE_KEY = "masumen.sound.v1";
export function readSoundPreferences(): { enabled: boolean; volume: number } {
  try {
    const value = JSON.parse(
      localStorage.getItem(SOUND_PREFERENCE_KEY) ?? "{}"
    );
    return {
      enabled: typeof value?.enabled === "boolean" ? value.enabled : true,
      volume:
        typeof value?.volume === "number" &&
        Number.isFinite(value.volume) &&
        value.volume >= 0 &&
        value.volume <= 100
          ? value.volume
          : 70,
    };
  } catch {
    return { enabled: true, volume: 70 };
  }
}
export function saveSoundPreferences(value: {
  enabled: boolean;
  volume: number;
}): void {
  try {
    localStorage.setItem(SOUND_PREFERENCE_KEY, JSON.stringify(value));
  } catch {
    /* Session choice still applies. */
  }
}

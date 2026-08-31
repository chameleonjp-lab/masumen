export const GAME_URL = "https://chameleonjp-lab.github.io/masumen/";
export const LAB_URL = "https://chameleonjp-lab.github.io/chameleonjp_lab/";
const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";
const GAME_SLUG = "masumen";
const CLIENT_VERSION = "masumen-2026-08-31-platform";
const PLAYER_NAME_KEY = "masumen.player-name";

export interface RankingRow {
  rank: number;
  displayName: string;
  score: number;
}

export function cleanPlayerName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 20);
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

async function callRpc<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`ランキング通信に失敗しました (${response.status})`);
  return (await response.json()) as T;
}

function normalizeRanking(payload: unknown): RankingRow[] {
  if (!Array.isArray(payload)) return [];
  return payload.slice(0, 10).map((row, index) => {
    const item = row as Record<string, unknown>;
    return {
      rank: Number(item.rank) || index + 1,
      displayName: cleanPlayerName(String(item.display_name ?? item.player_name ?? "プレイヤー")) || "プレイヤー",
      score: Number(item.score) || 0,
    };
  });
}

export async function submitAndLoadRanking(score: number, playerName: string): Promise<RankingRow[]> {
  await callRpc<unknown>("submit_score", {
    p_display_name: cleanPlayerName(playerName),
    p_game_slug: GAME_SLUG,
    p_score: Math.max(0, Math.round(score)),
    p_client_version: CLIENT_VERSION,
  });
  const payload = await callRpc<unknown>("get_best_score_ranking", {
    p_game_slug: GAME_SLUG,
    p_limit: 10,
  });
  return normalizeRanking(payload);
}

export async function shareOrCopy(text: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
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

export function shareStatusText(status: "shared" | "copied" | "cancelled" | "failed"): string {
  if (status === "shared") return "シェア画面を開きました";
  if (status === "copied") return "シェア文をコピーしました";
  if (status === "cancelled") return "シェアをキャンセルしました";
  return "コピーできませんでした。シェア文を長押ししてコピーしてください";
}

export function homeShareText(): string {
  return `【グリッド・シグナル・アリーナ】位置、連結、カウンターで戦うカードアクションに挑戦！\n${GAME_URL}\n#グリッドシグナルアリーナ #カメレオンJP`;
}

export function resultShareText(snapshot: {
  score: number;
  rank: string;
  elapsed: number;
  reachedWave: number;
  counters: number;
  simultaneousDefeats: number;
  cardsUsed: number;
  overloadCardsUsed: number;
}): string {
  return [
    `【グリッド・シグナル・アリーナ】${readPlayerName() || "プレイヤー"}の戦闘結果`,
    `${snapshot.score.toLocaleString()}点 / ランク ${snapshot.rank}`,
    `到達ウェーブ ${snapshot.reachedWave}・時間 ${Math.floor(snapshot.elapsed)}秒・カウンター ${snapshot.counters}`,
    `同時撃破 ${snapshot.simultaneousDefeats}・使用カード ${snapshot.cardsUsed}・過負荷 ${snapshot.overloadCardsUsed}`,
    "信号をつなぎ、敵陣を制圧した！",
    GAME_URL,
    "#グリッドシグナルアリーナ #カメレオンJP",
  ].join("\n");
}

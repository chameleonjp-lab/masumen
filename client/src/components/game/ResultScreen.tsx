import { CHAIN_TECHNIQUES } from "@/game/data/chainTechniques";
import type { BattleSnapshot } from "@/game/types";

interface ResultScreenProps {
  snapshot: BattleSnapshot;
  onRestart: () => void;
  onFolderEdit: () => void;
  onHome: () => void;
}

function timecode(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remaining = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return minutes + ":" + remaining;
}

function outcomeLabel(snapshot: BattleSnapshot): string {
  if (snapshot.outcome === "draw") return "相打ち";
  if (snapshot.outcome === "defeat") return "敗北";
  return "戦闘完了";
}

function chainName(id: string): string {
  return CHAIN_TECHNIQUES.find(technique => technique.id === id)?.name ?? id;
}

export default function ResultScreen({
  snapshot,
  onRestart,
  onFolderEdit,
  onHome,
}: ResultScreenProps) {
  const breakdown = snapshot.scoreBreakdown;
  const chains = snapshot.usedChainTechniques ?? [];
  const delta = snapshot.personalBestDelta ?? 0;
  const deltaLabel =
    delta > 0 ? "+" + delta : delta < 0 ? String(delta) : "±0";

  return (
    <section className="result-console result-console-rich" aria-live="polite">
      <p className="eyebrow">戦闘結果 / {outcomeLabel(snapshot)}</p>
      <h2>
        {snapshot.outcome === "victory"
          ? "ネットワーク制圧完了"
          : snapshot.outcome === "draw"
            ? "相打ち — 敗北"
            : "信号が途絶しました"}
      </h2>
      <div className="rank-dial">
        <span>ランク</span>
        <strong>{snapshot.rank}</strong>
      </div>

      <div className="result-summary-grid">
        <span>
          最終スコア <b>{snapshot.score}</b>
        </span>
        <span>
          合計時間 <b>{timecode(snapshot.elapsed)}</b>
        </span>
        <span>
          到達Wave <b>{snapshot.reachedWave ?? snapshot.wave}</b>
        </span>
        <span>
          自己ベスト差 <b>{deltaLabel}</b>
        </span>
      </div>

      <div className="result-stat-grid">
        <span>
          被ダメージ <b>{snapshot.totalDamageTaken ?? 0}</b>
        </span>
        <span>
          カウンター <b>{snapshot.counters}</b>
        </span>
        <span>
          同時撃破 <b>{snapshot.simultaneousDefeats ?? 0}</b>
        </span>
        <span>
          使用カード <b>{snapshot.cardsUsed ?? 0}</b>
        </span>
        <span>
          過負荷カード <b>{snapshot.overloadCardsUsed ?? 0}</b>
        </span>
        <span>
          最高記録 <b>{snapshot.highScore}</b>
        </span>
      </div>

      {chains.length > 0 && (
        <div className="result-chains">
          <span>使用した連結技</span>
          <p>{chains.map(chainName).join(" / ")}</p>
        </div>
      )}

      {breakdown && (
        <div className="result-breakdown">
          <span>スコア内訳</span>
          <p>
            敵撃破 +{breakdown.enemyDefeatPoints} / Wave突破 +
            {breakdown.waveClearPoints} / 時間 +{breakdown.timePoints}
          </p>
          <p>
            カウンター +{breakdown.counterPoints} / 同時撃破 +
            {breakdown.simultaneousPoints} / 無被弾 +
            {breakdown.noDamagePoints}
          </p>
          <p>
            被ダメージ -{breakdown.damagePenalty} / 過負荷 -
            {breakdown.overloadPenalty}
          </p>
        </div>
      )}

      <div className="result-actions">
        <button type="button" className="engage-button" onClick={onRestart}>
          もう一度 <span>↗</span>
        </button>
        <button type="button" onClick={onFolderEdit}>
          フォルダ編集
        </button>
        <button type="button" onClick={onHome}>
          ホームへ戻る
        </button>
      </div>
    </section>
  );
}

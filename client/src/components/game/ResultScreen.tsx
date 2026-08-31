import { useState } from "react";
import { CHAIN_TECHNIQUES } from "@/game/data/chainTechniques";
import { scoreRate } from "@/game/systems/ScoreSystem";
import type { BattleSnapshot } from "@/game/types";
import {
  LAB_URL,
  resultShareText,
  shareOrCopy,
  shareStatusText,
  type RankingRow,
} from "@/game/platform";

interface ResultScreenProps {
  snapshot: BattleSnapshot;
  playerName: string;
  ranking: RankingRow[];
  rankingStatus: string;
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
  playerName,
  ranking,
  rankingStatus,
  onRestart,
  onFolderEdit,
  onHome,
}: ResultScreenProps) {
  const breakdown = snapshot.scoreBreakdown;
  const chains = snapshot.usedChainTechniques ?? [];
  const delta = snapshot.personalBestDelta ?? 0;
  const deltaLabel =
    delta > 0 ? "+" + delta : delta < 0 ? String(delta) : "±0";
  const scorePercent = Math.round(scoreRate(snapshot.score) * 100);
  const [shareStatus, setShareStatus] = useState("");
  const shareText = resultShareText({
    score: snapshot.score,
    rank: snapshot.rank,
    elapsed: snapshot.elapsed,
    reachedWave: snapshot.reachedWave ?? snapshot.wave,
    counters: snapshot.counters,
    simultaneousDefeats: snapshot.simultaneousDefeats ?? 0,
    cardsUsed: snapshot.cardsUsed ?? 0,
    overloadCardsUsed: snapshot.overloadCardsUsed ?? 0,
  });

  const shareResult = () => {
    void shareOrCopy(shareText).then(result => setShareStatus(shareStatusText(result)));
  };

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
          到達ウェーブ <b>{snapshot.reachedWave ?? snapshot.wave}</b>
        </span>
        <span>
          自己ベスト差 <b>{deltaLabel}</b>
        </span>
        <span>
          得点率 <b>{scorePercent}%</b>
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
            敵撃破 +{breakdown.enemyDefeatPoints} / ウェーブ突破 +
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

      <section className="result-platform technical-panel" aria-label="結果の共有とランキング">
        <p className="eyebrow">RESULT SIGNAL / ONLINE TOP 10</p>
        <p className="result-platform__player">{playerName} の結果</p>
        <textarea className="result-share-text" readOnly value={shareText} aria-label="結果のシェア文" />
        <button type="button" className="engage-button result-share-button" onClick={shareResult}>
          結果をシェア／コピー <span>↗</span>
        </button>
        <p className="share-status" role="status">{shareStatus || rankingStatus}</p>
        <ol className="online-ranking" aria-label="オンラインランキング">
          {ranking.length > 0 ? ranking.map(row => (
            <li key={`${row.rank}-${row.displayName}`}>
              <span>{row.rank}. {row.displayName}</span>
              <strong>{row.score.toLocaleString()}点</strong>
            </li>
          )) : <li>ランキングを読み込み中…</li>}
        </ol>
        <a className="result-lab-link" href={LAB_URL} target="_blank" rel="noreferrer">
          カメレオンJPの実験場へ
        </a>
      </section>

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

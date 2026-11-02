import { t, translateGameText, formatNumber } from "@/i18n";
import { msg } from "@/i18n/react";
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
  rankingLoading?: boolean;
  rankingError?: boolean;
  onRestart: () => void;
  onHome: () => void;
  onRetryRanking: () => void;
  submissionError?: boolean;
  storageWarning?: boolean;
  onRetrySubmission?: () => void;
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
  rankingLoading = false,
  rankingError = false,
  onRestart,
  onHome,
  onRetryRanking,
  submissionError,
  onRetrySubmission,
  storageWarning,
}: ResultScreenProps) {
  const breakdown = snapshot.scoreBreakdown;
  const chains = snapshot.usedChainTechniques ?? [];
  const delta = snapshot.personalBestDelta ?? 0;
  const deltaLabel = delta > 0 ? "+" + delta : delta < 0 ? String(delta) : "±0";
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
  });

  const shareResult = () => {
    void shareOrCopy(shareText).then(result =>
      setShareStatus(shareStatusText(result))
    );
  };

  return (
    <section className="result-console result-console-rich" aria-live="polite">
      <p className="eyebrow">
        {msg("戦闘結果 / {0}", t(outcomeLabel(snapshot)))}
      </p>
      <h2>
        {snapshot.outcome === "victory"
          ? t("ネットワーク制圧完了")
          : snapshot.outcome === "draw"
            ? t("相打ち — 敗北")
            : t("信号が途絶しました")}
      </h2>
      <div className="rank-dial">
        <span>{msg("ランク")}</span>
        <strong>{snapshot.rank}</strong>
      </div>

      <div className="result-summary-grid">
        <span>{msg("最終スコア {0}", <b>{snapshot.score}</b>)}</span>
        <span>{msg("合計時間 {0}", <b>{timecode(snapshot.elapsed)}</b>)}</span>
        <span>
          {msg(
            "到達ウェーブ {0}",
            <b>{snapshot.reachedWave ?? snapshot.wave}</b>
          )}
        </span>
        <span>{msg("自己ベスト差 {0}", <b>{deltaLabel}</b>)}</span>
        <span>{msg("得点率 {0}", <b>{scorePercent}%</b>)}</span>
      </div>

      <div className="result-stat-grid">
        <span>
          {msg("被ダメージ {0}", <b>{snapshot.totalDamageTaken ?? 0}</b>)}
        </span>
        <span>{msg("カウンター {0}", <b>{snapshot.counters}</b>)}</span>
        <span>
          {msg("同時撃破 {0}", <b>{snapshot.simultaneousDefeats ?? 0}</b>)}
        </span>
        <span>{msg("使用カード {0}", <b>{snapshot.cardsUsed ?? 0}</b>)}</span>
        <span>{msg("最高記録 {0}", <b>{snapshot.highScore}</b>)}</span>
      </div>

      {chains.length > 0 && (
        <div className="result-chains">
          <span>{msg("使用した連結技")}</span>
          <p>
            {chains
              .map(chainName)
              .map(name => t(name))
              .join(" / ")}
          </p>
        </div>
      )}

      {breakdown && (
        <div className="result-breakdown">
          <span>{msg("スコア内訳")}</span>
          <p>
            {msg(
              "敵撃破 +{0} / ウェーブ突破 + {1} / 時間 +{2}",
              breakdown.enemyDefeatPoints,
              breakdown.waveClearPoints,
              breakdown.timePoints
            )}
          </p>
          <p>
            {msg(
              "カウンター +{0} / 同時撃破 + {1} / 無被弾 + {2}",
              breakdown.counterPoints,
              breakdown.simultaneousPoints,
              breakdown.noDamagePoints
            )}
          </p>
          <p>{msg("被ダメージ -{0}", breakdown.damagePenalty)}</p>
        </div>
      )}

      <section
        className="result-platform technical-panel"
        aria-label={t("結果の共有とランキング")}
      >
        <p className="eyebrow">{msg("結果共有 / ランキング上位30名")}</p>
        <p className="result-platform__player">
          {playerName ? t("{0} の結果", playerName) : t("今回の結果")}
        </p>
        <textarea
          className="result-share-text"
          readOnly
          value={shareText}
          aria-label={t("結果のシェア文")}
        />
        <button
          type="button"
          className="engage-button result-share-button x-share-action"
          onClick={shareResult}
        >
          {msg("Xでシェア")}
        </button>
        <p className="ranking-status" role="status">
          {translateGameText(rankingStatus)}
        </p>
        {shareStatus && (
          <p className="share-status" role="status">
            {translateGameText(shareStatus)}
          </p>
        )}
        {storageWarning && (
          <p role="status">
            {msg(
              "このタブでのみ結果を保持しています。閉じる前に再送してください。"
            )}
          </p>
        )}
        {submissionError && (
          <button type="button" onClick={onRetrySubmission}>
            {msg("記録の送信を再試行")}
          </button>
        )}
        {rankingError && (
          <button type="button" onClick={onRetryRanking}>
            {msg("ランキングを再試行")}
          </button>
        )}
        <ol className="online-ranking" aria-label={t("オンラインランキング")}>
          {ranking.length > 0 ? (
            ranking.map(row => (
              <li key={`${row.rank}-${row.displayName}`}>
                <span>
                  {row.rank}. {row.displayName}
                </span>
                <strong>{msg("{0}点", formatNumber(row.score))}</strong>
              </li>
            ))
          ) : (
            <li>
              {rankingLoading
                ? t("ランキングを読み込み中…")
                : rankingError
                  ? t("ランキングを取得できませんでした")
                  : t("まだ記録がありません")}
            </li>
          )}
        </ol>
        <a
          className="result-lab-link"
          href={LAB_URL}
          target="_blank"
          rel="noreferrer"
        >
          {msg("ランキング")}
        </a>
      </section>

      <div className="result-actions">
        <button type="button" className="engage-button" onClick={onRestart}>
          {msg("もう一度 {0}", <span>↗</span>)}
        </button>
        <button type="button" onClick={onHome}>
          {msg("ホームに戻る")}
        </button>
      </div>
    </section>
  );
}

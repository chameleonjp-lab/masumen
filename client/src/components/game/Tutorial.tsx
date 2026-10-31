import { t, translateGameText } from "@/i18n";
import { msg } from "@/i18n/react";
import { getPracticeStage, PRACTICE_STAGES } from "@/game/data/practice";

interface TutorialProps {
  stage: number;
  cleared: boolean;
  progress?: {
    completed: number;
    total: number;
    remaining: string[];
  };
  retryCount: number;
  supplyNames: string[];
  onNext: () => void;
  onRetry: () => void;
  onExit: () => void;
}

export default function Tutorial({
  stage,
  cleared,
  progress,
  retryCount,
  supplyNames,
  onNext,
  onRetry,
  onExit,
}: TutorialProps) {
  const current = getPracticeStage(stage);
  const finished = current.stage >= PRACTICE_STAGES.length;
  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? current.requiredProgress.length;
  const remaining = progress?.remaining ?? [];

  return (
    <section
      className="practice-console"
      aria-modal="true"
      role="dialog"
      aria-label={t("練習モード")}
    >
      <p className="eyebrow">
        {msg("練習モード / {0} / 07", String(current.stage).padStart(2, "0"))}
      </p>
      <h2>{t(current.title)}</h2>
      <p className="practice-lesson">{t(current.lesson)}</p>
      <div className="practice-objective">
        <span>{msg("この段階の目標")}</span>
        <strong>{t(current.objective)}</strong>
        <small>
          {cleared
            ? t("段階クリア — 次の段階へ進めます")
            : remaining.length === 0
              ? t(
                  "目標達成 — 敵を倒すと段階クリア（{0}/{1}）",
                  completed,
                  total
                )
              : t(
                  "{0}（目標 {1}/{2}）",
                  t(current.actionHint),
                  completed,
                  total
                )}
        </small>
        {!cleared && remaining.length > 0 ? (
          <small>
            {msg("未達: {0}", remaining.map(label => t(label)).join(" / "))}
          </small>
        ) : null}
      </div>
      <p className="practice-supply">
        {msg(
          "補給: {0} {1}",
          supplyNames.length > 0
            ? supplyNames.map(name => t(name)).join(" / ")
            : t("カードなし（通常射撃を使用）"),
          retryCount > 0 && t(" ・ やり直し {0}回", retryCount)
        )}
      </p>
      <ol className="practice-stages">
        {PRACTICE_STAGES.map(item => (
          <li
            className={
              item.stage === current.stage
                ? "current"
                : item.stage < current.stage
                  ? "completed"
                  : ""
            }
            key={item.stage}
          >
            <span>{item.stage}</span>
            <b>{t(item.title)}</b>
          </li>
        ))}
      </ol>
      <div className="practice-actions">
        <button type="button" onClick={onExit}>
          {msg("通常モードへ戻る")}
        </button>
        <button type="button" onClick={onRetry}>
          {msg("この段階をやり直す")}
        </button>
        <button
          type="button"
          className="engage-button"
          disabled={!cleared}
          onClick={onNext}
        >
          {finished ? t("練習を終了") : t("次の段階へ")} <span>↗</span>
        </button>
      </div>
    </section>
  );
}

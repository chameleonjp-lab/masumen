import { getPracticeStage, PRACTICE_STAGES } from "@/game/data/practice";

interface TutorialProps {
  stage: number;
  cleared: boolean;
  onNext: () => void;
  onExit: () => void;
}

export default function Tutorial({ stage, cleared, onNext, onExit }: TutorialProps) {
  const current = getPracticeStage(stage);
  const finished = current.stage >= PRACTICE_STAGES.length;

  return (
    <section
      className="practice-console"
      aria-modal="true"
      role="dialog"
      aria-label="練習モード"
    >
      <p className="eyebrow">
        練習モード / {String(current.stage).padStart(2, "0")} / 07
      </p>
      <h2>{current.title}</h2>
      <p className="practice-lesson">{current.lesson}</p>
      <div className="practice-objective">
        <span>この段階の目標</span>
        <strong>{current.objective}</strong>
        <small>{cleared ? "段階クリア — 次の段階へ進めます" : current.actionHint}</small>
      </div>
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
            <b>{item.title}</b>
          </li>
        ))}
      </ol>
      <div className="practice-actions">
        <button type="button" onClick={onExit}>
          通常モードへ戻る
        </button>
        <button
          type="button"
          className="engage-button"
          disabled={!cleared}
          onClick={onNext}
        >
          {finished ? "練習を終了" : "次の段階へ"} <span>↗</span>
        </button>
      </div>
    </section>
  );
}

import type { ReactNode } from "react";
import type { StartupState } from "@/game/startup";

const stages = { engine: "描画の準備", scene: "戦闘フィールドの準備", render: "最初の画面の表示" };

export default function StartupScreen({ state }: { state: StartupState }) {
  if (state.status === "ready") return null;
  if (state.status === "loading") return (
    <section className="startup-panel" role="status" aria-live="polite">
      <p className="eyebrow">起動中</p>
      <h1>戦闘画面を準備しています</h1>
      <p>{stages[state.stage]}…</p>
    </section>
  );
  return (
    <section className="startup-error" role="alert" aria-live="assertive">
      <p className="eyebrow">起動停止</p>
      <h1>戦闘画面を読み込めませんでした</h1>
      <p>ページを再読み込みしてください。繰り返す場合は、下の診断情報を添えてお知らせください。</p>
      <details className="startup-diagnostics">
        <summary>診断情報</summary>
        <p>{stages[state.stage]} / {state.stage} / {state.code}</p>
      </details>
      <button type="button" className="engage-button" onClick={() => window.location.reload()}>
        再読み込み <span>↗</span>
      </button>
    </section>
  );
}

export function StartupGate({ state, hasName, nameGate, children }: {
  state: StartupState; hasName: boolean; nameGate: ReactNode; children: ReactNode;
}) {
  if (state.status !== "ready") return <StartupScreen state={state} />;
  return <>{hasName ? children : nameGate}</>;
}

export interface PracticeStage {
  stage: number;
  title: string;
  lesson: string;
  objective: string;
  actionHint: string;
}

export const PRACTICE_STAGES: readonly PracticeStage[] = [
  {
    stage: 1,
    title: "移動と通常射撃",
    lesson: "上下左右へ1マスずつ移動し、正面の信号へ通常射撃を送ります。",
    objective: "移動と通常射撃の入力を確認する",
    actionHint: "方向ボタンで移動、バスターを短くタップ",
  },
  {
    stage: 2,
    title: "カードの弾道",
    lesson: "カードは使用した瞬間に消えるのではなく、弾道や着弾を持つ攻撃物になります。",
    objective: "直進弾・投擲・近接の違いを覚える",
    actionHint: "カードの説明と範囲表示を確認する",
  },
  {
    stage: 3,
    title: "接続コード",
    lesson: "同名、同じ接続コード、共通コード*のカードだけを一度に送信できます。",
    objective: "複数カードを正しい接続で選ぶ",
    actionHint: "カードを1回タップして選択。選択中のカードをタップで解除",
  },
  {
    stage: 4,
    title: "攻撃予告と回避",
    lesson: "敵の構え、発射口、着弾地点を読み、攻撃が届く前に安全なマスへ移動します。",
    objective: "予告の種類を見分けて回避する",
    actionHint: "敵の動きと盤面の予告を同時に見る",
  },
  {
    stage: 5,
    title: "カウンターと完全同期",
    lesson: "攻撃準備の終盤だけがカウンター受付です。カードを実際に命中させると完全同期になります。",
    objective: "カウンター受付の短い時間を狙う",
    actionHint: "受付表示または攻撃直前の動作に合わせてカードを送る",
  },
  {
    stage: 6,
    title: "パネルと設置物",
    lesson: "草、氷、溶岩、毒、聖域と、盤面に残る設置物は位置取りを変えます。",
    objective: "地形と障害物を利用して経路を作る",
    actionHint: "パネルの模様と設置物の衝突を確認する",
  },
  {
    stage: 7,
    title: "精神状態と過負荷",
    lesson: "被弾が続くと動揺し、強力な過負荷カードが現れます。使う代わりに侵食の不利益を受けます。",
    objective: "強さと不利益を見比べて判断する",
    actionHint: "精神状態、侵食値、回復量の変化を確認する",
  },
];

export function getPracticeStage(stage: number): PracticeStage {
  const normalized = Math.max(
    1,
    Math.min(PRACTICE_STAGES.length, Math.floor(stage))
  );
  return PRACTICE_STAGES[normalized - 1] ?? PRACTICE_STAGES[0];
}

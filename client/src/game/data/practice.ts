import type { EnemyId } from "./enemies";

export type PracticeAction = "move" | "normal-shot" | "charge-shot" | "card";

/**
 * A practice stage is complete only after its observable learning actions and
 * its enemy encounter are both complete. Keeping these ids in data (instead
 * of deriving them from the lesson copy) makes the success contract testable.
 */
export type PracticeProgressId =
  | "move"
  | "normal-shot"
  | "charge-shot"
  | "card"
  | "connection"
  | "warning"
  | "counter"
  | "terrain"
  | "emotion"
  | "overload";

export const PRACTICE_PROGRESS_LABELS: Readonly<Record<PracticeProgressId, string>> = {
  move: "移動",
  "normal-shot": "通常射撃",
  "charge-shot": "チャージ射撃",
  card: "カード送信",
  connection: "接続コード",
  warning: "攻撃予告の確認",
  counter: "カウンター",
  terrain: "地形・設置物",
  emotion: "精神状態",
  overload: "過負荷カード",
};

export interface PracticeStage {
  stage: number;
  title: string;
  lesson: string;
  objective: string;
  actionHint: string;
  enemyIds: readonly EnemyId[];
  allowedActions: readonly PracticeAction[];
  /** Cards supplied by the stage; practice never consumes the player's deck. */
  supplyCardIds: readonly string[];
  /** Observable actions required before the stage can be marked clear. */
  requiredProgress: readonly PracticeProgressId[];
}

export const PRACTICE_STAGES: readonly PracticeStage[] = [
  {
    stage: 1,
    title: "移動と通常射撃",
    lesson: "上下左右へ1マスずつ移動し、正面の信号へ通常射撃を送ります。",
    objective: "移動と通常射撃の入力を確認する",
    actionHint: "方向ボタンで移動、バスターを短くタップ",
    enemyIds: ["scanner"],
    allowedActions: ["move", "normal-shot"],
    supplyCardIds: [],
    requiredProgress: ["move", "normal-shot"],
  },
  {
    stage: 2,
    title: "カードの弾道",
    lesson: "カードは使用した瞬間に消えるのではなく、弾道や着弾を持つ攻撃物になります。",
    objective: "直進弾・投擲・近接の違いを覚える",
    actionHint: "補給されたカードを1枚送り、弾道と着弾を確認する",
    enemyIds: ["bulwark"],
    allowedActions: ["move", "card"],
    supplyCardIds: ["rapid", "lance", "slash"],
    requiredProgress: ["card"],
  },
  {
    stage: 3,
    title: "接続コード",
    lesson: "同名、同じ接続コード、共通コード*のカードだけを一度に送信できます。",
    objective: "複数カードを正しい接続で選ぶ",
    actionHint: "同じ接続コード（A）のカードを2枚続けて送信する",
    enemyIds: ["scanner"],
    allowedActions: ["move", "card"],
    supplyCardIds: ["rapid", "lance"],
    requiredProgress: ["connection"],
  },
  {
    stage: 4,
    title: "攻撃予告と回避",
    lesson: "敵の構え、発射口、着弾地点を読み、攻撃が届く前に安全なマスへ移動します。",
    objective: "予告の種類を見分けて回避する",
    actionHint: "予告が出たら別のマスへ移動して回避する",
    enemyIds: ["bulwark"],
    allowedActions: ["move", "normal-shot", "charge-shot", "card"],
    supplyCardIds: ["phase", "seeker", "premonition"],
    requiredProgress: ["warning", "move"],
  },
  {
    stage: 5,
    title: "カウンターと完全同期",
    lesson: "攻撃準備の終盤だけがカウンター受付です。カードを実際に命中させると完全同期になります。",
    objective: "カウンター受付の短い時間を狙う",
    actionHint: "受付表示中に攻撃カードを送る",
    enemyIds: ["bulwark"],
    allowedActions: ["move", "card"],
    supplyCardIds: ["rapid", "lance", "premonition"],
    requiredProgress: ["counter"],
  },
  {
    stage: 6,
    title: "パネルと設置物",
    lesson: "草、氷、溶岩、毒、聖域と、盤面に残る設置物は位置取りを変えます。",
    objective: "地形と障害物を利用して経路を作る",
    actionHint: "補給カードで地形を変えるか、設置物を置く",
    enemyIds: ["mortar"],
    allowedActions: ["move", "card"],
    supplyCardIds: ["block", "icewall", "frost", "gustwall"],
    requiredProgress: ["terrain"],
  },
  {
    stage: 7,
    title: "精神状態と過負荷",
    lesson: "被弾が続くと動揺し、強力な過負荷カードが現れます。使う代わりに侵食の不利益を受けます。",
    objective: "強さと不利益を見比べて判断する",
    actionHint: "精神状態が変化した後、過負荷カードを1枚送る",
    enemyIds: ["scanner", "mortar"],
    allowedActions: ["move", "normal-shot", "charge-shot", "card"],
    supplyCardIds: [
      "overload-limit-cannon",
      "overload-forced-repair",
      "rectify",
    ],
    requiredProgress: ["emotion", "overload"],
  },
];

export function getPracticeStage(stage: number): PracticeStage {
  const normalized = Math.max(
    1,
    Math.min(PRACTICE_STAGES.length, Math.floor(stage))
  );
  return PRACTICE_STAGES[normalized - 1] ?? PRACTICE_STAGES[0];
}

# Grid Signal Arena — 構成

## 実行レイヤー

```text
React App
└─ GameCanvas（全画面canvas、DOM HUD、入力ガイド）
   └─ createGameScene(engine, canvas)
      └─ GameWorld
         ├─ GridArena（6×3タイル、領域制約、警告マス）
         ├─ PlayerUnit（移動、バスター、チャージ、被弾、同期）
         ├─ EnemyUnit[]（状態機械、予兆、発射、麻痺）
         ├─ DeckController（候補、組み合わせ、キュー、再抽選）
         ├─ ProjectileSystem（弾道、寿命、判定）
         └─ BattleState（custom / battle / result、HP、ゲージ、評価）
```

## 主要モジュール

| パス | 責務 |
|---|---|
| `client/src/components/GameCanvas.tsx` | Babylonエンジンの寿命管理、DOM HUD、停止メニュー、説明後の再タップによる17秒カスタム選択、選択順表示、対象形状ごとに走査する18マス範囲プレビュー、大型モバイル操作、ゲームイベント購読。 |
| `client/src/game/scene.ts` | Scene、カメラ、照明、グリッド、ビルボード、カードの命中方向ガイド、ゲームハンドルの生成。 |
| `client/src/game/GameWorld.ts` | フレーム更新、停止・17秒カスタムのモード遷移、連射制限付き正面直線攻撃、固定対象マスのカード判定、対象マス被弾、勝敗、イベント発行。 |
| `client/src/game/types.ts` | グリッド・カード・戦闘状態・UIスナップショットの共通型。 |
| `client/src/game/deck.ts` | 日本語名50枚のカードフォルダ、系統、メガ枠、カスタム候補、任意5枚の選択可能条件の定義。 |
| `client/src/game/cardAudio.ts` | Web Audio APIで系統別カード音・カウンター音・敵別撃破音を合成し、音量とオンオフを制御してラン終了時に破棄する。 |
| `client/src/game/assets.ts` | `/manus-storage/` の画像URLとBabylonテクスチャ生成を一箇所に集約。 |
| `client/src/index.css` | Signal Relay Tacticalの色、切欠きパネル、操作反応、レスポンシブHUD。 |

## データモデル

| 概念 | 主要値 |
|---|---|
| GridPosition | `col: 0..5`, `row: 0..2`。列0..2がプレイヤー領域、3..5が敵領域。 |
| Card | `id`, `name`, `tier`, `family`, `target`, `power`, `status`、`description`。英字コードは選択制約・UI表示に使用しない。 |
| Unit | `id`, `side`, `hp`, `maxHp`, `grid`, `stunUntil`, `state`。 |
| BattleSnapshot | `mode`, `paused`, `customRemaining`, `playerHp`, `gauge`, `sync`, `barrier`, `invincible`, `customHand`, `queue`, `enemies`, `message`, `elapsed`。 |

カードの一時エフェクトと合成音はランの永続データに含めない。再戦時にはGameWorldの状態を初期化し、場面破棄時に一時メッシュ、Web Audioコンテキスト、振動予約も破棄する。カード使用は短い視覚ヒットストップを発生させるが、ゲーム内の入力・タイマー・敵AIは停止しない。カードは1回目のタップで説明と範囲を表示し、2回目で選択順にキュー化する。発動時は先に対象マスを固定し、そのマスにいる敵だけにダメージと状態を適用する。カードの視覚演出は固定マスの方向ガイド・走査・着弾へ統一し、敵への弾道追尾を行わない。パイロットは通常と攻撃の2スプライトを持ち、通常攻撃・チャージ・カード送信の短時間だけ攻撃姿勢へ切り替わる。

## アセットの扱い

画像はプロジェクトツリーに保存せず、すべて `/manus-storage/` URLから読み込む。ユニット画像はアルファ付きのビルボード、参照画は起動画面の背景・情報端末の質感に用いる。グリッド、発光ライン、弾丸、HPバー等の幾何要素は軽量なBabylonプリミティブで描画する。

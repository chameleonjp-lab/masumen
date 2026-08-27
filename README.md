# Grid Signal Arena

Grid Signal Arenaは、6×3グリッドで展開するリアルタイム戦闘を中心とした、React・Vite・Babylon.js製のブラウザゲームです。プレイヤーは3×3の自陣を移動し、通常射撃、チャージ射撃、カード送信、カウンター、障壁、位相回避を組み合わせて連戦に挑みます。

## 主な機能

- 50枚の日本語名シグナルカードと、対象マスに基づく固定範囲判定。
- 5種の敵AI、Wave 1〜4の連戦、スコア・最高到達Waveのローカル保存。
- カード別の固有描写・合成効果音・命中時の敵リアクション。
- プレイヤーの被弾、障壁防御、位相回避、カウンター、位置回避を区別する戦闘リアクション。
- HP危険域でのCAUTION／CRITICAL警告フレーム、モーション低減対応、モバイル操作。

## ローカル開発

Node.js 22系とpnpmを用意したうえで、以下を実行します。

```bash
pnpm install
pnpm dev
```

開発サーバー起動後は、表示されたURLをブラウザで開きます。

## 検証

```bash
pnpm audit:card-vfx
pnpm check
pnpm exec vite build --minify=false
```

`audit:card-vfx` はカード定義、固有描写、固有音響レシピがそれぞれ50件で過不足がないことを確認します。

## プロジェクト構成

| パス | 内容 |
| --- | --- |
| `client/src/game/` | 戦闘ロジック、Babylon.jsシーン、カード・音響・描写定義。 |
| `client/src/components/` | HUD、カード選択、停止メニュー、モバイル操作。 |
| `client/src/index.css` | Signal Relay Tacticalの画面スタイルとレスポンシブ設定。 |
| `scripts/audit-card-vfx.mjs` | 50枚カードの描写・音響監査。 |
| `*_AUDIT.md` / `MEMORY.md` | 設計判断、カード監査、検証メモ。 |

## アセット

ゲームで使用する背景・プレイヤー・敵・ロゴは、`client/public/assets/`にSVGとして同梱しています。公開先のドメインやリポジトリ階層に依存しない相対パスで読み込みます。詳細は`ASSETS.md`を参照してください。

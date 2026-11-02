# マスメン

マスメンは、6×3グリッドで展開するリアルタイム戦闘を中心とした、React・Vite・Babylon.js製のブラウザゲームです。プレイヤーは3×3の自陣を移動し、通常射撃、チャージ射撃、カード送信、カウンター、障壁、位相回避を組み合わせて連戦に挑みます。

## 主な機能

- 15言語で名前と効果を読める50枚のシグナルカードと、対象マスに基づく固定範囲判定。
- 通常敵12種・ボス4種、Wave 1〜4の連戦、スコア・最高到達Waveのローカル保存。
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

## GitHub Pages公開

1. PR更新では単体・型・監査・ビルドを検証し、本番へは配備しません。Combat validation は Chromium/WebKit で外部通信を遮断し、ランキングをモック検証します。
2. 本人が main へマージすると、同じコミットの検証・ビルドが成功した成果物だけを既存 Pages workflow で配備します。
3. 公開前に現行 main の SHA と一致を確認します。マージ後の実際の配備・iPhone Safari 動作は本人マージ前には確認できません。
4. Pages の公開元は GitHub Actions（workflow）が必要です。現設定を変更せず、確認できない場合は設定確認待ちとして扱います。

旧版の manual-only 手順は PR の変更前コミットに保持しています。現在の workflow には main push / PR 検証があり、手動実行だけではありません。

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

共通仕様の対応範囲・検証・残件は [2026-10-31対応記録](docs/COMMON_SPEC_2026_10_31.md) を参照してください。

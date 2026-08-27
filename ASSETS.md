# Assets

**Art direction:** 工業設計図と携帯端末UIを掛け合わせた「Signal Relay Tactical」。深いグラファイト、ティール、オーカー、アイボリー、Relay Ember #FF5E3Bを使い、6×3グリッドを見やすく表現します。

## 参照画・背景

| 名前 | 内容 | サイズ | パス | 用途 |
|---|---|---:|---|---|
| battle-reference | 6×3盤面と端末HUDの構図 | SVG viewBox 1920×1080 | `client/public/assets/arena-reference.svg` | カスタム画面の背景 |

## スプライト

| 名前 | 内容 | サイズ | パス | 用途 |
|---|---|---:|---|---|
| relay-pilot | シアンバイザーのシグナル・パイロット | SVG viewBox 128×128 | `client/public/assets/pilot.svg` | プレイヤー |
| relay-pilot-attack | 砲を正面へ構えたシグナル・パイロット | SVG viewBox 128×128 | `client/public/assets/pilot-attack.svg` | 攻撃中のプレイヤー |
| bulwark-drone | オーカーの盾型ドローン | SVG viewBox 128×128 | `client/public/assets/shield-drone.svg` | 地上敵 |
| scanner-orb | 橙色の浮遊センサー | SVG viewBox 112×112 | `client/public/assets/sensor-orb.svg` | 浮遊敵 |
| razor-scout | 高速偵察ドローン | SVG viewBox 112×112 | `client/public/assets/razor-scout.svg` | 高速敵 |
| mortar-node | 固定砲台リレーノード | SVG viewBox 128×128 | `client/public/assets/mortar-node.svg` | 高耐久敵 |
| volt-sentinel | 浮遊防衛センチネル | SVG viewBox 120×120 | `client/public/assets/volt-sentinel.svg` | 電気属性敵 |

## ブランド

| 名前 | 内容 | サイズ | パス | 用途 |
|---|---|---:|---|---|
| relay-mark | 3×3信号グリッドのシンボル | SVG viewBox 96×96 | `client/public/assets/relay-mark.svg` | ヘッダーとファビコン |

すべての資産はリポジトリ内に同梱し、`client/src/game/assets.ts`から相対パスで参照します。外部ストレージや実行時の署名URLは使いません。

# マスメン X / SNS 後続（2026-11-02）

基準: main `1aeb20790463da7e4d51c847d2560598d8eaedbf`。
正式ページ: https://chameleonjp-lab.github.io/masumen/ 。現公開ページへの変更ではなく作業ブランチ上の検証。

## 現物から確認した問題と最小修正
- ホーム X は存在するが、旧 `.name-gate__links button` の詳細度で高さが 42px になっていた。新しい 44px / hit / 前景背景検査で RED。ホームだけ `.name-gate__links .x-share-action { min-height:44px }` を追加。結果やゲームルールは変更しない。
- 開発サーバー検査でロゴが壊れていた。Vite dev root と公開 repo prefix を混同したテスト URL が原因。公開 SVG は 200、原本と SHA-256 一致。製品の asset URL は変えず、隔離検査を dev root に変更。必須ロゴ 1 件の存在・可視・naturalWidth と他の可視画像を検査。
- 初回 CI の旧 localization 検査は通過したが、新規可視検査で 42px を検出。旧検査成功だけで可視性を受入済みとはしない。

## 現在通った範囲
- `19d688eb421a3b417f17ba9225fc4a26f9b3c503` / Actions `41408371431`: unit303 / tsc /既存監査 / build /出力監査、Chromium・WebKit成功。
- 15言語でホームと実際の敗北から復元した結果の X ボタン。ja/en/de は縦・横・短い表示領域、他12言語は縦。祖先非表示/opacity0の負例、44px、中心 hit、全文・黒白・押下中黒白、実 handler の intent と2タグ、結果文字列、不要RPCなしを検査。
- 実プレイの通常敗北、永続 snapshot、再読み込み、同一 finish payload 再送の既存検査は別 context のまま保持。
- screenshot は対象ボタンへスクロールした時点の証拠。全画面の文字欠け無し・初期 viewport 常時表示・iPhone実機の成功とは主張しない。
- unit・syntax はローカルでも検査。ローカル Vite build は OS Killed、CI の build 成功と区別。

## 保持した仕様と未完了
- 採点、時間、敵、カード、4wave、参加者、start/finish、DB、音設定、保存キー、匿名開始は変更しない。
- 共有本文に正式名タグ `#マスメン` と `#ゲーム制作` を付ける。既存の翻訳・今回結果・正式URLは維持。独立したコピー操作は元から無いため、削除実績は主張しない。X失敗時のコピー/テキスト代替は維持。
- サムネイルは通常のカード選択→戦闘から取得した WebKit canvas を利用。名前・HP・score 等 HUD は含めず、盤面を比例配置し題字・既存説明を添えた紹介画像。ゲーム画面そのものではなく、実画面素材による紹介構成。
- 本番配備、Xカード取得結果、実機Safari、翻訳母語評価、実際の音、既存の参加者識別問題は本差分で完了にしない。
- 試験は外部通信を拒否、localhost GET/HEAD のみ許可、redirect 拒否、WebSocket close、Service Worker block、明示RPC fixtureのみ。実ランキングへの登録や投稿はしない。

## サムネイルの由来・設定

- 原素材: CI `41410912916` / head `85c4cec476ae971f46d529cd16c2576e2933ccb1` の `webkit-thumbnail-canvas.png`。1200×800、84,156 bytes、SHA-256 `a3a39b2f56b2a7b5d766a42e4d57c19c24492b9699bd16bf14bc3354bf47981d`。
- 実ゲームの青・橙の盤面、シアンの操作体、黄の盾を持つ敵と球形の敵を使用。描き足しや架空のルール表現はない。`docs/share-assets/masumen-og-v1.svg` に原 PNG 全体を埋め込み、切り出しと比例配置・題字を定義。元ゲーム画像には手を加えない。
- 完成 PNG: CI `41413476636` / head `66ccbd0f62ee60278af1045239227fba199dd899` の WebKit 構成。`client/public/assets/masumen-og-v1.png`、1200×630、SHA-256 `fd07c740e5290cdc46dcb9a1374f94e96df5c37715147e09dfd675f428c14abb`。文字・盤面・キャラクターの切れ、不要 HUD の不在を作業担当と独立レビューで実見した。
- canonical / OG / Twitter は正式なゲームページと上記 PNG に統一。SNS は同じ正式リンクから画像を参照する。X 側のキャッシュ・カード表示の実確認は公開後であり未実施。
- 素材 SVG は docs 内のみ、静的公開対象は `dist/public`。PNG が同じビルドに入り 1200×630 であることを `audit:build-output` で検査する。既存画像・保存データを削除しない。

## 検証失敗の履歴と解決範囲

- `41407146305`: 新 home 可視検査で 42px を発見。最小 CSS 修正後 `41408371431` で両 engine 成功。
- `41410181307`: 新素材工程前、旧 WebKit テストのローカル静的 GET が ECONNRESET。製品通信の失敗とは区別。guard を通過した同一 localhost の GET/HEAD のみ Playwright `maxRetries:2` を適用、外部・POST・redirect は引き続き拒否。上限超過は失敗のまま。`41410912916` で成功。
- `41412364801`: 結果 X の前のタップからの transform 復帰中に 43.999114px を計測。44px 条件を緩めず、対象/祖先の有限 running/pending animation 終了と rect 3観測一致を最大120 RAFまで待つよう検査のみ修正。強制 finish/cancel やゲーム時間の変更なし。安定待ち失敗にも PNG と rect/animation 情報を残す。抽出関数のローカル VM 検査: 静止3 / 有限transition9 / 無限animation除外3 / 動き続ける場合120で失敗、4ケース成功。
- `41413476636`: 上記修正後の unit303、型・監査・build、Chromium/WebKit の旧検査と新15言語 X可視性・実敗北復元・同ID再送・素材構成すべて成功。**この head は最終 OG 設定前**。最終設定 head の CI は PR に別記し、先行成功を転記しない。
- 画像設定検査は canonical/PNG 未設定で2件 RED→実PNGと設定後 GREEN。対象 URL・MIME・寸法・実PNG signature・build配備対象を検査。
- [Playwright route.fetch の maxRetries](https://playwright.dev/docs/api/class-route#route-fetch-option-max-retries) は v1.46 以降の ECONNRESET 限定、HTTP status は再試行しない。使用版は既存1.62.1（2026-11-02確認）。

## 未解決の描画候補（共有受入とは別）

Chromium の隔離実戦画像では操作体スプライト位置に黒矩形が複数回現れた。WebKit は正しい操作体を表示。headless 環境が原因とは断定しない。

同一 head の読取診断では両 engine とも texture ready、size/baseSize 150×150、hasAlpha/useAlphaFromDiffuseTexture true、alphaMode 2。別2D canvasで SVG を decode した統計も同値（透明9,572 / 不透明6,013 / 彩色4,404 pixel）。Chromium のみ texture-upload-warning を観測。警告生文やURLqueryを保存せずカテゴリだけ記録した。WebGL アップロード経路が候補だが根因未確定。実 Chrome / iPhone 実機は未確認。今回の共有用 PNG が正しくても、この描画問題を解決済みとしない。次は同一素材の upload 条件・GPU/WebGL 診断を安全な隔離環境で比較し、原因確定後に別の最小修正を検討する。

## マージ後の確認と戻し方

1. 本人が Draft の差分・最終 CI を確認してマージ。変更中に本番配備は行わない。既存の main 配備 workflow は変更しない。
2. 正式ページで配備 commit を確認し、ホーム/結果の X と2タグ・正式 URL、PNG URL の200/MIME/寸法、OG/Twitter を読み戻す。投稿は本人が確定する。
3. iPhone Safari 実機で縦横・短い画面から X にスクロールして到達できること、長い言語でもラベルが欠けないこと、X画面から復帰して記録が変わらないことを確認する。本番で試験得点は送らず、必要な通信検査は隔離 fixture を使う。
4. 不具合時はこの変更を revert する PR で元のコード/画像設定へ戻す。DB・名前・言語・音・自己ベストの消去は不要。旧正常版と本書の素材は保持する。

# Cloudflare Workers + D1 対応・適用手順

## 最新追記：GitHub復旧待ち

ユーザー環境ではWrangler4.158.0を導入し、default-only entry修正後の実ローカル起動と編集/閲覧を確認済みです。CLIで既存Workerへ公開する承認はありますが、親環境はCloudflare認証待ちです。この準備担当はremote/公開を行っていません。以下に残る「Wrangler未導入」「実ローカル未検証」は初期移植時の記録として扱ってください。最新のリリース手順とWorkers Builds連携は [GITHUB-RECOVERY.md](GITHUB-RECOVERY.md) です。

## 実装状況

Worker/D1 RepositoryとAPI、public静的資産、設定、read-only移行ツールを用意しました。**デプロイとリモートDB操作は実行していません。** 今回確認できたのはNodeSQLiteによるD1互換shimであり、実Wrangler・workerd・Miniflare・Cloudflare D1での動作成功とは区別します。

元の C:\ESD\ai\task2026 は書込範囲外のため未変更です。成果物は許可済みTEMPコピーにあります。正式先へ適用する場合はユーザーがコード更新パッケージを展開してください。元のdataフォルダはコピー・変更・削除しません。

## 設定済みの識別情報

| 項目 | 値 |
|---|---|
| Worker | task-management-api |
| D1 | task-management-db |
| database_id | 81918d83-4f0e-4827-baa6-042b890efeeb |
| binding | DB |
| ASSETS | public/ の9ファイルのみ |

これらはユーザー指定のリソース識別子で、編集/閲覧の秘密トークンではありません。Cloudflare APIトークン等の認証情報はソースへ記載しません。既存roomsは作成済みのため、schema.sqlは参考です。本番へ自動適用しません。

wrangler.jsoncはworkers_dev:trueで既存workers.dev URLを維持する意図です。実際の既存ルート、カスタムドメイン、アカウントをデプロイ前に確認してください。preview_urls:false、observability/logs/invocation_logs:false。独自ドメインや料金プランは変更しません。

## ローカル検証

1. Node.js 24.22.1で `npm test`。外部依存は不要です。
2. `npm run worker:preview-shim` で http://127.0.0.1:4182 。これはインメモリNodeSQLite shimで、終了時にプレビューデータが消えます。実DBへは接続しません。画面のD1表記は配信後の見た目を確認するためです。
3. 本物Wranglerが利用できる環境では、利用者が `npm install --save-dev wrangler@4` でCloudflare公式CLIを開発依存として準備します。package.jsonにdevDependenciesはないため、単にnpm installするだけではWranglerは入りません。今回の環境にはWrangler/npm/npxがなく、ネットワーク経由の追加取得も実施していません。
4. 本物ローカルD1の初期化は `npx wrangler d1 execute task2026-local-only --config wrangler.local.jsonc --local --file schema.sql` 。**--localを省略しないでください。** このコマンドは今回未実行です。
5. `npx wrangler dev --config wrangler.local.jsonc --local` で確認。新規ルーム、独立ブラウザの閲覧、保存と更新、再発行、旧リンクの拒否、履歴記録を確認します。必要ならCPU/メモリやD1の制限も本物環境で測定します。
6. `node tools/check-deployment-config.mjs` は識別子の確認だけです。デプロイはしません。空欄/プレースホルダのままなら停止します。

設定スキーマはインストール済みWranglerの現物では未検証です。公式ドキュメントの設定に基づき、compatibility_date:2026-11-08、assets.run_worker_first:true、assets.html_handling:noneを用いています。

## 非破壊データ移行

**現在のSQLiteデータは成果物に含めていません。移行を自動で行いません。** デプロイ前に移行が必要か、既存D1に既に同じroomsデータがあるかを判断してください。

1. 元アプリの書込を一時停止し、SQLiteのバックアップを利用者が保管します。exportツール自体はread-onlyです。
2. `node tools/export-rooms.mjs "元のDBパス\app.sqlite" "private-exports\rooms.rooms-export.json"` 。ID・state文字列・edit_hash・view_hashだけを読み取ります。元DBは変更しません。出力は既存ファイルを上書きしません。
3. JSONと、90,000bytes以内なら単一SQLを出力します。stateには業務内容が含まれるため、**privateファイル**として保管し、publicやGit、共有資料へ入れないでください。編集/閲覧トークンの原文は出力しません。state内にtoken/secret等の項目があれば処理を停止します。
4. 移行先で事前に `PRAGMA table_info(rooms)` とインデックスを確認し、4カラム・state/edit_hash/view_hashのNOT NULL・ID主キー・両hash列のUNIQUEが既存定義と一致することを確認します。ツールのsource側検証だけではremote定義の保証になりません。
5. 出力SQLは**一つのINSERT文**です。全値一致のIDはWHERE条件が偽になり更新されません。相違するIDはstate=NULLを試みてNOT NULL違反となり、単一文全体が中止されます。別IDのhash衝突もUNIQUE違反で全体を中止します。上書き・REPLACE・IGNOREは使いません。
6. 同梱の架空fixtureでno-op/衝突時の全体中止を検証済み。本物のローカルD1へ先に試し、件数と値を確認してください。
7. remote importは別途判断後に利用者が手動で行います。必要な場合のコマンド例は `npx wrangler d1 execute task-management-db --config wrangler.jsonc --remote --file "private-exports\rooms.rooms-export.sql"` 。**今回未実行**です。旧データを削除するDROP/REPLACE/ALTERは実行しません。

大きいexportはJSONだけ出力し、自動importをサポートしません。分割すると全体の原子性が失われるため、勝手に分割・複数batchへ移し替えないでください。別途安全な移行設計が必要です。

## リンク維持

stateとhashを移行すれば秘密は同じなので、旧リンクの**ホスト部分だけ**を新しい公開URLに変更し、/room#以降のfragmentをそのまま保つと同じ権限で利用できます。ハッシュだけから元のリンクを復元することはできません。旧リンクの実ホストからのリダイレクトは今回未実装です。

sessionStorage/localStorageはオリジンごとに分かれます。既存ブラウザ試作の/demoも残しますが、別ホストへブラウザ保存内容が自動移行することはありません。秘密リンクをログ、解析、スクリーンショットへ載せないでください。

## デプロイ判断

ユーザーは「まずlocal環境で動作確認、問題なければdeploy」と指示しています。親担当/ユーザーが本物ローカル検証とCloudflare認証・権限を確認してから、必要な場合だけ `npx wrangler deploy --config wrangler.jsonc` を手動実行します。自動deploy scriptはありません。今回はWrangler未導入でこの工程へ進んでいません。

無料枠で利用できる標準的なWorkers/D1構成を意図していますが、既存アカウントのプラン、残りクォータ、実CloudflareのCPU時間は今回測定していません。コードが無料枠に必ず収まる、追加費用が絶対に発生しないとは断定しません。

## セキュリティと制約

- WorkerはWebCrypto/TextEncoder/Request/Responseのみ。Node http/fs/sqliteはローカル用ツールと既存Node版だけです。
- トークンは256bit乱数→SHA-256。DBにはhashのみ。閲覧レスポンスと履歴に編集秘密は入りません。
- 書込はstateの文字列全体と両hashを比較する単一CAS。競合は409、再発行された編集リンクは401。Node版のBEGIN/COMMITは移植していません。
- 保存・履歴3回の間引き・両hash再発行は一つのUPDATEで確定し、失敗時は以前の行を保持します。
- API本文262,144bytes、UTF-8をストリーム連結後に検証。HTTPSを含むsame-origin確認、CSP、no-referrer、no-store。
- public以外は配信せず、ASSETSへの内部取得にAuthorization/Cookie/queryを引き継ぎません。
- consoleへリクエスト、本文、トークン、SQL、エラー詳細を出しません。第三者解析は入れません。
- Cloudflare全体やブラウザ拡張の記録までゼロ保証はしません。リンク所有者はアクセスできる方式であり、アカウント認証を追加したものではありません。

参考：[Static assets binding](https://developers.cloudflare.com/workers/static-assets/binding/)、[D1 return object](https://developers.cloudflare.com/d1/worker-api/return-object/)、[Workers logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)、[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)。

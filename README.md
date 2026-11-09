# aitask2026
AI駆動開発・タスク管理ツール

# 目標管理アプリ — Cloudflare Workers + D1対応

## 最新状況：GitHub復旧待ちの準備

ユーザー環境の実Wranglerローカル起動・編集/閲覧確認は完了しています。既存WorkerへのCLI公開はユーザー承認済みで、親担当がCloudflare認証と公開を担当します。以下に残る「CLI未導入」「実ローカル未検証」は初期移植時の記録です。

GitHubの復旧を待つ間の安全な準備と、復旧後のWorkers Builds設定は [GITHUB-RECOVERY.md](GITHUB-RECOVERY.md) を参照してください。実行する準備は `node tools/prepare-release.mjs`、公開するときだけ `node tools/deploy-existing-worker.mjs --deploy`。この補助作業自体はデプロイ・push・データ移行を実行していません。

既存の画面・配色・操作と、リンクを知る人が編集/閲覧する方式を維持したWorkers移植版です。ログインや管理者アカウントは追加していません。roomsは既存の4カラムのみ、state JSONの形式・内容も維持します。

## 現在の状態

- Worker/D1 API、公開資産の分離、設定、非破壊移行ツールを実装。
- 既存機能・NodeSQLite D1互換shim・手動適用helperの**29テスト成功**。
- 同じ互換bridgeのブラウザでルーム作成→独立contextの編集/閲覧→目標/タスク保存→閲覧更新→完了/達成承認→1on1記録→履歴閲覧を確認。閲覧tokenの直接保存APIは403、編集UIはありません。背景色RGB(9,13,25)も維持しています。
- **本物のWrangler/workerd/Miniflare/D1では未検証。デプロイ・remoteDB操作は未実行。** この環境にはWrangler/npm/npxがなく、ネットワーク経由の追加導入は行っていません。
- 正式先 C:\ESD\ai\task2026 は書込範囲外のため未変更。今回の成果物は許可されたTEMPコピーです。元DBや個人データは含めていません。

## ローカルで確認する

Node.js 24.22.1で確認済み。追加依存なしで次を実行できます。

1. `node tools/build-assets.mjs`
2. `node --test tests/*.test.mjs`
3. `node tools/preview-worker-shim.mjs` → http://127.0.0.1:4182

3は実Cloudflareではなく、NodeSQLiteをD1 APIへ合わせたローカルbridgeです。プレビューデータは終了すると消えます。画面のD1表記は配信時の環境説明を確認するためで、実D1接続済みという意味ではありません。

従来のNode版は `node server.mjs`、ブラウザ内保存の旧試作は `/demo` です。ルートHTML/CSS/clientJSは正本からバイトコピーし変更していません。Workers配信でだけ保存先の環境説明を置換します。

## デプロイと移行

詳しくは [DEPLOYMENT.md](DEPLOYMENT.md)。ユーザー指定のWorker名task-management-api、D1名task-management-db、binding DB、database_idをwrangler.jsoncへ設定済みです。設定確認だけなら `node tools/check-deployment-config.mjs`。

本物のCLIがある利用者環境で `npm install --save-dev wrangler@4` を行ってから、ローカルD1初期化と `wrangler dev --local` を確認してください。package.jsonには自動ダウンロード依存やdeploy scriptを入れていません。

ユーザーは「localで問題なければdeploy」と指示しています。親担当/ユーザーが本物環境での確認と認証・権限を確認してから判断します。現環境のshimテストだけを実Cloudflare成功とみなして本番へ進めていません。

既存SQLiteを移す場合は明示的なread-only exportを使用します。元DBを自動操作せず、同一ID/同一値はno-op、異なる既存値は単一SQL全体を中止。大きなJSONの自動移行は未対応です。秘密リンクの原文はDBにもexportにも保存しませんが、stateの業務内容はprivate情報として扱ってください。

## 構成

- `worker/index.js`：Web標準のfetchハンドラ。APIとASSETSを経路制限付きで配信。
- `worker/d1-repository.js`：WebCryptoとD1単一SQL CAS。Node依存なし。
- `worker/rules.js` / `domain.js`：既存と同じ業務ルール。
- `public/`：ホワイトリストの9資産だけ。DB/docs/tests/serverは配信しない。
- `wrangler.jsonc`：既存Worker/D1向け設定。ログ無効、workers.dev維持。
- `wrangler.local.jsonc`：実D1に触れないローカルCLI確認用。
- `schema.sql`：既存roomsと同じ参考定義。自動実行しない。
- `tools/export-rooms.mjs`：read-only export。private出力、上書き禁止。
- `tests/worker.test.mjs` / `tests/d1-shim.mjs`：実D1とは区別した互換テスト。

stateの履歴は最新3回に保持し、記録・間引き・リンク再発行は一つのUPDATEのCASで確定します。競合は409、失効リンクは401、閲覧による更新は403。意図しないログ/秘密をレスポンスへ出しません。無料枠の標準構成を意図しますが、実アカウントの料金プラン・クォータ・CPU使用量は未確認です。

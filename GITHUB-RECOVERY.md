# GitHub復旧までのリリース準備と、復旧後のWorkers Builds接続

## 今回の状態

アプリのHTML/CSS/clientJS、Worker業務コード、Wrangler設定、package.json、package-lock.jsonは変えていません。GitHubへのpush、remote登録、リポジトリ作成、デプロイ、D1の移行/削除はこの準備では行いません。

最新のユーザー指示では既存WorkerへのCLI公開は承認されています。ユーザー環境では実Wranglerローカル起動と編集/閲覧を確認済みです。親の実行環境ではCloudflare whoamiが未認証であり、認証を確認してから親が公開を担当します。GitHub 504が解消するまで待つ必要があるのはGitHub連携であり、CLI公開にGitHubは必要ありません。

## GitHubなしでできること

1. Gitがまだ未初期化なら利用者がプロジェクトで `git init` 。これはローカル操作でGitHubには接続しません。今回の監査はTEMPコピーだけで初期化しています。
2. `node tools/prepare-release.mjs` で設定、public資産ビルド、Worker entry、既存テスト、固定依存のallowScripts、Git候補を確認。ネットワーク・インストール・push・DB操作・公開はしません。詳細候補は無視対象の `reports/release-readiness.json` です。
3. 認証と実ローカル動作を確認し、既存Workerへ公開する段階でだけ `node tools/deploy-existing-worker.mjs --deploy` 。引数を省略するとローカル準備だけです。公開処理は親担当/ユーザーが実施します。この資料の準備中は実行していません。
4. 公開後の架空ルームで編集/閲覧、保存/更新、達成/履歴、再発行と旧リンク拒否を確認します。既存データの変更や削除を検証に使わないでください。

手動helperはローカルにインストールされたWranglerだけを直接実行します。既存Worker名/D1指定が変わっていれば停止し、DB作成・移行・削除コマンドは含めません。公開URLや動作結果は実行担当が別途確認します。

## 固定依存とビルドスクリプト

現在のlockはWrangler **4.158.0**、esbuild **0.28.2**、workerd **1.20261104.1**。package.jsonのWrangler指定は^4.158.0ですが、`npm ci` は同梱lockの固定版を使います。package.jsonとlockは両方commitしてください。今回どちらも変更していません。

既存のallowScriptsは `esbuild@0.28.2: true` と `workerd@1.20261104.1: true` を維持します。Cloudflare側のnpmインストーラーでスクリプトが制限される場合も、この固定2依存だけを許可してください。全面的なallow-allやignore-scriptsで回避せず、バージョン更新時はlockと許可対象を一緒に確認します。npmバージョンごとのallowScripts対応もBuildログで確認してください。

## GitHub復旧後の接続

1. 利用者がGitHubリポジトリを作る/既存を選び、監査したコードとpackage-lockをcommit/pushします。今回はremoteもpushも実行していません。
2. Cloudflareの**既存 task-management-api**でWorkers Buildsを接続し、対象リポジトリと公開ブランチを指定。新しいWorkerを重複作成しません。
3. プロジェクトがリポジトリのルートにある場合のBuild rootはルート。サブフォルダなら実際のプロジェクト位置へ合わせます。
4. Build command：`npm run worker:assets`
5. Deploy command：`npx wrangler deploy --config wrangler.jsonc`
6. Workers Buildsはwrangler.jsoncのcustom buildを実行しないため、4を明示します。依存インストールはpackage-lockに従うnpm ciを用い、Buildログで固定Wranglerを使っていることを確認します。既存Worker/D1 bindingとログ設定も確認してください。

GitHub Actionsは追加していません。Cloudflare Workers Buildsだけで連携できます。GitHubやnpm registryの資格情報をコードに書かず、必要な権限はCloudflare側の連携設定へ与えます。既存D1はそのまま使用し、GitHub接続にデータ移行は不要です。

## commitしないもの

.gitignoreで.env/.dev.vars、DBとWAL/SHM、キー、exports/backups、修復ZIP、ログ/telemetry、レポート/スクリーンショット、node_modules/.wranglerを除外します。rootの安全な.env.example/.dev.vars.exampleだけは例外ですが、実値を入れないでください。schema.sql、tests、Workerソース、apply-update.ps1、lock、Wrangler設定は残します。

`node tools/git-audit.mjs` は実Gitの候補一覧・除外規則を確認し、秘密らしい値や業務JSONを検出した場合は**値を出さずパスと種類だけ**を報告します。既に追跡済みの秘密は.gitignoreだけでは消えないため、検出時は停止します。機械検査はあらゆる文章中の機密を保証するものではありません。報告された全候補を人も確認してください。

今回のGit initはTEMPコピーのみ、global Gitconfig変更なし、push/remote作成なしです。

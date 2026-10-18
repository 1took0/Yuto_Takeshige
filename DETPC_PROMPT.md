# det-pc の Claude に渡すプロンプト

以下を det-pc 上の Claude（Claude Desktop、または対象フォルダで起動した Claude Code）にそのまま貼り付けてください。

---

GitHub リポジトリ `1took0/Yuto_Takeshige` のブランチ `claude/command-output-japanese-0x87pz` にある `training-app/`（Next.js 16 の個人用トレーニング管理 PWA）を、Vercel の無料 Hobby プランに公開して、iPhone から別の Wi-Fi やモバイル回線でも使えるようにしてください。

前提と制約:
- 有料プランや課金が発生する設定は一切使わないでください。Hobby（無料）プランのみです。課金が必要になりそうな場面があれば、実行前に止めて私に確認してください。
- アプリは外部の有料 API を使いません。設定する環境変数は `APP_PASSWORD`、`OWNER_RESTORE_CODE`、記録共有用の Upstash Redis（無料プラン）の接続情報だけです。
- Vercel や GitHub へのログイン・認可など、私の操作が必要な場面ではその都度手順を示して待ってください。パスワードやトークンをチャットに貼らせないでください。

手順:
1. Vercel プラグインを追加する。`npx plugins add vercel/vercel-plugin` を実行し、失敗した場合は Claude Code の `/plugin` から Vercel の公式プラグインを探して追加する。どちらも使えなければ `npx vercel` の CLI で代替してよい。
2. リポジトリを取得する（既にあれば `git fetch` して上記ブランチを checkout し、最新にする）。
3. `training-app/` で `npm ci` と `npm run build` を実行し、ローカルでビルドが通ることを確認する。
4. Vercel にログインし（ブラウザ認証は私が行います）、`training-app/` をプロジェクトとして作成・リンクする。
   - Root Directory: `training-app`
   - Framework: Next.js
   - Production Branch: `claude/command-output-japanese-0x87pz`
   - GitHub 連携を有効にし、このブランチへの push で自動デプロイされるようにする
5. 環境変数 `APP_PASSWORD`（利用者全員で共有するパスワード）と `OWNER_RESTORE_CODE`（私の過去の記録を取り込むための、私だけが知るコード。APP_PASSWORD とは別の値）を Production に設定する。値は私に入力させてください（`vercel env add APP_PASSWORD production` のように、対話入力で私が直接打ち込む形にする）。
6. 記録共有の保存先として、Vercel の Storage / Marketplace から **Upstash for Redis** を **Free プラン**で作成し、このプロジェクトに接続する。
   - 有料プラン（Pay as you go / Fixed など）は選ばないこと。Free 以外しか選べない場合は止めて私に確認すること。
   - 接続後、環境変数に `KV_REST_API_URL` と `KV_REST_API_TOKEN`（または `UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN`）が追加されたことを `vercel env ls` で確認する。値は表示しないこと。
7. 本番デプロイを実行し、発行された `https://〜.vercel.app` の URL を教えてください。
8. 動作確認として次を curl などで確かめ、結果を報告してください。
   - `/` がログイン画面（`/login`）にリダイレクトされる
   - `/manifest.webmanifest` と `/sw.js` が 200 を返す
   - 誤ったパスワードで `/api/login` に POST すると 401 になる
   - 未ログインで `/api/share/status` が 401 になる
   - 正しいパスワードでログインした Cookie を使うと `/api/share/status` が `{"enabled":true}` を返す（パスワードは私に入力させること）
9. 最後に、次を短くまとめてください。
   - 私の iPhone での初回手順：Safari で URL を開く → パスワード入力 → 「はじめに」で表示名・目標を設定し「記録を共有する」をオン → `https://〜.vercel.app/restore` を開いて復元コードを入力 → 共有ボタン → ホーム画面に追加
   - 他の人を招待するときに伝えるもの：URL と APP_PASSWORD だけ（復元コードは伝えない）

詳細な手順は `training-app/README.md` の「外出先（別の Wi-Fi / モバイル回線）から使う」にあります。

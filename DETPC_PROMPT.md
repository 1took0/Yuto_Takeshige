# det-pc の Claude に渡すプロンプト

以下を det-pc 上の Claude（Claude Desktop、または対象フォルダで起動した Claude Code）にそのまま貼り付けてください。

---

GitHub リポジトリ `1took0/Yuto_Takeshige` のブランチ `claude/command-output-japanese-0x87pz` にある `training-app/`（Next.js 16 の個人用トレーニング管理 PWA）を、Vercel の無料 Hobby プランに公開して、iPhone から別の Wi-Fi やモバイル回線でも使えるようにしてください。

前提と制約:
- 有料プランや課金が発生する設定は一切使わないでください。Hobby（無料）プランのみです。課金が必要になりそうな場面があれば、実行前に止めて私に確認してください。
- アプリは外部の有料 API を使いません。設定する環境変数は `APP_PASSWORD` だけです。
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
5. 環境変数 `APP_PASSWORD` を Production に設定する。値は私に入力させてください（`vercel env add APP_PASSWORD production` のように、対話入力で私が直接打ち込む形にする）。
6. 本番デプロイを実行し、発行された `https://〜.vercel.app` の URL を教えてください。
7. 動作確認として次を curl などで確かめ、結果を報告してください。
   - `/` がログイン画面（`/login`）にリダイレクトされる
   - `/manifest.webmanifest` と `/sw.js` が 200 を返す
   - 誤ったパスワードで `/api/login` に POST すると 401 になる
8. 最後に、iPhone でホーム画面に追加する手順（Safari で URL を開く → パスワード入力 → 共有ボタン → ホーム画面に追加）を短くまとめてください。

詳細な手順は `training-app/README.md` の「外出先（別の Wi-Fi / モバイル回線）から使う」にあります。

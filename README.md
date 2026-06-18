# 保有株 ぜんぶ一括ビュー（自前アプリ版）

保有株をまとめて、**損益・配当利回り・構成比**を一画面で確認できるWebアプリです。
「更新」ボタンを押すと、登録した銘柄の**最新株価をサーバー側で取得**して反映します。

> ⚠️ 価格について：標準のデータ元（Yahoo Finance の公開エンドポイント）は
> **約15〜20分遅れ**（市場が閉まっている時は直近の終値）です。秒単位のリアルタイムや
> 「証券口座まるごと自動取り込み」には対応していません（それには有料データや
> 証券会社のAPIが必要です）。投資判断はご自身で行ってください。

---

## 1. 準備（最初の1回だけ）

1. **Node.js** を入れる … <https://nodejs.org/> から「LTS」をダウンロードしてインストール。
2. インストール確認 … ターミナル（Macは「ターミナル」、Windowsは「PowerShell」）で:
   ```
   node -v
   ```
   `v18` 以上の数字が出ればOK。

## 2. 動かす

ダウンロードしたフォルダ（`stock-portfolio`）の中で、ターミナルから順に実行:

```
cd stock-portfolio
npm install
npm run dev
```

ブラウザで **http://localhost:3000** を開くとアプリが表示されます。
（`npm install` は最初の1回だけ。次回からは `npm run dev` だけでOK。停止は Ctrl + C）

## 3. 使い方

1. 「最初の銘柄を追加」または「サンプルを入れて試す」。
2. 各銘柄に **ティッカー** を入れると更新対象になります。
   - 東証の株 … 証券コード + `.T` 例）トヨタ `7203.T` / 三菱UFJ `8306.T` / NTT `9432.T`
   - 米国株 … そのまま 例）`AAPL` `MSFT`
3. 上部の **「更新」** ボタンで最新株価を取得 → 各銘柄の「現在値」が上書きされます。
4. データはこのブラウザに自動保存されます（別の端末には引き継がれません）。

## 4. ネットに公開する（無料・任意）

外出先のスマホからも使いたい場合は **Vercel**（無料）に置くのが簡単です。

**かんたんな方法（コマンド1つ）:**
```
npm install -g vercel
vercel
```
質問にEnterで答えていくと、`https://〜.vercel.app` のURLが発行されます。

**GitHub経由の方法:** このフォルダをGitHubにアップ → <https://vercel.com> で「Import」→ そのままデプロイ。

---

## データ元を変えたいとき

価格の取得は `app/api/quote/route.js` の中だけで完結しています。
Yahoo が使えない／別の精度が欲しい場合は、ここの取得処理を差し替えます。

- **Stooq（無料・APIキー不要・日次/終値中心）**
  例: `https://stooq.com/q/l/?s=7203.jp&f=sd2t2ohlcv&h&e=csv` を取得してCSVを解析。
  東証は `.jp` を付けます（例 `7203.jp`）。
- **J-Quants（JPX公式・無料登録でキー取得・無料枠は遅延あり）**
  <https://jpx-jquants.com/> 公式データ。キーは必ず `process.env` に入れ、コードに直接書かないこと。
- **Alpha Vantage / Twelve Data など（商用・無料枠は回数制限）**
  APIキーが必要。`.env.local` に `MY_API_KEY=...` のように置き、`process.env.MY_API_KEY` で読みます。

> セキュリティ：APIキーは必ずサーバー側（このAPIルート）でだけ使い、画面側（page.jsx）には書かないでください。

---

## 構成

```
stock-portfolio/
├─ app/
│  ├─ page.jsx            画面本体（保有株・損益・配当・構成比・更新）
│  ├─ layout.jsx          全体レイアウト・フォント
│  ├─ globals.css         スタイル
│  └─ api/quote/route.js  株価取得（サーバー側）
├─ package.json
├─ tailwind.config.js
├─ postcss.config.js
└─ next.config.mjs
```

困ったら（`npm install` でエラー、更新が効かない、Vercelで詰まった等）、エラーメッセージをそのまま貼ってくれれば一緒に直します。

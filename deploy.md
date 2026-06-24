# RailScope — デプロイ手順（$0）

RailScope は Next.js の static export（`out/` に静的 HTML/CSS/JS を書き出す）で配信する。
サーバランタイム不要・無料ホスティングで完結する。

- **推奨: GitHub Pages**（完全無料。リポジトリがあれば追加課金なし）
- **代替: Cloudflare Pages**（無料枠で `out/` をそのまま配信できる）

サーバランタイムを前提とするホスティングは不要。

## ビルド（共通）

```bash
pnpm install
pnpm build      # next build → static export で out/ を生成
ls out/index.html
```

`out/` の中身がそのまま配信物。サーバプロセス（`next start`）は使わない。

## 第一候補: GitHub Pages（$0）

### ローカル確認

```bash
pnpm build
npx serve out          # http://localhost:3000 で out/ を配信して確認
# もしくは: python3 -m http.server -d out 3000
```

### GitHub Actions で自動デプロイ

リポジトリの Settings → Pages → Build and deployment → Source を **GitHub Actions** にする。
その上で `.github/workflows/pages.yml` を以下の内容で追加する（このプロダクトのリポジトリ側に置く）。

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### サブパス配信に注意（`<user>.github.io/<repo>` で公開する場合）

ユーザー/組織ページ（`<user>.github.io`）やカスタムドメインのルート配信なら設定不要。
**プロジェクトページ（`<user>.github.io/railscope/` のようにサブパス配信）の場合のみ**、
`next.config.mjs` に `basePath` / `assetPrefix` を足す。

```js
const repo = "railscope";
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: `/${repo}`,
  assetPrefix: `/${repo}/`,
};
```

カスタムドメイン（独自ドメインのルート）に載せるなら `basePath` は不要。
独自ドメインの取得・更新費用は別途発生する点に注意（ドメイン費は $0 ではない）。

## 代替: Cloudflare Pages（無料枠）

Cloudflare Pages の無料枠でも `out/` をそのまま配信できる。

```bash
pnpm build
# Cloudflare ダッシュボードの Pages から「Direct Upload」で out/ をアップロード、
# もしくは GitHub 連携でリポジトリを指定し、ビルドコマンド `pnpm build`・出力ディレクトリ `out` を設定する。
```

Wrangler を使う場合:

```bash
npx wrangler pages deploy out --project-name railscope
```

## やらないこと

- サーバランタイム前提のデプロイ（`next start` / SSR 常駐プロセス）
- 静的サイトに不要なバックエンド・データベースの追加

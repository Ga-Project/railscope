# RailScope — Rails スキーマ ER 図 & Lint

Rails の `db/schema.rb` をブラウザに貼るだけで、(1) ER 図（Mermaid テキスト）を生成し、(2) 本番でハマりがちなスキーマの地雷を lint 警告する、**サーバー送信なし・完全クライアントサイド**の開発者向けツール。

Next.js 14 (App Router) の静的サイト。static export（`out/` に静的書き出し）のためサーバランタイムが不要で、静的ホスティング（GitHub Pages 等）で配信できる。入力した schema.rb はサーバーに送信されず、すべてブラウザ内で処理するため、本番スキーマを安全に貼り付けられる。

## 機能

- **ER ビュー**: テーブル / カラム / 型 / PK・FK・索引・NOT NULL バッジを一覧表示。
- **Mermaid ER 図**: `erDiagram` テキストを生成（GitHub / mermaid.live にそのまま貼れる）。重い描画ライブラリは同梱せず、テキスト出力に徹する。
- **Lint（中核）**: Rails マイグレーション規約に基づく指摘。
  - 外部キー候補列の索引漏れ（`missing-fk-index`）
  - polymorphic 参照の `[type, id]` 複合索引漏れ（`polymorphic-missing-composite-index`）
  - `*_count`（counter_cache）の `default: 0` 漏れ
  - boolean の default 漏れ（3 値化）
  - `id: false` で主キー無し / NULL 許容 FK / FK 制約なし / 重複索引 / timestamps 不在

**対応入力は `schema.rb` 専用**。`structure.sql`（SQL ダンプ）のパーサは未実装で、貼り付けても解析しない（UI が「schema.rb を貼り付けてください」と案内する）。`structure.sql` 対応は今後の拡張予定。

## セットアップ & 開発

[pnpm](https://pnpm.io/) と Node.js 22+ が必要です。

```bash
./setup.sh                 # pnpm install
pnpm dev                   # http://localhost:3000（ホットリロード）
```

## ビルド（static export）

```bash
pnpm build                 # next build → out/ に静的 HTML/CSS/JS を生成
ls out/index.html          # 生成物の確認

./run.sh serve             # out/ をビルドしてローカル配信（http://localhost:3000）
```

`out/` がそのまま配信物。`next start`（サーバ常駐）は使わない。

## テスト

```bash
pnpm test                  # node --test（Node 標準ランナー）
```

## デプロイ

GitHub Pages に static export を配信できる。リポジトリの Settings → Pages → Source を **GitHub Actions** にし、static export を GitHub Pages（Actions）でデプロイする。具体的なワークフロー設定と手順は [`deploy.md`](./deploy.md) を参照。

## 構成

```
railscope/
├─ app/
│  ├─ page.tsx              # UI（入力→ER ビュー / lint / Mermaid・"use client"）
│  └─ layout.tsx            # アナリティクスのスロットをコメントで用意（任意で有効化）
├─ lib/                     # 純粋ロジック（ブラウザ/テスト共用の .mjs）
│  ├─ parse-schema-rb.mjs   # schema.rb パーサ
│  ├─ lint.mjs              # Rails スキーマ lint ルール（中核）
│  ├─ mermaid.mjs           # Mermaid erDiagram テキスト生成
│  ├─ sample.mjs            # デモ用 schema.rb
│  └─ types.ts              # 型定義（型のみ）
├─ public/                  # 静的アセット置き場
├─ test/                    # node:test ユニットテスト（parser / lint / mermaid）
├─ next.config.mjs          # output: "export"（static export 設定）
├─ tsconfig.json            # TypeScript 設定（Next.js / static export 向け）
├─ deploy.md                # デプロイ手順（GitHub Pages）
├─ secrets.age              # age 暗号文（静的サイトのため通常は空の暗号箱・コミット可）
├─ age.recipient            # age 公開鍵（コミット可）
└─ .env.age.example         # env テンプレ（実行時サーバ秘密は原則不要・実値は書かない）
```

## アナリティクス（任意）

`app/layout.tsx` に cookieless のアナリティクススロットをコメントで用意してある。
必要なら GoatCounter か Cloudflare Web Analytics のどちらか 1 つを有効化する。
公開タグは秘密ではないのでコード直書きで構わない。

## 秘密情報

static export は実行時サーバを持たないため、サーバ秘密は原則不要。
将来 env が必要になったときのために age による暗号化の枠組みだけ残してある（blast radius を最小化するための分離）。

- 公開鍵: `age.recipient`（コミット可）
- 復号鍵: `*.identity`（**repo 外**・コミット厳禁／`.gitignore` 済）
- 正本: `secrets.age`（暗号文・通常は空の `.env.age.example` を暗号化しただけ・コミット可）

## ライセンス

MIT License — [`LICENSE`](./LICENSE) を参照。

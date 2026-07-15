import type { ReactNode } from "react";
import type { Metadata } from "next";
import Script from "next/script";

// サブパス配信（<org>.github.io/railscope/）に合わせた URL 導出。
// BASE_PATH は next.config.mjs と同じ環境変数（Pages ビルドで /railscope）。
const basePath = process.env.BASE_PATH ?? "";
const SITE_URL = "https://ga-project.github.io/railscope/";
const OG_IMAGE = `${SITE_URL}og.png`;
const TITLE = "RailScope — Rails スキーマ ER 図 & Lint";
const DESCRIPTION =
  "schema.rb を貼るだけで ER 図を描画し、FK 未索引・NOT NULL 欠落・polymorphic 複合索引漏れなどを lint 警告する、サーバー送信なしの開発者向けツール。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "RailScope",
  keywords: [
    "Rails",
    "schema.rb",
    "ER図",
    "ERD",
    "lint",
    "マイグレーション",
    "Mermaid",
    "外部キー",
    "索引",
    "データベース設計",
  ],
  authors: [{ name: "Ga Project" }],
  alternates: { canonical: SITE_URL },
  icons: {
    icon: [{ url: `${basePath}/favicon.svg`, type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: SITE_URL,
    siteName: "RailScope",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "RailScope — Rails schema.rb から ER 図と lint を生成",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

// 構造化データ（JSON-LD）。検索エンジンにアプリの種別・無料・言語・機能を伝える。
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "RailScope",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description: DESCRIPTION,
  inLanguage: "ja",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
  featureList: [
    "schema.rb から ER 図（Mermaid erDiagram）を生成",
    "外部キー候補列の索引漏れを lint 警告",
    "polymorphic 参照の複合索引漏れを検出",
    "NOT NULL / default 欠落など Rails マイグレーション規約チェック",
    "完全クライアントサイド処理（スキーマをサーバーに送信しない）",
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {/* 構造化データ（JSON-LD） */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        {/*
          アクセス計測（GoatCounter・cookieless・秘密キー不要・サーバー送信なし）。
          集計サイト railscope.goatcounter.com は代表アカウントで作成する（人ゲート）。
          サイト未作成でも本タグは無害（count エンドポイントに届かないだけ）。
        */}
        <Script
          data-goatcounter="https://railscope.goatcounter.com/count"
          src="//gc.zgo.at/count.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}

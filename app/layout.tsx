import type { ReactNode } from "react";

export const metadata = {
  title: "RailScope — Rails スキーマ ER 図 & Lint",
  description:
    "schema.rb を貼るだけで ER 図を描画し、FK 未索引・NOT NULL 欠落・polymorphic 複合索引漏れなどを lint 警告する、サーバー送信なしの開発者向けツール。",
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
        {/*
          アナリティクス（任意・cookieless・秘密キー不要。必要なら1つ有効化）:
          (1) GoatCounter（GitHub Pages/汎用ホスティングで無料）
          <script data-goatcounter="https://__GC_CODE__.goatcounter.com/count" async src="//gc.zgo.at/count.js" />
          (2) Cloudflare Web Analytics（Cloudflare でホスティングする場合の選択肢）
          <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"__CF_BEACON_TOKEN__"}' />
        */}
        {children}
      </body>
    </html>
  );
}

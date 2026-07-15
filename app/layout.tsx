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
          アクセス解析: GoatCounter（cookieless・公開タグのため秘密キーではない）。
          プライバシー開示はフッター（app/page.tsx）と対で維持すること。
        */}
        <script
          data-goatcounter="https://railscope.goatcounter.com/count"
          async
          src="//gc.zgo.at/count.js"
        />
        {children}
      </body>
    </html>
  );
}

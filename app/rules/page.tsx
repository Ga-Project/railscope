import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/site.mjs";
import { RULE_GUIDES, ruleAnchor } from "@/lib/rule-guide.mjs";

// ルール解説ページ。結果一覧の各指摘から「なぜ？」で飛んでくる先であり、
// 「schema.rb 索引漏れ」のような検索から単独で読まれる入口でもある。
// 本文は lib/rule-guide.mjs にあり、例が lint と一致することはテストで保証している。

const PAGE_URL = absoluteUrl("rules/");
const TITLE = `Rails スキーマの地雷 ${RULE_GUIDES.length} 選 — RailScope の lint ルール解説`;
const DESCRIPTION =
  "外部キーの索引漏れ、polymorphic の複合索引漏れ、boolean の 3 値、counter_cache の NULL、重複索引など、schema.rb でよく見る問題を、なぜ困るのか・どう直すか（マイグレーション例つき）で解説します。";
const OG_IMAGE = absoluteUrl("og.png");

// ルート layout の canonical / og:url はトップを指すので、このページ自身の URL で上書きする。
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "article",
    locale: "ja_JP",
    url: PAGE_URL,
    siteName: "RailScope",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "RailScope" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

const SEVERITY = {
  warning: { label: "警告", color: "#fbbf24" },
  info: { label: "情報", color: "#60a5fa" },
} as const;

export default function RulesPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <nav
        aria-label="パンくず"
        style={{ fontSize: "0.85rem", marginBottom: 16 }}
      >
        <Link href="/" style={linkStyle}>
          RailScope
        </Link>
        <span style={{ color: "#94a3b8" }}> / lint ルール解説</span>
      </nav>

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.7rem", margin: 0, lineHeight: 1.35 }}>
          Rails スキーマの地雷 {RULE_GUIDES.length} 選
        </h1>
        <p style={{ color: "#cbd5e1", lineHeight: 1.8, marginTop: 10 }}>
          RailScope が schema.rb
          を点検するときのルールを、なぜ困るのか・どういう時に指摘するか・どう直すかの順に解説します。
          どれもテストでは見つかりにくく、データが増えてから効いてくる問題です。
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href="/" style={ctaStyle}>
            自分の schema.rb を点検する
          </Link>
        </p>
      </header>

      <section aria-labelledby="toc-heading" style={tocStyle}>
        <h2 id="toc-heading" style={{ fontSize: "1rem", margin: "0 0 8px" }}>
          目次
        </h2>
        <ol style={{ margin: 0, paddingLeft: "1.4rem", lineHeight: 1.6 }}>
          {RULE_GUIDES.map((g) => (
            <li key={g.id} style={{ marginBottom: 8 }}>
              <a href={`#${ruleAnchor(g.id)}`} style={linkStyle}>
                {g.title}
              </a>{" "}
              <SeverityBadge severity={g.severity} />
            </li>
          ))}
        </ol>
      </section>

      {RULE_GUIDES.map((g, i) => (
        <article
          key={g.id}
          id={ruleAnchor(g.id)}
          aria-labelledby={`${ruleAnchor(g.id)}-heading`}
          style={articleStyle}
        >
          <h2
            id={`${ruleAnchor(g.id)}-heading`}
            style={{ fontSize: "1.25rem", margin: "0 0 6px", lineHeight: 1.45 }}
          >
            {i + 1}. {g.title}
          </h2>
          <p style={{ margin: "0 0 14px", fontSize: "0.85rem" }}>
            <SeverityBadge severity={g.severity} />{" "}
            <code style={{ color: "#94a3b8" }}>{g.id}</code>
          </p>

          <h3 style={h3Style}>なぜ問題か</h3>
          <p style={bodyStyle}>
            <Inline text={g.why} />
          </p>

          <h3 style={h3Style}>RailScope が指摘する条件</h3>
          <p style={bodyStyle}>
            <Inline text={g.detects} />
          </p>

          <h3 style={h3Style}>指摘される例（schema.rb）</h3>
          <Code>{g.bad}</Code>

          <h3 style={h3Style}>直した後（schema.rb）</h3>
          <Code>{g.good}</Code>

          <h3 style={h3Style}>直すマイグレーションの例</h3>
          <Code>{g.migration}</Code>

          <h3 style={h3Style}>無視してよい場合</h3>
          <p style={bodyStyle}>
            <Inline text={g.ignoreWhen} />
          </p>

          <p style={{ margin: "14px 0 0", fontSize: "0.85rem" }}>
            <a href="#toc-heading" style={linkStyle}>
              目次へ戻る
            </a>
          </p>
        </article>
      ))}

      <p style={{ marginTop: 32, textAlign: "center" }}>
        <Link href="/" style={ctaStyle}>
          自分の schema.rb を点検する
        </Link>
      </p>

      <footer
        style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: "1px solid #1e293b",
          color: "#94a3b8",
          fontSize: "0.8rem",
          lineHeight: 1.7,
        }}
      >
        <p style={{ margin: 0 }}>
          解説とマイグレーション例は一般的な Rails
          の規約に基づく参考情報です。実際の
          データ量・データベースの種類・運用に合わせて、利用者ご自身で検証してから適用してください。
          &quot;Rails&quot; / &quot;Ruby on Rails&quot;
          は各権利者の商標で、RailScope
          はこれらの権利者と提携していない非公式ツールです。
        </p>
      </footer>
    </main>
  );
}

/** 解説文中の `…` をインラインコードとして描く（それ以外はプレーンテキスト）。 */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/`([^`]+)`/).map((part, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            style={{
              color: "#e2e8f0",
              background: "#1e293b",
              padding: "0 4px",
              borderRadius: 4,
            }}
          >
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

function SeverityBadge({ severity }: { severity: "warning" | "info" }) {
  const s = SEVERITY[severity];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0 8px",
        borderRadius: 999,
        fontSize: "0.72rem",
        lineHeight: 1.7,
        verticalAlign: "middle",
        border: `1px solid ${s.color}`,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

function Code({ children }: { children: string }) {
  // 横スクロールさせず折り返す（スクロール領域にしないのでタブ停止を増やさない）。
  return (
    <pre
      style={{
        margin: "0 0 4px",
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 8,
        padding: 12,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        fontSize: "0.8rem",
        lineHeight: 1.6,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <code>{children}</code>
    </pre>
  );
}

const linkStyle: CSSProperties = {
  color: "#93c5fd",
  textUnderlineOffset: 3,
};

const ctaStyle: CSSProperties = {
  display: "inline-block",
  minHeight: 44,
  lineHeight: "44px",
  padding: "0 18px",
  borderRadius: 8,
  background: "#334155",
  border: "1px solid #475569",
  color: "#e2e8f0",
  textDecoration: "none",
  fontWeight: 600,
};

const tocStyle: CSSProperties = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "14px 16px",
  marginBottom: 28,
};

const articleStyle: CSSProperties = {
  paddingTop: 24,
  marginTop: 8,
  borderTop: "1px solid #1e293b",
  scrollMarginTop: 16,
};

const h3Style: CSSProperties = {
  fontSize: "0.95rem",
  color: "#e2e8f0",
  margin: "16px 0 6px",
};

const bodyStyle: CSSProperties = {
  color: "#cbd5e1",
  lineHeight: 1.8,
  margin: 0,
};

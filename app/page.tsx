"use client";

import { useMemo, useState } from "react";
import type { Finding, Schema, Severity, TableDef } from "@/lib/types";
import { parseSchemaRb } from "@/lib/parse-schema-rb.mjs";
import { lintSchema, summarize } from "@/lib/lint.mjs";
import { toMermaid } from "@/lib/mermaid.mjs";
import { SAMPLE_SCHEMA_RB } from "@/lib/sample.mjs";

const SEVERITY_COLOR: Record<Severity, string> = {
  error: "#f87171",
  warning: "#fbbf24",
  info: "#60a5fa",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  error: "エラー",
  warning: "警告",
  info: "情報",
};

function looksLikeSql(text: string): boolean {
  return /create\s+table/i.test(text) && !/create_table/.test(text);
}

/** 列ごとの表示バッジ（PK/FK/索引/NOT NULL/UNIQUE）を組み立てる。 */
function columnBadges(table: TableDef, columnName: string): string[] {
  const badges: string[] = [];
  if (/_id$/.test(columnName)) badges.push("FK");
  const leading = table.indexes.find((ix) => ix.columns[0] === columnName);
  if (leading) badges.push(leading.unique ? "UNIQUE" : "INDEX");
  return badges;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => {
    if (input.trim() === "") return null;
    const schema: Schema = parseSchemaRb(input);
    const findings: Finding[] = lintSchema(schema);
    return { schema, findings, counts: summarize(findings) };
  }, [input]);

  const mermaid = useMemo(
    () => (result ? toMermaid(result.schema) : ""),
    [result],
  );

  async function copyMermaid() {
    try {
      await navigator.clipboard.writeText(mermaid);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = mermaid;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.9rem", margin: 0 }}>RailScope</h1>
        <p style={{ color: "#94a3b8", marginTop: 6 }}>
          Rails の schema.rb を貼るだけで ER 図と、本番でハマりがちなスキーマの
          地雷（FK 未索引・NOT NULL 欠落・polymorphic 複合索引漏れなど）を
          その場で点検します。
        </p>
        <p style={{ color: "#34d399", fontSize: "0.85rem", marginTop: 4 }}>
          🔒 入力はサーバーに送信されません。すべてブラウザ内で処理します。
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setInput(SAMPLE_SCHEMA_RB)}
          style={btnStyle}
        >
          サンプルを読み込む
        </button>
        <button type="button" onClick={() => setInput("")} style={btnStyle}>
          クリア
        </button>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        placeholder="ここに db/schema.rb の中身を貼り付け"
        style={{
          width: "100%",
          minHeight: 200,
          background: "#1e293b",
          color: "#e2e8f0",
          border: "1px solid #334155",
          borderRadius: 8,
          padding: 12,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "0.85rem",
          boxSizing: "border-box",
          resize: "vertical",
        }}
      />

      {looksLikeSql(input) && (
        <p style={{ color: "#fbbf24", marginTop: 8 }}>
          structure.sql とみられます。現在は schema.rb 形式に対応しています。
          schema.rb を貼り付けてください。
        </p>
      )}

      {result && (
        <>
          <section style={{ marginTop: 20 }}>
            <h2 style={h2Style}>
              Lint 結果 <SummaryBadge sev="error" n={result.counts.error} />
              <SummaryBadge sev="warning" n={result.counts.warning} />
              <SummaryBadge sev="info" n={result.counts.info} />
            </h2>
            {result.findings.length === 0 ? (
              <p style={{ color: "#34d399" }}>
                指摘はありません。スキーマは健全です。
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {result.findings.map((f, i) => (
                  <FindingRow
                    key={`${f.rule}:${f.table}:${f.columns.join(",")}:${f.line}:${i}`}
                    finding={f}
                  />
                ))}
              </ul>
            )}
          </section>

          <section style={{ marginTop: 24 }}>
            <h2 style={h2Style}>
              ER ビュー（{result.schema.tables.length} テーブル）
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              {result.schema.tables.map((t) => (
                <TableCard key={t.name} table={t} />
              ))}
            </div>
          </section>

          <section style={{ marginTop: 24 }}>
            <h2 style={h2Style}>Mermaid ER 図</h2>
            <p style={{ color: "#94a3b8", marginTop: 0 }}>
              下の Mermaid テキストを
              GitHub・mermaid.live・各種ドキュメントに貼ると ER
              図として表示されます。
            </p>
            <button type="button" onClick={copyMermaid} style={btnStyle}>
              {copied ? "コピーしました" : "Mermaid をコピー"}
            </button>
            <pre
              style={{
                marginTop: 8,
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: 12,
                overflowX: "auto",
                fontSize: "0.8rem",
              }}
            >
              {mermaid}
            </pre>
          </section>
        </>
      )}

      <footer
        style={{
          marginTop: 40,
          paddingTop: 16,
          borderTop: "1px solid #1e293b",
          color: "#64748b",
          fontSize: "0.8rem",
          lineHeight: 1.7,
        }}
      >
        <p style={{ margin: "0 0 8px" }}>
          <strong style={{ color: "#94a3b8" }}>免責</strong> — RailScope の lint
          結果・ER ビュー・Mermaid 出力は一般的な Rails
          マイグレーション規約に基づく参考情報であり、正確性・完全性・特定目的への
          適合性を保証しません。本ツールは現状有姿（AS
          IS）で提供されます。利用または
          利用不能から生じるいかなる損害（誤判定に基づく設計判断・データ破壊・逸失利益
          等を含む）について提供者は責任を負いません。出力を本番設計に用いる前に、
          利用者ご自身で検証してください。
        </p>
        <p style={{ margin: "0 0 8px" }}>
          <strong style={{ color: "#94a3b8" }}>プライバシー</strong> — 入力した
          schema.rb はサーバーに送信されず、保存もされません（すべてブラウザ
          内で処理）。Cookie
          は使用せず、アカウント登録もありません。アクセス解析には cookieless の
          GoatCounter を用い、ページ閲覧情報（URL・リファラ・ブラウザ 種別等）を
          goatcounter.com へ送信しますが、入力した schema.rb
          の内容や個人を特定する情報は送信しません。
        </p>
        <p style={{ margin: 0 }}>
          <strong style={{ color: "#94a3b8" }}>商標</strong> — &quot;Rails&quot;
          / &quot;Ruby on Rails&quot; は各権利者の商標です。RailScope はこれらの
          権利者と提携・公認・スポンサー関係にない非公式ツールです。
        </p>
      </footer>
    </main>
  );
}

function SummaryBadge({ sev, n }: { sev: Severity; n: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        marginLeft: 8,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: "0.75rem",
        background: "#1e293b",
        border: `1px solid ${SEVERITY_COLOR[sev]}`,
        color: SEVERITY_COLOR[sev],
      }}
    >
      {SEVERITY_LABEL[sev]} {n}
    </span>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 12px",
        marginBottom: 6,
        background: "#1e293b",
        borderLeft: `3px solid ${SEVERITY_COLOR[finding.severity]}`,
        borderRadius: 6,
      }}
    >
      <span
        style={{
          color: SEVERITY_COLOR[finding.severity],
          fontWeight: 600,
          minWidth: 44,
        }}
      >
        {SEVERITY_LABEL[finding.severity]}
      </span>
      <span style={{ flex: 1 }}>
        <code style={{ color: "#e2e8f0" }}>
          {finding.table}
          {finding.columns.length > 0 ? `.${finding.columns.join(", ")}` : ""}
        </code>
        {finding.line !== null && (
          <span style={{ color: "#64748b" }}> （行 {finding.line}）</span>
        )}
        <div style={{ color: "#cbd5e1", marginTop: 2 }}>{finding.message}</div>
        <div style={{ color: "#475569", fontSize: "0.72rem", marginTop: 2 }}>
          {finding.rule}
        </div>
      </span>
    </li>
  );
}

function TableCard({ table }: { table: TableDef }) {
  return (
    <div
      style={{
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "#334155",
          padding: "6px 10px",
          fontWeight: 700,
          fontSize: "0.9rem",
        }}
      >
        {table.name}
        {!table.hasPrimaryKey && (
          <span style={{ color: "#fbbf24", fontSize: "0.7rem" }}> (no PK)</span>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {table.hasPrimaryKey && (
            <tr>
              <td style={cellName}>id</td>
              <td style={cellType}>bigint</td>
              <td style={cellBadge}>
                <Badge text="PK" />
              </td>
            </tr>
          )}
          {table.columns.map((c, i) => (
            <tr key={`${c.name}-${i}`}>
              <td style={cellName}>
                {c.name}
                {!c.nullable && <span style={{ color: "#f87171" }}> *</span>}
              </td>
              <td style={cellType}>{c.type}</td>
              <td style={cellBadge}>
                {columnBadges(table, c.name).map((b) => (
                  <Badge key={b} text={b} />
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        marginLeft: 4,
        padding: "0 5px",
        borderRadius: 4,
        fontSize: "0.65rem",
        background: "#0f172a",
        border: "1px solid #475569",
        color: "#94a3b8",
      }}
    >
      {text}
    </span>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#334155",
  color: "#e2e8f0",
  border: "1px solid #475569",
  borderRadius: 6,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "0.85rem",
};

const h2Style: React.CSSProperties = {
  fontSize: "1.15rem",
  borderBottom: "1px solid #1e293b",
  paddingBottom: 6,
};

const cellName: React.CSSProperties = {
  padding: "3px 10px",
  fontSize: "0.8rem",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  borderTop: "1px solid #283548",
};

const cellType: React.CSSProperties = {
  padding: "3px 6px",
  fontSize: "0.75rem",
  color: "#94a3b8",
  borderTop: "1px solid #283548",
};

const cellBadge: React.CSSProperties = {
  padding: "3px 10px 3px 0",
  textAlign: "right",
  borderTop: "1px solid #283548",
  whiteSpace: "nowrap",
};

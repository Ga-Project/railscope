// RailScope — Schema から Mermaid erDiagram テキストを生成する（純粋関数）。
// 重い描画ライブラリは入れない（$0・依存ゼロ・脆弱性監査面を増やさない）方針。
// 生成したテキストは GitHub / mermaid.live / 各種ドキュメントでそのまま図になる。
//
/**
 * @typedef {import("./types").Schema} Schema
 */

/**
 * Mermaid の属性型/名は英数と _ のみ安全。それ以外は _ に潰す。
 * @param {string} s
 */
function safe(s) {
  return String(s).replace(/[^A-Za-z0-9_]/g, "_");
}

/**
 * Schema を Mermaid erDiagram テキストへ変換する。
 * 関係は add_foreign_key（無ければ _id 列の命名規約）から推定する。
 * @param {Schema} schema
 * @returns {string}
 */
export function toMermaid(schema) {
  const lines = ["erDiagram"];

  // FK 列の集合（PK/FK バッジ判定用）
  const fkCols = new Map();
  for (const fk of schema.foreignKeys) {
    if (!fkCols.has(fk.fromTable)) fkCols.set(fk.fromTable, new Set());
    fkCols.get(fk.fromTable).add(fk.column);
  }

  for (const table of schema.tables) {
    lines.push(`  ${safe(table.name)} {`);
    if (table.hasPrimaryKey) {
      lines.push(`    bigint id PK`);
    }
    const declaredFk = fkCols.get(table.name) ?? new Set();
    for (const col of table.columns) {
      const badges = [];
      if (declaredFk.has(col.name) || /_id$/.test(col.name)) badges.push("FK");
      const badge = badges.length ? ` ${badges.join(",")}` : "";
      lines.push(`    ${safe(col.type)} ${safe(col.name)}${badge}`);
    }
    lines.push("  }");
  }

  // 関係: add_foreign_key 優先。無ければ _id 列から親テーブルを推定。
  const tableNames = new Set(schema.tables.map((t) => t.name));
  const rels = new Set();
  for (const fk of schema.foreignKeys) {
    rels.add(
      `  ${safe(fk.toTable)} ||--o{ ${safe(fk.fromTable)} : "${fk.column}"`,
    );
  }
  for (const table of schema.tables) {
    const declaredFk = fkCols.get(table.name) ?? new Set();
    for (const col of table.columns) {
      if (!/_id$/.test(col.name) || declaredFk.has(col.name)) continue;
      const guess = guessParentTable(col.name, tableNames);
      if (guess) {
        rels.add(`  ${safe(guess)} ||--o{ ${safe(table.name)} : "${col.name}"`);
      }
    }
  }
  for (const r of rels) lines.push(r);

  return lines.join("\n");
}

/**
 * x_id 列名から親テーブル名を推定する（users / user の両表記を試す）。
 * @param {string} col
 * @param {Set<string>} tableNames
 * @returns {string|null}
 */
function guessParentTable(col, tableNames) {
  const base = col.replace(/_id$/, "");
  const candidates = [`${base}s`, base, `${base}es`, base.replace(/y$/, "ies")];
  for (const c of candidates) {
    if (tableNames.has(c)) return c;
  }
  return null;
}

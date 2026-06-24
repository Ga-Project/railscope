// RailScope — Rails スキーマ lint。
// 「ER 図を描く」だけのツールと一線を画す中核。Rails のマイグレーション規約を
// 理解した上での指摘（FK 未索引・polymorphic 複合索引漏れ・counter_cache の
// default 漏れ等）を行う。依存ゼロ・ブラウザ完結。
//
/**
 * @typedef {import("./types").Schema} Schema
 * @typedef {import("./types").TableDef} TableDef
 * @typedef {import("./types").Finding} Finding
 */

/** ルール ID -> 説明（UI の凡例にも使える） */
export const RULES = {
  "missing-fk-index": "外部キー候補列に索引がない（結合・参照が遅くなる）",
  "polymorphic-missing-composite-index":
    "polymorphic 参照に [type, id] の複合索引がない",
  "fk-column-nullable":
    "外部キー候補列が NULL 許容（optional でなければ要検討）",
  "missing-foreign-key-constraint":
    "_id 列に DB レベルの外部キー制約がない（孤児レコードを許す）",
  "no-primary-key": "テーブルに主キーがない",
  "boolean-without-default": "boolean 列に default がなく 3 値になり得る",
  "counter-cache-without-default": "*_count 列の default が 0 でない",
  "duplicate-index": "同一カラム構成の索引が重複している",
  "missing-timestamps": "created_at / updated_at がない",
};

/**
 * 索引の先頭カラムが col である索引が存在するか。
 * 左端一致（leftmost-prefix）規則に基づき「先頭カラム」のみを索引済みとみなす。
 * 複合索引 [a, b] は b 単独の検索には使えないため、b が他に単体/先頭索引を
 * 持たなければ FK 検索は未カバー＝指摘対象（Rails Guides も FK ごとの索引を推奨）。
 * これは意図的な仕様であり、複合主キー join テーブルの 2 本目の FK にも適用する。
 * @param {TableDef} table
 * @param {string} col
 */
function hasLeadingIndex(table, col) {
  return table.indexes.some((ix) => ix.columns[0] === col);
}

/**
 * polymorphic 参照に有効な複合索引があるか。
 * 左端一致（leftmost-prefix）規則上、`(type, id)` の lookup に乗るのは
 * type と id が索引の**先頭2カラム**に揃っている場合のみ。
 * 例: `[other, type, id]` は other を指定しない限り polymorphic 検索に使えない
 * ため、有効索引とはみなさない（hasLeadingIndex と同じ規則）。
 * 先頭2カラムの順序は問わない（`[type, id]` / `[id, type]` どちらも可）。
 * @param {TableDef} table
 * @param {string} base
 */
function hasPolymorphicIndex(table, base) {
  const typeCol = `${base}_type`;
  const idCol = `${base}_id`;
  return table.indexes.some((ix) => {
    const firstTwo = ix.columns.slice(0, 2);
    return firstTwo.includes(typeCol) && firstTwo.includes(idCol);
  });
}

/**
 * Schema を lint して Finding[] を返す。重大度順 → テーブル名順 → 行順で安定整列。
 * @param {Schema} schema
 * @returns {Finding[]}
 */
export function lintSchema(schema) {
  /** @type {Finding[]} */
  const findings = [];
  const fkByTable = new Map();
  for (const fk of schema.foreignKeys) {
    if (!fkByTable.has(fk.fromTable)) fkByTable.set(fk.fromTable, new Set());
    fkByTable.get(fk.fromTable).add(fk.column);
  }

  for (const table of schema.tables) {
    const polyBases = new Set(table.polymorphicRefs);
    const polyTypeCols = new Set([...polyBases].map((b) => `${b}_type`));
    const polyIdCols = new Set([...polyBases].map((b) => `${b}_id`));
    const declaredFks = fkByTable.get(table.name) ?? new Set();

    // no-primary-key
    if (!table.hasPrimaryKey) {
      const hasUniqueIndex = table.indexes.some((ix) => ix.unique);
      if (!hasUniqueIndex) {
        findings.push({
          rule: "no-primary-key",
          severity: "warning",
          table: table.name,
          columns: [],
          message: `テーブル ${table.name} は id: false で主キーがありません。複合主キー相当の unique 索引もないため、行の一意性が保証されません。`,
          line: table.line,
        });
      }
    }

    // polymorphic 複合索引
    for (const base of polyBases) {
      if (!hasPolymorphicIndex(table, base)) {
        findings.push({
          rule: "polymorphic-missing-composite-index",
          severity: "warning",
          table: table.name,
          columns: [`${base}_type`, `${base}_id`],
          message: `polymorphic 参照 ${base} には [${base}_type, ${base}_id] の複合索引が必要です（type 単独・id 単独では参照クエリが索引に乗りません）。`,
          line: table.line,
        });
      }
    }

    for (const col of table.columns) {
      const isIdCol = /_id$/.test(col.name);
      const isPolyId = polyIdCols.has(col.name);
      const isPolyType = polyTypeCols.has(col.name);
      // FK の裏付け = add_foreign_key / t.references foreign_key: 宣言。
      const isDeclaredFk = declaredFks.has(col.name);
      // 整数型（bigint/integer）の _id のみを推定 FK 候補とする。
      // string/uuid/text 等の _id（例: external_id, payment_id, request_id,
      // legacy_id）は Rails 上の FK でないことが多く、警告は偽陽性になりやすい。
      // ただし add_foreign_key 等で明示された列は型に依らず候補とする
      // （uuid 主キー運用の uuid 型 FK を取りこぼさないため）。
      const isIntegerType = col.type === "bigint" || col.type === "integer";

      // FK 候補: FK 宣言済み列、または 整数型の _id 列。
      // polymorphic の *_id は複合索引ルールで扱うのでここでは二重計上しない。
      const isFkCandidate =
        (isDeclaredFk || (isIdCol && isIntegerType)) && !isPolyId;

      if (isFkCandidate) {
        if (!hasLeadingIndex(table, col.name)) {
          findings.push({
            rule: "missing-fk-index",
            severity: "warning",
            table: table.name,
            columns: [col.name],
            message: `${table.name}.${col.name} は外部キー候補ですが索引がありません。親テーブル結合・存在チェック・cascade delete が全件走査になります。`,
            line: col.line,
          });
        }
        if (col.nullable) {
          findings.push({
            rule: "fk-column-nullable",
            severity: "info",
            table: table.name,
            columns: [col.name],
            message: `${table.name}.${col.name} が NULL 許容です。belongs_to が optional でないなら null: false を付け、DB 側でも必須を保証してください。`,
            line: col.line,
          });
        }
        if (!declaredFks.has(col.name) && !isPolyType) {
          findings.push({
            rule: "missing-foreign-key-constraint",
            severity: "info",
            table: table.name,
            columns: [col.name],
            message: `${table.name}.${col.name} に add_foreign_key（DB レベルの外部キー制約）がありません。参照先の削除で孤児レコードが残り得ます。`,
            line: col.line,
          });
        }
      }

      // boolean に default 無し
      if (col.type === "boolean" && !col.hasDefault) {
        findings.push({
          rule: "boolean-without-default",
          severity: "info",
          table: table.name,
          columns: [col.name],
          message: `${table.name}.${col.name} は boolean ですが default がありません。NULL を含む 3 値になり、条件分岐でバグの温床になります。default と null: false を検討してください。`,
          line: col.line,
        });
      }

      // counter_cache: *_count は default: 0 が定石
      if (
        /_count$/.test(col.name) &&
        (col.type === "integer" || col.type === "bigint") &&
        col.defaultValue !== "0"
      ) {
        findings.push({
          rule: "counter-cache-without-default",
          severity: "info",
          table: table.name,
          columns: [col.name],
          message: `${table.name}.${col.name} は counter_cache とみられますが default: 0 ではありません。NULL 始まりだとインクリメントで例外・不整合になります。`,
          line: col.line,
        });
      }
    }

    // 重複索引（同一カラム構成）
    const seen = new Map();
    for (const ix of table.indexes) {
      const key = ix.columns.join(",");
      if (seen.has(key)) {
        findings.push({
          rule: "duplicate-index",
          severity: "warning",
          table: table.name,
          columns: ix.columns,
          message: `${table.name} に [${ix.columns.join(", ")}] の索引が重複しています。書き込みコストが増えるだけなので片方を削除してください。`,
          line: ix.line,
        });
      } else {
        seen.set(key, ix.line);
      }
    }

    // timestamps 不在（join テーブル等もあるため info）
    const names = new Set(table.columns.map((c) => c.name));
    if (!names.has("created_at") && !names.has("updated_at")) {
      findings.push({
        rule: "missing-timestamps",
        severity: "info",
        table: table.name,
        columns: [],
        message: `${table.name} に created_at / updated_at がありません。意図的（join テーブル等）なら無視して構いません。`,
        line: table.line,
      });
    }
  }

  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => {
    if (order[a.severity] !== order[b.severity])
      return order[a.severity] - order[b.severity];
    if (a.table !== b.table) return a.table < b.table ? -1 : 1;
    return (a.line ?? 0) - (b.line ?? 0);
  });

  return findings;
}

/**
 * 重大度ごとの件数を集計する。
 * @param {Finding[]} findings
 */
export function summarize(findings) {
  return {
    error: findings.filter((f) => f.severity === "error").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
    total: findings.length,
  };
}

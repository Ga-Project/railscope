// RailScope — Rails `db/schema.rb` パーサ。
// ブラウザ内で完結し外部送信なし・依存ゼロ。論理行（折り返しを連結した1文）
// 単位で安定的に解析する（任意 Ruby の評価はしない＝安全）。
//
// 型は ./types.ts と一致させる（JS 側は JSDoc で表現）。
//
/**
 * @typedef {import("./types").Column} Column
 * @typedef {import("./types").IndexDef} IndexDef
 * @typedef {import("./types").TableDef} TableDef
 * @typedef {import("./types").ForeignKeyDef} ForeignKeyDef
 * @typedef {import("./types").Schema} Schema
 */

const COLUMN_TYPES = [
  "string",
  "text",
  "integer",
  "bigint",
  "float",
  "decimal",
  "numeric",
  "datetime",
  "timestamp",
  "time",
  "date",
  "boolean",
  "binary",
  "json",
  "jsonb",
  "uuid",
  "inet",
  "cidr",
  "macaddr",
  "money",
  "hstore",
  "interval",
  "virtual",
];

/**
 * テーブル名を素朴に単数化して外部キー列名を推定する（add_foreign_key で
 * column: が省略された場合に使用）。完全な活用ではなく主要パターンのみ。
 * @param {string} table
 * @returns {string}
 */
export function foreignKeyColumnFor(table) {
  let singular = table;
  if (/ies$/.test(table)) {
    singular = table.replace(/ies$/, "y");
  } else if (/(s|x|z|ch|sh)es$/.test(table)) {
    singular = table.replace(/es$/, "");
  } else if (/s$/.test(table)) {
    singular = table.replace(/s$/, "");
  }
  return `${singular}_id`;
}

/**
 * 単数の関連名から親テーブル名（複数形）を素朴に推定する。
 * @param {string} base
 * @returns {string}
 */
function pluralizeGuess(base) {
  if (/y$/.test(base)) return base.replace(/y$/, "ies");
  if (/(s|x|z|ch|sh)$/.test(base)) return `${base}es`;
  return `${base}s`;
}

/**
 * 文字列リテラルの外にある `#` 以降（行コメント）を安全に除去する。
 * クォート内の `#`（例: default: "#FFF"）は温存する。論理行を組み立てる前段で
 * 適用し、行末/文中のインラインコメントが `isComplete` 判定や連結を壊さないようにする。
 * @param {string} line
 * @returns {string}
 */
function stripComment(line) {
  let inq = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inq) {
      if (ch === inq && line[i - 1] !== "\\") inq = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inq = ch;
    } else if (ch === "#") {
      return line.slice(0, i).trim();
    }
  }
  return line.trim();
}

/**
 * 物理行を論理行（折り返しを連結した1文）へまとめる。rubocop 等で
 * `create_table` ヘッダや列オプションが複数行へ折り返されてもテーブル/属性を
 * 取りこぼさないための前処理。各論理行は最初の物理行番号を保持する。
 * インラインコメント（文字列外の `#` 以降）は連結前に除去する。
 * @param {string} source
 * @returns {{ text: string, line: number }[]}
 */
function logicalLines(source) {
  const phys = String(source).split(/\r?\n/);
  /** @type {{ text: string, line: number }[]} */
  const out = [];
  let buf = "";
  let startLine = 0;

  for (let i = 0; i < phys.length; i++) {
    const t = stripComment(phys[i]);
    if (buf === "") {
      // 空行・コメントのみの行は論理行を生まない（連結対象でもない）。
      if (t === "") continue;
      buf = t;
      startLine = i + 1;
    } else {
      // 連結中の空行/コメント行は取り込まない（文の途中に来ることは稀）。
      if (t === "") continue;
      buf = `${buf} ${t}`;
    }
    if (isComplete(buf)) {
      out.push({ text: buf, line: startLine });
      buf = "";
    }
  }
  if (buf !== "") out.push({ text: buf, line: startLine });
  return out;
}

/**
 * 論理行が完結しているか（括弧が閉じ、末尾カンマで継続していない）。
 * @param {string} buf
 */
function isComplete(buf) {
  let depth = 0;
  let inq = null;
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (inq) {
      if (ch === inq && buf[i - 1] !== "\\") inq = null;
      continue;
    }
    if (ch === '"' || ch === "'") inq = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
  }
  if (depth > 0) return false;
  return !/,\s*$/.test(buf);
}

/**
 * `null: false` などの真偽オプションを読む。
 * @param {string} opts
 * @param {string} key
 * @returns {boolean|null}
 */
function readBoolOption(opts, key) {
  const m = opts.match(new RegExp(`(?:^|[,\\s{])${key}:\\s*(true|false)`));
  if (!m) return null;
  return m[1] === "true";
}

/**
 * オプション断片の `key:` 以降から、引用符・括弧の対応を保ったまま 1 値を読む
 * （トップレベルのカンマで停止）。配列/ハッシュ/lambda の default を途中で
 * 切らないために使う。
 * @param {string} opts
 * @param {string} key
 * @returns {{ present: boolean, value: string|null }}
 */
function readValueOption(opts, key) {
  const m = opts.match(new RegExp(`(?:^|[,\\s])${key}:\\s*`));
  if (!m) return { present: false, value: null };
  const start = m.index + m[0].length;
  let depth = 0;
  let inq = null;
  let out = "";
  for (let i = start; i < opts.length; i++) {
    const ch = opts[i];
    if (inq) {
      out += ch;
      if (ch === inq && opts[i - 1] !== "\\") inq = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inq = ch;
      out += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      out += ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      out += ch;
      continue;
    }
    if (ch === "," && depth <= 0) break;
    out += ch;
  }
  return { present: true, value: out.trim() };
}

/**
 * `"a", "b"` のような Ruby 文字列配列/列挙からトークンを取り出す。
 * @param {string} s
 * @returns {string[]}
 */
function extractStrings(s) {
  const out = [];
  const re = /"([^"]+)"|'([^']+)'/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1] ?? m[2]);
  }
  return out;
}

/**
 * schema.rb 文字列を解析して Schema を返す。
 * @param {string} source
 * @returns {Schema}
 */
export function parseSchemaRb(source) {
  const lines = logicalLines(source);
  /** @type {TableDef[]} */
  const tables = [];
  /** @type {ForeignKeyDef[]} */
  const foreignKeys = [];
  /**
   * create_table ブロック外で宣言されたスタンドアロン索引（add_index）。
   * 全行を読み終えてから対応テーブルの indexes へ合流する。
   * @type {{ table: string, index: IndexDef }[]}
   */
  const standaloneIndexes = [];

  /** @type {TableDef|null} */
  let current = null;

  for (const { text: line, line: lineNo } of lines) {
    if (line === "" || line.startsWith("#")) continue;

    if (current === null) {
      // create_table "name", options do |t|（' " どちらの引用符も許容）
      const ct = line.match(
        /^create_table\s+(["'])([^"']+)\1\s*(?:,\s*(.*?))?\s+do\s*\|\s*t\s*\|/,
      );
      if (ct) {
        const opts = ct[3] ?? "";
        const idFalse = /(?:^|[,\s])id:\s*false/.test(opts);
        const hasPkOpt = /(?:^|[,\s])primary_key:/.test(opts);
        current = {
          name: ct[2],
          columns: [],
          indexes: [],
          hasPrimaryKey: !idFalse || hasPkOpt,
          polymorphicRefs: [],
          line: lineNo,
        };
        continue;
      }
      // add_foreign_key "from", "to", column: "x"（' " どちらの引用符も許容）
      const fk = line.match(
        /^add_foreign_key\s+(["'])([^"']+)\1,\s*(["'])([^"']+)\3\s*(?:,\s*(.*))?$/,
      );
      if (fk) {
        const opts = fk[5] ?? "";
        const colMatch = opts.match(/column:\s*["']([^"']+)["']/);
        foreignKeys.push({
          fromTable: fk[2],
          toTable: fk[4],
          column: colMatch ? colMatch[1] : foreignKeyColumnFor(fk[4]),
          line: lineNo,
        });
        continue;
      }

      // create_table ブロック外のスタンドアロン索引:
      //   add_index "table", ["col", ...], name: "...", unique: true
      // 旧 Rails ダンプや手編集 schema.rb ではブロック内 t.index ではなく
      // トップレベルで索引を宣言する。これを取りこぼすと索引済み列を
      // 「索引漏れ」と誤検出するため、対応テーブルへ後から合流させる。
      const stdIdx = line.match(
        /^add_index\s+(["'])([^"']+)\1\s*,\s*(\[[^\]]*\]|["'][^"']+["'])\s*(?:,\s*(.*))?$/,
      );
      if (stdIdx) {
        const tableName = stdIdx[2];
        const cols = extractStrings(stdIdx[3]);
        const opts = stdIdx[4] ?? "";
        const nameMatch = opts.match(/name:\s*["']([^"']+)["']/);
        standaloneIndexes.push({
          table: tableName,
          index: {
            columns: cols,
            unique: readBoolOption(opts, "unique") === true,
            name: nameMatch ? nameMatch[1] : null,
            line: lineNo,
          },
        });
      }
      continue;
    }

    // --- inside a create_table block ---
    if (/^end\b/.test(line)) {
      tables.push(current);
      current = null;
      continue;
    }

    // t.index ["a", "b"], name: "...", unique: true（' " どちらの引用符も許容）
    const idx = line.match(
      /^t\.index\s+(\[[^\]]*\]|["'][^"']+["'])\s*(?:,\s*(.*))?$/,
    );
    if (idx) {
      const cols = extractStrings(idx[1]);
      const opts = idx[2] ?? "";
      const nameMatch = opts.match(/name:\s*["']([^"']+)["']/);
      current.indexes.push({
        columns: cols,
        unique: readBoolOption(opts, "unique") === true,
        name: nameMatch ? nameMatch[1] : null,
        line: lineNo,
      });
      continue;
    }

    // t.timestamps
    if (/^t\.timestamps\b/.test(line)) {
      for (const name of ["created_at", "updated_at"]) {
        current.columns.push({
          name,
          type: "datetime",
          nullable: false,
          hasDefault: false,
          defaultValue: null,
          line: lineNo,
        });
      }
      continue;
    }

    // t.references / t.belongs_to "x", polymorphic:, type:, foreign_key:, index:, null:
    // （' " どちらの引用符も許容）
    const ref = line.match(
      /^t\.(references|belongs_to)\s+(["'])([^"']+)\2\s*(?:,\s*(.*))?$/,
    );
    if (ref) {
      const base = ref[3];
      const opts = ref[4] ?? "";
      const poly = readBoolOption(opts, "polymorphic") === true;
      const nullable = readBoolOption(opts, "null") !== false;
      const typeMatch = opts.match(/(?:^|[,\s])type:\s*:?(\w+)/);
      const idType = typeMatch ? typeMatch[1] : "bigint";
      if (poly) current.polymorphicRefs.push(base);

      current.columns.push({
        name: `${base}_id`,
        type: idType,
        nullable,
        hasDefault: false,
        defaultValue: null,
        line: lineNo,
      });
      if (poly) {
        current.columns.push({
          name: `${base}_type`,
          type: "string",
          nullable,
          hasDefault: false,
          defaultValue: null,
          line: lineNo,
        });
      }

      // index: 既定 true。index: false で抑止。index: { unique: true } で一意。
      const indexOpt = readValueOption(opts, "index");
      const noIndex = indexOpt.present && indexOpt.value === "false";
      if (!noIndex) {
        const uniqueIdx =
          indexOpt.present && /unique:\s*true/.test(indexOpt.value ?? "");
        current.indexes.push({
          columns: poly ? [`${base}_type`, `${base}_id`] : [`${base}_id`],
          unique: uniqueIdx,
          name: null,
          line: lineNo,
        });
      }

      // foreign_key: true / { to_table: "..." } は DB レベルの FK 制約。
      // polymorphic は単一 FK を張れないので対象外。
      const fkOpt = readValueOption(opts, "foreign_key");
      const hasFk =
        fkOpt.present && fkOpt.value !== "false" && fkOpt.value !== null;
      if (hasFk && !poly) {
        const toMatch = (fkOpt.value ?? "").match(
          /to_table:\s*["']([^"']+)["']/,
        );
        foreignKeys.push({
          fromTable: current.name,
          toTable: toMatch ? toMatch[1] : pluralizeGuess(base),
          column: `${base}_id`,
          line: lineNo,
        });
      }
      continue;
    }

    // t.<type> "name", options（' " どちらの引用符も許容）
    const colType = COLUMN_TYPES.join("|");
    const col = line.match(
      new RegExp(`^t\\.(${colType})\\s+(["'])([^"']+)\\2\\s*(?:,\\s*(.*))?$`),
    );
    if (col) {
      const opts = col[4] ?? "";
      const def = readValueOption(opts, "default");
      current.columns.push({
        name: col[3],
        type: col[1],
        nullable: readBoolOption(opts, "null") !== false,
        hasDefault: def.present,
        defaultValue: def.present ? def.value : null,
        line: lineNo,
      });
      continue;
    }
    // 認識できない行は無視（create_table 内の未知 DSL でも壊れない）。
  }

  // ファイル末尾で end が欠けていても取りこぼさない。
  if (current !== null) tables.push(current);

  // スタンドアロン add_index を対応テーブルへ合流させる。
  // これにより左端一致（missing-fk-index）・polymorphic 複合索引・重複索引の
  // 各判定がブロック外索引も認識する。宣言順を保つため末尾に追加する。
  if (standaloneIndexes.length > 0) {
    const byName = new Map(tables.map((t) => [t.name, t]));
    for (const { table, index } of standaloneIndexes) {
      const target = byName.get(table);
      if (target) target.indexes.push(index);
    }
  }

  return { tables, foreignKeys };
}

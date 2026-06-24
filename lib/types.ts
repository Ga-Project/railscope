// RailScope — 解析結果の型定義（型のみ・ランタイムコードなし）。
// 実体の解析/lint ロジックは依存ゼロの .mjs モジュール側に置き、
// UI(TSX) はここの型で受ける。両者の形は一致させること。

export interface Column {
  name: string;
  type: string;
  /** null: false が無ければ true（NULL 許容） */
  nullable: boolean;
  hasDefault: boolean;
  defaultValue: string | null;
  /** schema.rb 内での 1 始まり行番号 */
  line: number;
}

export interface IndexDef {
  columns: string[];
  unique: boolean;
  name: string | null;
  line: number;
}

export interface TableDef {
  name: string;
  columns: Column[];
  indexes: IndexDef[];
  /** create_table が id: false でなければ true（暗黙の主キーあり） */
  hasPrimaryKey: boolean;
  /** t.references ... polymorphic: true で宣言された基底名（例: "commentable"） */
  polymorphicRefs: string[];
  line: number;
}

export interface ForeignKeyDef {
  fromTable: string;
  toTable: string;
  column: string;
  line: number;
}

export interface Schema {
  tables: TableDef[];
  foreignKeys: ForeignKeyDef[];
}

export type Severity = "error" | "warning" | "info";

export interface Finding {
  /** ルール識別子（例: "missing-fk-index"） */
  rule: string;
  severity: Severity;
  table: string;
  columns: string[];
  message: string;
  /** 該当する schema.rb の行番号（特定できなければ null） */
  line: number | null;
}

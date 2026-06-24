// RailScope — Mermaid 生成のユニットテスト（node:test の標準ランナーを使用）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSchemaRb } from "../lib/parse-schema-rb.mjs";
import { toMermaid } from "../lib/mermaid.mjs";
import { SAMPLE_SCHEMA_RB } from "../lib/sample.mjs";

const mmd = toMermaid(parseSchemaRb(SAMPLE_SCHEMA_RB));

test("erDiagram ヘッダで始まる", () => {
  assert.ok(mmd.startsWith("erDiagram"));
});

test("各テーブルがエンティティとして出る", () => {
  assert.match(mmd, /users \{/);
  assert.match(mmd, /posts \{/);
  assert.match(mmd, /comments \{/);
});

test("主キー行に PK バッジが付く", () => {
  assert.match(mmd, /bigint id PK/);
});

test("add_foreign_key の関係を描く", () => {
  assert.match(mmd, /users \|\|--o\{ posts/);
});

test("命名規約から関係を推定する（post_id → posts）", () => {
  assert.match(mmd, /posts \|\|--o\{ comments/);
});

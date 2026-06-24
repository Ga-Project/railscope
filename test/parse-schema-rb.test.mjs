// RailScope — パーサのユニットテスト（node:test の標準ランナーを使用）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSchemaRb, foreignKeyColumnFor } from "../lib/parse-schema-rb.mjs";
import { SAMPLE_SCHEMA_RB } from "../lib/sample.mjs";

test("テーブルを過不足なく抽出する", () => {
  const { tables } = parseSchemaRb(SAMPLE_SCHEMA_RB);
  assert.deepEqual(
    tables.map((t) => t.name),
    ["users", "posts", "comments", "taggings"],
  );
});

test("カラム・索引・主キー有無を読む", () => {
  const { tables } = parseSchemaRb(SAMPLE_SCHEMA_RB);
  const users = tables.find((t) => t.name === "users");
  assert.ok(users);
  assert.deepEqual(
    users.columns.map((c) => c.name),
    ["email", "name", "admin", "created_at", "updated_at"],
  );
  const email = users.columns.find((c) => c.name === "email");
  assert.equal(email.nullable, false);
  assert.equal(users.indexes.length, 1);
  assert.equal(users.indexes[0].unique, true);
  assert.equal(users.hasPrimaryKey, true);
});

test("id: false を主キー無しとして扱う", () => {
  const { tables } = parseSchemaRb(SAMPLE_SCHEMA_RB);
  const taggings = tables.find((t) => t.name === "taggings");
  assert.equal(taggings.hasPrimaryKey, false);
});

test("t.references polymorphic を _id/_type 列に展開する", () => {
  const { tables } = parseSchemaRb(SAMPLE_SCHEMA_RB);
  const comments = tables.find((t) => t.name === "comments");
  assert.deepEqual(comments.polymorphicRefs, ["commentable"]);
  const colNames = comments.columns.map((c) => c.name);
  assert.ok(colNames.includes("commentable_id"));
  assert.ok(colNames.includes("commentable_type"));
  // index: false 指定なので索引は生成しない
  assert.equal(comments.indexes.length, 0);
  const postId = comments.columns.find((c) => c.name === "post_id");
  assert.equal(postId.nullable, true);
});

test("add_foreign_key を解析する", () => {
  const { foreignKeys } = parseSchemaRb(SAMPLE_SCHEMA_RB);
  assert.equal(foreignKeys.length, 1);
  assert.deepEqual(foreignKeys[0], {
    fromTable: "posts",
    toTable: "users",
    column: "user_id",
    line: foreignKeys[0].line,
  });
});

test("foreignKeyColumnFor が主要な単数化をカバーする", () => {
  assert.equal(foreignKeyColumnFor("users"), "user_id");
  assert.equal(foreignKeyColumnFor("categories"), "category_id");
  assert.equal(foreignKeyColumnFor("boxes"), "box_id");
  assert.equal(foreignKeyColumnFor("people"), "people_id"); // 不規則は対象外
});

test("空入力でも壊れない", () => {
  const r = parseSchemaRb("");
  assert.deepEqual(r.tables, []);
  assert.deepEqual(r.foreignKeys, []);
});

// RailScope — lint ルールのユニットテスト（node:test・外部依存ゼロ）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSchemaRb } from "../lib/parse-schema-rb.mjs";
import { lintSchema, summarize } from "../lib/lint.mjs";
import { SAMPLE_SCHEMA_RB } from "../lib/sample.mjs";

const findings = lintSchema(parseSchemaRb(SAMPLE_SCHEMA_RB));

/** rule（+ table/col 任意）に一致する finding があるか */
function has(rule, table, col) {
  return findings.some(
    (f) =>
      f.rule === rule &&
      (table === undefined || f.table === table) &&
      (col === undefined || f.columns.includes(col)),
  );
}

test("FK 列の索引漏れを検出する", () => {
  assert.ok(has("missing-fk-index", "comments", "post_id"));
  assert.ok(has("missing-fk-index", "taggings", "post_id"));
  assert.ok(has("missing-fk-index", "taggings", "tag_id"));
});

test("索引済み FK 列は誤検知しない", () => {
  // posts.user_id は index 済み
  assert.ok(!has("missing-fk-index", "posts", "user_id"));
});

test("polymorphic の複合索引漏れを検出する", () => {
  assert.ok(has("polymorphic-missing-composite-index", "comments"));
  // polymorphic の *_id は単体 FK 索引ルールで二重計上しない
  assert.ok(!has("missing-fk-index", "comments", "commentable_id"));
});

test("counter_cache の default 漏れを検出する", () => {
  assert.ok(has("counter-cache-without-default", "posts", "comments_count"));
});

test("boolean の default 漏れを検出する", () => {
  assert.ok(has("boolean-without-default", "users", "admin"));
});

test("主キー無し（id: false）を検出する", () => {
  assert.ok(has("no-primary-key", "taggings"));
});

test("NULL 許容 FK は nullable のときだけ指摘する", () => {
  assert.ok(has("fk-column-nullable", "comments", "post_id"));
  assert.ok(!has("fk-column-nullable", "taggings", "post_id")); // null: false
});

test("timestamps 不在を info で出す", () => {
  assert.ok(has("missing-timestamps", "taggings"));
  assert.ok(!has("missing-timestamps", "users"));
});

test("重大度の整列と集計が一致する", () => {
  const s = summarize(findings);
  assert.equal(s.total, findings.length);
  assert.equal(s.error + s.warning + s.info, s.total);
  // error → warning → info の順で並ぶ
  const rank = { error: 0, warning: 1, info: 2 };
  for (let i = 1; i < findings.length; i++) {
    assert.ok(rank[findings[i - 1].severity] <= rank[findings[i].severity]);
  }
});

test("健全なスキーマは指摘ゼロ", () => {
  const clean = `ActiveRecord::Schema[7.1].define(version: 1) do
  create_table "authors", force: :cascade do |t|
    t.string "name", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end
  create_table "books", force: :cascade do |t|
    t.bigint "author_id", null: false
    t.string "title", null: false
    t.boolean "published", default: false, null: false
    t.integer "reviews_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["author_id"], name: "i_books_author"
  end
  add_foreign_key "books", "authors"
end
`;
  const s = summarize(lintSchema(parseSchemaRb(clean)));
  assert.equal(s.total, 0);
});

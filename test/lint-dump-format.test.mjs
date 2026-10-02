// RailScope — rails db:schema:dump が実際に書き出す形での判定と、重複索引の境界。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSchemaRb } from "../lib/parse-schema-rb.mjs";
import { lintSchema } from "../lib/lint.mjs";
import { wrapSchema } from "../lib/rule-guide.mjs";

const lint = (body) => lintSchema(parseSchemaRb(wrapSchema(body)));
const rulesOn = (findings, col) =>
  findings.filter((f) => f.columns.includes(col)).map((f) => f.rule);

const DUMPED_POLY = `create_table "comments", force: :cascade do |t|
  t.string "commentable_type", null: false
  t.bigint "commentable_id", null: false
  t.timestamps
  t.index ["commentable_type", "commentable_id"], name: "index_comments_on_commentable"
end`;

test("ダンプ形式（*_type + *_id）を polymorphic として扱い、FK 向けの指摘を出さない", () => {
  const findings = lint(DUMPED_POLY);
  assert.deepEqual(rulesOn(findings, "commentable_id"), []);
  assert.equal(
    parseSchemaRb(wrapSchema(DUMPED_POLY)).tables[0].polymorphicRefs[0],
    "commentable",
  );
});

test("ダンプ形式で複合索引が無ければ polymorphic の指摘を出す", () => {
  const body = DUMPED_POLY.replace(/\n  t\.index[^\n]*/, "");
  const rules = lint(body).map((f) => f.rule);
  assert.ok(rules.includes("polymorphic-missing-composite-index"));
  assert.ok(!rules.includes("missing-fk-index"));
  assert.ok(!rules.includes("missing-foreign-key-constraint"));
});

test("*_type が string でなければ polymorphic とみなさない", () => {
  const body = `create_table "items", force: :cascade do |t|
  t.integer "kind_type"
  t.bigint "kind_id"
  t.timestamps
end`;
  assert.deepEqual(
    parseSchemaRb(wrapSchema(body)).tables[0].polymorphicRefs,
    [],
  );
});

test("where / using が違う索引は重複とみなさない", () => {
  const body = `create_table "posts", force: :cascade do |t|
  t.bigint "account_id", null: false
  t.boolean "is_primary", default: false, null: false
  t.timestamps
  t.index ["account_id"], name: "index_posts_on_account_id"
  t.index ["account_id"], name: "index_posts_primary", unique: true, where: "is_primary"
  t.index ["account_id"], name: "index_posts_gin", using: :gin
end`;
  assert.ok(!lint(body).some((f) => f.rule === "duplicate-index"));
});

test("where まで同じ索引は重複とみなす（add_index でも）", () => {
  const body = `create_table "posts", force: :cascade do |t|
  t.bigint "account_id", null: false
  t.timestamps
  t.index ["account_id"], name: "a", where: "deleted_at IS NULL"
end

add_index "posts", ["account_id"], name: "b", where: "deleted_at IS NULL"`;
  assert.ok(lint(body).some((f) => f.rule === "duplicate-index"));
});

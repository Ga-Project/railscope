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

test("null: false の boolean と 0 以外の counter default は、それぞれの実害で説明する", () => {
  const findings = lint(`create_table "posts", force: :cascade do |t|
  t.boolean "published", null: false
  t.integer "comments_count", default: 1, null: false
  t.timestamps
end`);
  const msg = (rule) => findings.find((f) => f.rule === rule)?.message ?? "";
  assert.match(msg("boolean-without-default"), /INSERT がエラー/);
  assert.doesNotMatch(msg("boolean-without-default"), /3 値/);
  assert.match(msg("counter-cache-without-default"), /実際の件数とずれ/);
  assert.doesNotMatch(msg("counter-cache-without-default"), /NULL/);
});

test("*_id に add_foreign_key があれば *_type があっても polymorphic とみなさない", () => {
  const body = `create_table "users", force: :cascade do |t|
  t.timestamps
end

create_table "accounts", force: :cascade do |t|
  t.string "user_type"
  t.bigint "user_id", null: false
  t.timestamps
end

add_foreign_key "accounts", "users"`;
  const rules = lint(body).map((f) => f.rule);
  assert.ok(rules.includes("missing-fk-index"));
  assert.ok(!rules.includes("polymorphic-missing-composite-index"));
});

test("部分索引は外部キーの索引・一意性の根拠に数えない", () => {
  const rules = lint(`create_table "comments", force: :cascade do |t|
  t.bigint "post_id", null: false
  t.timestamps
  t.index ["post_id"], name: "a", where: "deleted_at IS NULL"
end

create_table "taggings", id: false, force: :cascade do |t|
  t.bigint "post_id", null: false
  t.index ["post_id"], name: "b", unique: true, where: "post_id > 0"
end`).map((f) => `${f.rule}`);
  assert.ok(rules.includes("missing-fk-index"));
  assert.ok(rules.includes("no-primary-key"));
});

test("using: :btree は指定なしの索引と重複とみなす", () => {
  const body = `create_table "posts", force: :cascade do |t|
  t.bigint "user_id", null: false
  t.timestamps
  t.index ["user_id"], name: "a"
  t.index ["user_id"], name: "b", using: :btree
end`;
  assert.ok(lint(body).some((f) => f.rule === "duplicate-index"));
});

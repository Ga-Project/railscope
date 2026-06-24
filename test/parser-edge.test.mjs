// RailScope — レビュー指摘の回帰テスト（パーサ/lint のエッジケース）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSchemaRb } from "../lib/parse-schema-rb.mjs";
import { lintSchema } from "../lib/lint.mjs";

function lintOf(src) {
  const findings = lintSchema(parseSchemaRb(src));
  return (rule, table, col) =>
    findings.some(
      (f) =>
        f.rule === rule &&
        (table === undefined || f.table === table) &&
        (col === undefined || f.columns.includes(col)),
    );
}

test("複数行に折り返した create_table ヘッダでもテーブルを失わない", () => {
  const src = `ActiveRecord::Schema[7.1].define(version: 1) do
  create_table "events",
    id: :uuid,
    force: :cascade do |t|
    t.string "name", null: false
  end
end`;
  const { tables } = parseSchemaRb(src);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].name, "events");
  assert.equal(tables[0].hasPrimaryKey, true);
  const name = tables[0].columns.find((c) => c.name === "name");
  assert.ok(name);
  assert.equal(name.nullable, false);
});

test("複数行に折り返した列オプションも読む", () => {
  const src = `create_table "users", force: :cascade do |t|
  t.string "email",
    null: false
end`;
  const { tables } = parseSchemaRb(src);
  const email = tables[0].columns.find((c) => c.name === "email");
  assert.equal(email.nullable, false);
});

test("t.references foreign_key: true を FK 制約として認識する", () => {
  const src = `create_table "posts", force: :cascade do |t|
  t.references "user", null: false, foreign_key: true
end`;
  const { tables, foreignKeys } = parseSchemaRb(src);
  const userId = tables[0].columns.find((c) => c.name === "user_id");
  assert.ok(userId);
  assert.deepEqual(foreignKeys[0], {
    fromTable: "posts",
    toTable: "users",
    column: "user_id",
    line: foreignKeys[0].line,
  });
  const has = lintOf(src);
  // index は既定で張られる → 索引漏れなし
  assert.ok(!has("missing-fk-index", "posts", "user_id"));
  // foreign_key: true があるので制約漏れを誤検知しない
  assert.ok(!has("missing-foreign-key-constraint", "posts", "user_id"));
});

test("t.references index: false は索引漏れとして検出する", () => {
  const src = `create_table "posts", force: :cascade do |t|
  t.references "user", foreign_key: true, index: false
end`;
  const has = lintOf(src);
  assert.ok(has("missing-fk-index", "posts", "user_id"));
  assert.ok(!has("missing-foreign-key-constraint", "posts", "user_id"));
});

test("composite primary_key を主キーありとして扱う", () => {
  const src = `create_table "memberships", id: false, primary_key: ["user_id", "team_id"], force: :cascade do |t|
  t.bigint "user_id", null: false
  t.bigint "team_id", null: false
  t.index ["user_id", "team_id"], unique: true, name: "pk_memberships"
end`;
  const { tables } = parseSchemaRb(src);
  assert.equal(tables[0].hasPrimaryKey, true);
  const has = lintOf(src);
  assert.ok(!has("no-primary-key", "memberships"));
  // 左端一致: user_id はカバー、team_id は単体索引が無く未カバー（意図的に指摘）
  assert.ok(!has("missing-fk-index", "memberships", "user_id"));
  assert.ok(has("missing-fk-index", "memberships", "team_id"));
});

test("references type: :uuid を _id 列の型に反映する", () => {
  const src = `create_table "posts", id: :uuid, force: :cascade do |t|
  t.references "author", type: :uuid, foreign_key: true
end`;
  const { tables } = parseSchemaRb(src);
  const authorId = tables[0].columns.find((c) => c.name === "author_id");
  assert.equal(authorId.type, "uuid");
});

test("カンマを含む default 値を途中で切らない", () => {
  const src = `create_table "items", force: :cascade do |t|
  t.string "tags", default: ["a", "b"], array: true
end`;
  const { tables } = parseSchemaRb(src);
  const tags = tables[0].columns.find((c) => c.name === "tags");
  assert.equal(tags.hasDefault, true);
  assert.match(tags.defaultValue, /"a".*"b"/);
});

// --- 偽陽性是正の回帰テスト ---

test("非整数の _id 列は FK 候補として警告しない（偽陽性是正）", () => {
  // external_id / legacy_id / payment_id / request_id は string であり、
  // Rails の FK ではない。add_foreign_key の裏付けもないので警告ゼロが正。
  const src = `create_table "events", force: :cascade do |t|
  t.string "external_id", null: false
  t.string "legacy_id"
  t.string "payment_id"
  t.string "request_id"
  t.bigint "user_id", null: false
  t.datetime "created_at", null: false
  t.datetime "updated_at", null: false
  t.index ["user_id"], name: "i_events_user"
end`;
  const has = lintOf(src);
  for (const col of ["external_id", "legacy_id", "payment_id", "request_id"]) {
    assert.ok(!has("missing-fk-index", "events", col));
    assert.ok(!has("fk-column-nullable", "events", col));
    assert.ok(!has("missing-foreign-key-constraint", "events", col));
  }
  // 整数型の真の FK 候補は従来どおり判定する（user_id は索引済みなので漏れなし）。
  assert.ok(!has("missing-fk-index", "events", "user_id"));
});

test("整数型 _id 列の索引漏れは引き続き検出する", () => {
  const src = `create_table "orders", force: :cascade do |t|
  t.bigint "customer_id", null: false
  t.integer "coupon_id"
end`;
  const has = lintOf(src);
  assert.ok(has("missing-fk-index", "orders", "customer_id"));
  assert.ok(has("missing-fk-index", "orders", "coupon_id"));
});

test("非整数 _id でも add_foreign_key の裏付けがあれば FK 候補扱い", () => {
  // uuid 主キー運用で uuid 型 FK を取りこぼさないことの確認。
  const src = `create_table "documents", id: :uuid, force: :cascade do |t|
  t.uuid "owner_id", null: false
end
add_foreign_key "documents", "users", column: "owner_id"`;
  const has = lintOf(src);
  // 裏付けあり・索引なし → 索引漏れとして検出する。
  assert.ok(has("missing-fk-index", "documents", "owner_id"));
});

test("スタンドアロン add_index を索引として認識する（偽陽性是正）", () => {
  // create_table ブロック外の add_index を取りこぼすと索引漏れを誤検出する。
  const src = `create_table "posts", force: :cascade do |t|
  t.bigint "user_id", null: false
  t.string "title"
end
add_index "posts", ["user_id"], name: "index_posts_on_user_id"
add_foreign_key "posts", "users"`;
  const { tables } = parseSchemaRb(src);
  const posts = tables.find((t) => t.name === "posts");
  assert.equal(posts.indexes.length, 1);
  assert.deepEqual(posts.indexes[0].columns, ["user_id"]);
  const has = lintOf(src);
  assert.ok(!has("missing-fk-index", "posts", "user_id"));
});

test("スタンドアロン add_index の unique / 重複も判定に反映する", () => {
  // ブロック内 t.index と トップレベル add_index が同一構成 → 重複索引。
  const src = `create_table "users", force: :cascade do |t|
  t.string "email", null: false
  t.index ["email"], unique: true, name: "i_users_email"
  t.datetime "created_at", null: false
  t.datetime "updated_at", null: false
end
add_index "users", ["email"], unique: true, name: "i_users_email_dup"`;
  const { tables } = parseSchemaRb(src);
  const users = tables.find((t) => t.name === "users");
  assert.equal(users.indexes.length, 2);
  assert.ok(users.indexes.every((ix) => ix.unique === true));
  const has = lintOf(src);
  assert.ok(has("duplicate-index", "users", "email"));
});

test("スタンドアロン add_index は polymorphic 複合索引判定にも合流する", () => {
  const src = `create_table "comments", force: :cascade do |t|
  t.references "commentable", polymorphic: true, null: false, index: false
  t.text "body", null: false
  t.datetime "created_at", null: false
  t.datetime "updated_at", null: false
end
add_index "comments", ["commentable_type", "commentable_id"], name: "i_comments_poly"`;
  const has = lintOf(src);
  // ブロック外 add_index で複合索引が張られているので漏れを誤検出しない。
  assert.ok(!has("polymorphic-missing-composite-index", "comments"));
});

test("polymorphic の type/id が索引先頭2カラムに無ければ漏れと判定する", () => {
  // 左端一致規則: [other, type, id] は (type, id) lookup に乗らない。
  const src = `create_table "comments", force: :cascade do |t|
  t.bigint "account_id", null: false
  t.references "commentable", polymorphic: true, null: false, index: false
  t.text "body", null: false
  t.index ["account_id", "commentable_type", "commentable_id"], name: "i_weird"
end`;
  const has = lintOf(src);
  assert.ok(has("polymorphic-missing-composite-index", "comments"));
});

test("polymorphic の [type, id] が先頭にあれば漏れと判定しない", () => {
  const src = `create_table "comments", force: :cascade do |t|
  t.references "commentable", polymorphic: true, null: false, index: false
  t.text "body", null: false
  t.index ["commentable_type", "commentable_id", "created_at"], name: "i_poly_ts"
  t.datetime "created_at", null: false
end`;
  const has = lintOf(src);
  assert.ok(!has("polymorphic-missing-composite-index", "comments"));
});

test("シングルクォートのテーブル名・カラム名を解析する", () => {
  const src = `create_table 'widgets', force: :cascade do |t|
  t.string 'name', null: false
  t.bigint 'owner_id', null: false
  t.index ['owner_id'], name: 'i_widgets_owner'
end
add_foreign_key 'widgets', 'users', column: 'owner_id'`;
  const { tables, foreignKeys } = parseSchemaRb(src);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].name, "widgets");
  assert.deepEqual(
    tables[0].columns.map((c) => c.name),
    ["name", "owner_id"],
  );
  assert.deepEqual(tables[0].indexes[0].columns, ["owner_id"]);
  assert.equal(foreignKeys[0].fromTable, "widgets");
  assert.equal(foreignKeys[0].toTable, "users");
  assert.equal(foreignKeys[0].column, "owner_id");
  const has = lintOf(src);
  assert.ok(!has("missing-fk-index", "widgets", "owner_id"));
});

test("行末/文中のインラインコメントで論理行が壊れない", () => {
  const src = `create_table "users", force: :cascade do |t|
  t.string "email", # 連絡先
    null: false
  t.string "color", default: "#fff", null: false # クォート内 # は温存
end`;
  const { tables } = parseSchemaRb(src);
  const email = tables[0].columns.find((c) => c.name === "email");
  assert.equal(email.nullable, false); // null: false が消えない
  const color = tables[0].columns.find((c) => c.name === "color");
  assert.ok(color);
  assert.match(color.defaultValue, /#fff/); // 文字列内の # は除去されない
  assert.equal(color.nullable, false);
});

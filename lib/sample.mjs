// RailScope — デモ用 schema.rb。意図的に「本番でハマる地雷」を仕込んである。
// 「サンプルを読み込む」ボタンとユニットテストで共有する。
export const SAMPLE_SCHEMA_RB = `ActiveRecord::Schema[7.1].define(version: 2024_01_15_000000) do
  create_table "users", force: :cascade do |t|
    t.string "email", null: false
    t.string "name"
    t.boolean "admin"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  create_table "posts", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "title", null: false
    t.text "body"
    t.integer "comments_count"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_posts_on_user_id"
  end

  create_table "comments", force: :cascade do |t|
    t.bigint "post_id"
    t.references "commentable", polymorphic: true, null: false, index: false
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "taggings", id: false, force: :cascade do |t|
    t.bigint "post_id", null: false
    t.bigint "tag_id", null: false
  end

  add_foreign_key "posts", "users"
end
`;

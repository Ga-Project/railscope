// RailScope — lint ルールの解説（/rules/ ページの本文と、結果一覧からの「なぜ？」リンクの先）。
// 各ルールの「悪い例」「直した例」は schema.rb の断片で持ち、test/rule-guide.test.mjs が
// 実際の lintSchema に通して「悪い例は検出され、直した例は検出されない」ことを確かめる。
// テストが見るのは例と重大度で、detects の文章そのものは検証しない。lint.mjs の判定を
// 変えたら、ここの文章も対で見直すこと。

/**
 * @typedef {object} RuleGuide
 * @property {string} id         lint.mjs の RULES のキー
 * @property {string} title      見出し（検索で引かれる言い回し）
 * @property {"warning" | "info"} severity lint.mjs が出す重大度と一致させる
 * @property {string} why        なぜ問題になるか
 * @property {string} detects    RailScope がどういう時に指摘するか（実装どおりに書く）
 * @property {string} ignoreWhen 無視してよい場合
 * @property {string} bad        指摘される schema.rb の断片
 * @property {string} good       直した後の schema.rb の断片
 * @property {string} migration  直すマイグレーションの例
 */

/** @type {RuleGuide[]} */
export const RULE_GUIDES = [
  {
    id: "missing-fk-index",
    title: "外部キー列に索引がない",
    severity: "warning",
    why: "`post.comments` のように子テーブルを親の ID で引くクエリや、親を消すときに子を探す処理（dependent: :destroy や ON DELETE）は、外部キー列で絞り込みます。索引が無いと毎回テーブルを全件走査するため、行数が増えたところで急に遅くなります。",
    detects:
      "整数型（bigint / integer）の `*_id` 列と、add_foreign_key で外部キーと宣言された列が対象です。その列を先頭に持つ索引が無いと指摘します。複合索引 `[a, b]` は b 単独の検索に使えないため、b は索引なしとして扱います。string や uuid 型の `*_id`（外部サービスの ID など）は、外部キーと宣言されていない限り対象外です。",
    ignoreWhen:
      "常に数行しかないマスタを指す列。ただし索引のコストは小さいので、迷ったら付けておくのが無難です。",
    bad: `create_table "comments", force: :cascade do |t|
  t.bigint "post_id", null: false
  t.text "body", null: false
  t.timestamps
end`,
    good: `create_table "comments", force: :cascade do |t|
  t.bigint "post_id", null: false
  t.text "body", null: false
  t.timestamps
  t.index ["post_id"], name: "index_comments_on_post_id"
end`,
    migration: `class AddIndexToCommentsPostId < ActiveRecord::Migration[7.1]
  # PostgreSQL の例。大きなテーブルでも書き込みを止めないよう concurrently で作る。
  # MySQL では disable_ddl_transaction! と algorithm: :concurrently を外す
  disable_ddl_transaction!

  def change
    add_index :comments, :post_id, algorithm: :concurrently
  end
end`,
  },
  {
    id: "polymorphic-missing-composite-index",
    title: "polymorphic 関連に [type, id] の複合索引がない",
    severity: "warning",
    why: "polymorphic 関連は `WHERE commentable_type = 'Post' AND commentable_id = 1` の形で引きます。type だけ・id だけの索引や、別の列が先頭に来る複合索引では、この検索を索引で絞り込めません。",
    detects:
      "string 型の `*_type` 列と、同じ名前の `*_id` 列の組（`rails db:schema:dump` が書き出す形）を polymorphic 関連とみなします。手書きの `t.references …, polymorphic: true` も同じ扱いです。先頭 2 列が `*_type` と `*_id`（順不同）の索引が無いと指摘します。この `*_id` には外部キー制約を張れないため、外部キー列向けの指摘（索引・NULL・制約）は出しません。",
    ignoreWhen:
      "その関連を親側から一度も引かない場合に限られます。実際には has_many / has_one 経由で引くことがほとんどです。",
    bad: `create_table "comments", force: :cascade do |t|
  t.string "commentable_type", null: false
  t.bigint "commentable_id", null: false
  t.text "body", null: false
  t.timestamps
end`,
    good: `create_table "comments", force: :cascade do |t|
  t.string "commentable_type", null: false
  t.bigint "commentable_id", null: false
  t.text "body", null: false
  t.timestamps
  t.index ["commentable_type", "commentable_id"], name: "index_comments_on_commentable"
end`,
    migration: `class AddCommentableIndexToComments < ActiveRecord::Migration[7.1]
  def change
    add_index :comments, [:commentable_type, :commentable_id]
  end
end`,
  },
  {
    id: "fk-column-nullable",
    title: "外部キー列が NULL を許している",
    severity: "info",
    why: "Rails 5 以降の既定設定（belongs_to_required_by_default が有効）では、belongs_to は optional: true を付けない限り関連先の存在を検証します。ただしそれはアプリ側の検証で、update_column・insert_all・生の SQL など検証を通らない経路では NULL が入ります。DB 側でも null: false にしておけば、どの経路からでも NULL を拒めます。",
    detects:
      "外部キー列（判定は「外部キー列に索引がない」と同じ）に null: false が付いていないと指摘します。",
    ignoreWhen:
      "モデルで belongs_to …, optional: true にしている関連は NULL 許容が正しい設計です。schema.rb だけではモデル側の optional 指定が分からないため、このルールは「情報」として出しています。",
    bad: `create_table "comments", force: :cascade do |t|
  t.bigint "post_id"
  t.timestamps
  t.index ["post_id"], name: "index_comments_on_post_id"
end`,
    good: `create_table "comments", force: :cascade do |t|
  t.bigint "post_id", null: false
  t.timestamps
  t.index ["post_id"], name: "index_comments_on_post_id"
end`,
    migration: `class MakeCommentsPostIdNotNull < ActiveRecord::Migration[7.1]
  # 先に既存の NULL 行を埋めるか削除しておくこと（残っていると失敗する）
  def change
    change_column_null :comments, :post_id, false
  end
end`,
  },
  {
    id: "missing-foreign-key-constraint",
    title: "外部キー制約（add_foreign_key）がない",
    severity: "info",
    why: "dependent: :destroy は Rails 経由で削除したときにしか働きません。delete・delete_all・生の SQL で親が消えると、子は存在しない親を指したまま残ります（孤児レコード）。DB の外部キー制約なら、経路を問わず親の削除や不正な ID の書き込みを止められます。",
    detects:
      "外部キー列（判定は「外部キー列に索引がない」と同じ）について、add_foreign_key や `t.references …, foreign_key: true` の宣言が無いと指摘します。",
    ignoreWhen:
      "参照先が別のデータベースやシャードにある場合や、親を消した後も履歴として残したいログ用途のテーブル。",
    bad: `create_table "posts", force: :cascade do |t|
  t.string "title", null: false
  t.timestamps
end

create_table "comments", force: :cascade do |t|
  t.bigint "post_id", null: false
  t.timestamps
  t.index ["post_id"], name: "index_comments_on_post_id"
end`,
    good: `create_table "posts", force: :cascade do |t|
  t.string "title", null: false
  t.timestamps
end

create_table "comments", force: :cascade do |t|
  t.bigint "post_id", null: false
  t.timestamps
  t.index ["post_id"], name: "index_comments_on_post_id"
end

add_foreign_key "comments", "posts"`,
    migration: `class AddPostsForeignKeyToComments < ActiveRecord::Migration[7.1]
  def change
    # 大きなテーブル（PostgreSQL）では validate: false で先に張り、
    # 別のマイグレーションで validate_foreign_key :comments, :posts を実行する
    add_foreign_key :comments, :posts
  end
end`,
  },
  {
    id: "no-primary-key",
    title: "主キーも一意索引もないテーブル",
    severity: "warning",
    why: "id: false で作ったテーブルに一意の制約が何も無いと、まったく同じ行が二重に入ってもデータベースは止めません。has_and_belongs_to_many の中間テーブルで、同じ組み合わせが重複登録される典型的な原因です。",
    detects:
      "create_table が id: false で primary_key: の指定も無く、unique な索引も 1 本も無いテーブルを指摘します。",
    ignoreWhen:
      "重複を許す追記専用のログなど、行の一意性が本当に不要なテーブル。",
    bad: `create_table "taggings", id: false, force: :cascade do |t|
  t.bigint "post_id", null: false
  t.bigint "tag_id", null: false
end`,
    good: `create_table "taggings", id: false, force: :cascade do |t|
  t.bigint "post_id", null: false
  t.bigint "tag_id", null: false
  t.index ["post_id", "tag_id"], name: "index_taggings_on_post_id_and_tag_id", unique: true
  t.index ["tag_id"], name: "index_taggings_on_tag_id"
end`,
    migration: `class AddUniqueIndexToTaggings < ActiveRecord::Migration[7.1]
  # 先に重複している行を削除しておくこと（残っていると失敗する）
  def change
    add_index :taggings, [:post_id, :tag_id], unique: true
  end
end`,
  },
  {
    id: "boolean-without-default",
    title: "boolean 列に default がない",
    severity: "info",
    why: "default の無い boolean 列は true・false・NULL の 3 通りの値を取り得ます。SQL では NULL は false と等しくならないため、`User.where(admin: false)` は NULL の行を拾いません。「false のつもりの行」が検索から漏れるバグの元になります。",
    detects:
      "boolean 列に default が無いと指摘します（NULL を許しているかどうかは問いません）。",
    ignoreWhen:
      "「未回答」を NULL で表すなど、3 つ目の状態に意味を持たせている列。その場合は列名やコメントでそれが分かるようにしておくと安全です。",
    bad: `create_table "users", force: :cascade do |t|
  t.string "email", null: false
  t.boolean "admin"
  t.timestamps
end`,
    good: `create_table "users", force: :cascade do |t|
  t.string "email", null: false
  t.boolean "admin", default: false, null: false
  t.timestamps
end`,
    migration: `class SetDefaultOnUsersAdmin < ActiveRecord::Migration[7.1]
  def change
    change_column_default :users, :admin, from: nil, to: false
    # 4 番目の引数で既存の NULL を false に置き換えてから NOT NULL にする
    change_column_null :users, :admin, false, false
  end
end`,
  },
  {
    id: "counter-cache-without-default",
    title: "counter_cache 用の *_count 列が default: 0 でない",
    severity: "info",
    why: "counter_cache の列が NULL から始まると、件数 0 のレコードの値が 0 ではなく nil になります。`post.comments_count + 1` のような Ruby 側の計算が NoMethodError になり、並び替えや集計にも NULL が混ざります。",
    detects:
      "整数型（integer / bigint）で名前が `_count` で終わる列の default が 0 でない（未指定を含む）と指摘します。",
    ignoreWhen:
      "counter_cache 以外の用途で `_count` という名前を使っている列（外部から取り込んだ値など）。",
    bad: `create_table "posts", force: :cascade do |t|
  t.string "title", null: false
  t.integer "comments_count"
  t.timestamps
end`,
    good: `create_table "posts", force: :cascade do |t|
  t.string "title", null: false
  t.integer "comments_count", default: 0, null: false
  t.timestamps
end`,
    migration: `class SetDefaultOnPostsCommentsCount < ActiveRecord::Migration[7.1]
  def change
    change_column_default :posts, :comments_count, from: nil, to: 0
    change_column_null :posts, :comments_count, false, 0
    # 既存行は 0 で埋まるだけなので、実際の件数は Post.reset_counters などで数え直す
  end
end`,
  },
  {
    id: "duplicate-index",
    title: "同じ列の組み合わせの索引が重複している",
    severity: "warning",
    why: "検索に使われるのは 1 本だけなのに、INSERT や UPDATE のたびに両方の索引が更新され、ディスクも二重に消費します。既定で索引を作る t.references と、手書きの add_index を併用したときに起きやすい重複です。",
    detects:
      "同じテーブルに、列の並びが完全に一致し、`where:`（部分索引）・`using:`（gin など索引の種類）・`order:`・`opclass:` などの指定も同じ索引が 2 本以上あると指摘します。これらの指定が違う索引は別物なので指摘しません。unique の有無は区別しません。`[a]` と `[a, b]` のように片方がもう片方の先頭部分になっている組み合わせは対象外です。",
    ignoreWhen:
      "片方が unique なら一意制約を兼ねているので消さず、unique でない方を消してください。schema.rb に現れない指定で使い分けている場合は、消す前に実際の DB の索引定義を確かめてください。",
    bad: `create_table "posts", force: :cascade do |t|
  t.bigint "user_id", null: false
  t.timestamps
  t.index ["user_id"], name: "index_posts_on_user_id"
  t.index ["user_id"], name: "posts_user_id_idx"
end`,
    good: `create_table "posts", force: :cascade do |t|
  t.bigint "user_id", null: false
  t.timestamps
  t.index ["user_id"], name: "index_posts_on_user_id"
end`,
    migration: `class RemoveDuplicatePostsUserIdIndex < ActiveRecord::Migration[7.1]
  def change
    remove_index :posts, :user_id, name: "posts_user_id_idx"
  end
end`,
  },
  {
    id: "missing-timestamps",
    title: "created_at / updated_at がない",
    severity: "info",
    why: "作成日時・更新日時が無いと、不具合調査で「いつ入った行か」を追えず、差分同期もできません。Rails のキャッシュキー（cache_key_with_version）も updated_at を使うため、キャッシュの更新が効かなくなります。",
    detects: "created_at と updated_at の両方が無いテーブルを指摘します。",
    ignoreWhen:
      "has_and_belongs_to_many の中間テーブルのように、行そのものの日時に意味が無いテーブル。",
    bad: `create_table "tags", force: :cascade do |t|
  t.string "name", null: false
end`,
    good: `create_table "tags", force: :cascade do |t|
  t.string "name", null: false
  t.timestamps
end`,
    migration: `class AddTimestampsToTags < ActiveRecord::Migration[7.1]
  def change
    # 既存行があるので、まず NULL 許容で追加して値を埋めてから NOT NULL にする
    add_timestamps :tags, null: true
  end
end`,
  },
];

/**
 * 断片を lint にかけられる完全な schema.rb に包む（テストと UI で共有）。
 * @param {string} body
 */
export function wrapSchema(body) {
  const indented = body
    .split("\n")
    .map((line) => (line === "" ? "" : `  ${line}`))
    .join("\n");
  return `ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do\n${indented}\nend\n`;
}

/**
 * ルール ID から解説ページ内のアンカーを作る（結果一覧からのリンク先）。
 * @param {string} id
 */
export function ruleAnchor(id) {
  return `rule-${id}`;
}

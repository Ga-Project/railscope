// RailScope — 公開URLの単一の出どころ。
// 配信先は環境変数で注入する（deploy.md 参照）。
//   BASE_PATH: サブパス配信のパス（GitHub Pages では /railscope、ルート配信では空）
//   SITE_URL:  公開URL。未指定なら GitHub Pages の URL を BASE_PATH から導く
// canonical・sitemap が配信先と食い違うと検索から 404 に飛ばすので、
// SITE_URL のパスが BASE_PATH と一致しないビルドはここで止める。
const basePath = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");
const raw = process.env.SITE_URL || `https://ga-project.github.io${basePath}/`;

/** 末尾スラッシュ付きに正規化した公開URL（例: https://ga-project.github.io/railscope/） */
export const SITE_URL = raw.endsWith("/") ? raw : `${raw}/`;

const expectedPath = `${basePath}/`;
if (new URL(SITE_URL).pathname !== expectedPath) {
  throw new Error(
    `SITE_URL (${SITE_URL}) のパスが BASE_PATH (${basePath || "なし"}) と一致しません。期待するパス: ${expectedPath}`,
  );
}

/**
 * 公開URL配下の絶対URLを作る。先頭スラッシュは落として SITE_URL のサブパスを保つ。
 * @param {string} path 例: "rules/" / "og.png"
 */
export function absoluteUrl(path = "") {
  return new URL(path.replace(/^\/+/, ""), SITE_URL).toString();
}

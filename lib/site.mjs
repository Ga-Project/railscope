// RailScope — 公開URLの単一の出どころ。
// SITE_URL は配信先ごとに環境変数で注入する（deploy.md 参照）。末尾スラッシュの
// 有無で `${SITE_URL}og.png` のような連結が壊れないよう、ここで必ず正規化する。
const RAW_SITE_URL =
  process.env.SITE_URL ?? "https://ga-project.github.io/railscope/";

/** 末尾スラッシュ付きに正規化した公開URL（例: https://ga-project.github.io/railscope/） */
export const SITE_URL = RAW_SITE_URL.endsWith("/")
  ? RAW_SITE_URL
  : `${RAW_SITE_URL}/`;

/**
 * 公開URL配下の絶対URLを作る。先頭スラッシュは落として SITE_URL のサブパスを保つ。
 * @param {string} path 例: "rules/" / "og.png"
 */
export function absoluteUrl(path = "") {
  return new URL(path.replace(/^\/+/, ""), SITE_URL).toString();
}

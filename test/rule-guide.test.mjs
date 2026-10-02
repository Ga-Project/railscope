// RailScope — ルール解説（/rules/）が lint の実際の挙動と食い違っていないことを確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSchemaRb } from "../lib/parse-schema-rb.mjs";
import { lintSchema, RULES } from "../lib/lint.mjs";
import { RULE_GUIDES, wrapSchema, ruleAnchor } from "../lib/rule-guide.mjs";

const lint = (body) => lintSchema(parseSchemaRb(wrapSchema(body)));

test("lint の全ルールに解説があり、余分な解説もない", () => {
  assert.deepEqual(
    RULE_GUIDES.map((g) => g.id).sort(),
    Object.keys(RULES).sort(),
  );
});

test("ルール ID・アンカーは重複しない", () => {
  const ids = RULE_GUIDES.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(ids.map(ruleAnchor)).size, ids.length);
});

for (const g of RULE_GUIDES) {
  test(`${g.id}: 悪い例は検出され、解説の重大度と一致する`, () => {
    const hits = lint(g.bad).filter((f) => f.rule === g.id);
    assert.ok(hits.length > 0, `悪い例で ${g.id} が出ない`);
    for (const f of hits) assert.equal(f.severity, g.severity);
  });

  test(`${g.id}: 直した例では検出されない`, () => {
    const hits = lint(g.good).filter((f) => f.rule === g.id);
    assert.deepEqual(hits, [], `直した例でも ${g.id} が出る`);
  });

  test(`${g.id}: 本文の必須項目が空でない`, () => {
    for (const key of ["title", "why", "detects", "ignoreWhen", "migration"]) {
      assert.ok(String(g[key]).trim().length > 0, `${key} が空`);
    }
  });
}

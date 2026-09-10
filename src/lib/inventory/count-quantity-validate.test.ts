import assert from "node:assert/strict";
import {
  hasCountedQuantityKey,
  parseStrictCountedQuantity,
} from "./count-quantity-validate";

function runServerQtyValidation() {
  // TEST 8 — null
  assert.deepEqual(parseStrictCountedQuantity(null), { ok: false, reason: "missing" });
  // Number(null) === 0 is the latent bug — must not accept
  assert.notEqual(parseStrictCountedQuantity(null).ok, true);

  // TEST 9 — empty string
  assert.deepEqual(parseStrictCountedQuantity(""), { ok: false, reason: "missing" });
  assert.deepEqual(parseStrictCountedQuantity("   "), { ok: false, reason: "missing" });
  // Number("") === 0 must not slip through
  assert.equal(Number(""), 0);
  assert.equal(parseStrictCountedQuantity("").ok, false);

  // TEST 10 — missing key
  assert.equal(hasCountedQuantityKey({}), false);
  assert.equal(hasCountedQuantityKey({ countedQuantity: null }), true);

  // TEST 11 — explicit zero
  assert.deepEqual(parseStrictCountedQuantity(0), { ok: true, value: 0 });

  // TEST 12 — positive
  assert.deepEqual(parseStrictCountedQuantity(8), { ok: true, value: 8 });
  assert.deepEqual(parseStrictCountedQuantity("8"), { ok: true, value: 8 });

  assert.deepEqual(parseStrictCountedQuantity(undefined), { ok: false, reason: "missing" });
  assert.deepEqual(parseStrictCountedQuantity(-1), { ok: false, reason: "invalid" });
  assert.deepEqual(parseStrictCountedQuantity(Number.NaN), { ok: false, reason: "invalid" });

  console.log("count-quantity-validate: OK");
}

runServerQtyValidation();
console.log("count-quantity-validate.test.ts: OK");

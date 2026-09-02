import assert from "node:assert/strict";
import {
  analyzeWorkerQuantities,
  parseWorkerQtyField,
  stepCountQtyField,
  sumWorkerQuantities,
} from "./count-worker-qty";

function runStepper() {
  // Test 1 — Empty minus
  assert.equal(stepCountQtyField("", -1), "");
  assert.equal(stepCountQtyField(undefined, -1), "");

  // Test 2 — Empty plus
  assert.equal(stepCountQtyField("", 1), "1");

  // Test 3 — One minus
  assert.equal(stepCountQtyField("1", -1), "0");

  // Test 4 — Zero minus
  assert.equal(stepCountQtyField("0", -1), "0");

  // Extra: explicit values
  assert.equal(stepCountQtyField("8", 1), "9");
  assert.equal(stepCountQtyField("8", -1), "7");

  console.log("stepCountQtyField: OK");
}

function runParse() {
  // Test 5 — Manual zero
  assert.equal(parseWorkerQtyField("0"), 0);
  assert.equal(parseWorkerQtyField(""), null);
  assert.equal(parseWorkerQtyField(undefined), null);
  assert.equal(parseWorkerQtyField("8"), 8);
  console.log("parseWorkerQtyField: OK");
}

function runAnalyze() {
  const workers = [
    { id: "fridge", displayName: "מקרר", workArea: "מקרר", displayOrder: 0 },
    { id: "freezer", displayName: "פריזר", workArea: "פריזר", displayOrder: 1 },
  ];

  // Test 6 — Partial workers
  const partial = analyzeWorkerQuantities(workers, { fridge: "8", freezer: "" });
  assert.equal(partial.partialSum, 8);
  assert.equal(partial.complete, false);
  assert.equal(partial.unsetCount, 1);
  assert.equal(partial.total, null);
  assert.equal(sumWorkerQuantities(workers, { fridge: "8", freezer: "" }), null);

  // Test 7 — Explicit zero worker
  const withZero = analyzeWorkerQuantities(workers, { fridge: "8", freezer: "0" });
  assert.equal(withZero.total, 8);
  assert.equal(withZero.complete, true);
  assert.equal(withZero.unsetCount, 0);

  // Test 8 — All explicit zero
  const allZero = analyzeWorkerQuantities(workers, { fridge: "0", freezer: "0" });
  assert.equal(allZero.total, 0);
  assert.equal(allZero.complete, true);

  // Test 9 — Three workers partial
  const three = [
    { id: "a", displayName: "A", workArea: "A", displayOrder: 0 },
    { id: "b", displayName: "B", workArea: "B", displayOrder: 1 },
    { id: "c", displayName: "C", workArea: "C", displayOrder: 2 },
  ];
  const threePartial = analyzeWorkerQuantities(three, { a: "5", b: "0", c: "" });
  assert.equal(threePartial.partialSum, 5);
  assert.equal(threePartial.unsetCount, 1);
  assert.equal(threePartial.complete, false);
  assert.equal(threePartial.total, null);

  // Stepper → analyze: empty minus must not become complete zero
  const afterEmptyMinus = {
    fridge: stepCountQtyField("", -1),
    freezer: stepCountQtyField("", -1),
  };
  assert.equal(afterEmptyMinus.fridge, "");
  assert.equal(afterEmptyMinus.freezer, "");
  const blocked = analyzeWorkerQuantities(workers, afterEmptyMinus);
  assert.equal(blocked.complete, false);

  // Empty plus then analyze
  const afterEmptyPlus = {
    fridge: stepCountQtyField("", 1),
    freezer: stepCountQtyField("", 1),
  };
  assert.deepEqual(afterEmptyPlus, { fridge: "1", freezer: "1" });
  const started = analyzeWorkerQuantities(workers, afterEmptyPlus);
  assert.equal(started.complete, true);
  assert.equal(started.total, 2);

  console.log("analyzeWorkerQuantities stepper scenarios: OK");
}

runStepper();
runParse();
runAnalyze();
console.log("count-worker-qty-stepper.test.ts: OK");

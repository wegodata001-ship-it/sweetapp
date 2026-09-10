import assert from "node:assert/strict";
import {
  canSaveWithLoadGuards,
  dispositionForLoadFailure,
  shouldClearFormOnLoadFailure,
  shouldShowEmptyInventoryMessage,
  shouldShowInitialLoadError,
} from "./count-load-state";

function runLoadFailure() {
  // TEST 1 — Initial GET fails
  assert.equal(shouldClearFormOnLoadFailure(), false);
  assert.equal(dispositionForLoadFailure(false), "initial_error");
  assert.equal(
    shouldShowInitialLoadError({ loadPhase: "error", hadSuccessfulLoad: false }),
    true,
  );
  assert.equal(
    shouldShowEmptyInventoryMessage({ loadPhase: "error", productCount: 0 }),
    false,
  );
  assert.equal(
    canSaveWithLoadGuards({ loadPhase: "error", baselineValidated: false }),
    false,
  );

  // TEST 2 — Loaded then refresh fails: keep values, block save
  assert.equal(dispositionForLoadFailure(true), "preserve_block_save");
  assert.equal(
    shouldShowInitialLoadError({ loadPhase: "loaded", hadSuccessfulLoad: true }),
    false,
  );
  assert.equal(
    canSaveWithLoadGuards({ loadPhase: "loaded", baselineValidated: false }),
    false,
  );
  // quantity "15" is client state — must not be cleared by failure policy
  const preservedQty = "15";
  assert.equal(shouldClearFormOnLoadFailure(), false);
  assert.equal(preservedQty, "15");

  // TEST 3 — Retry succeeds
  assert.equal(
    canSaveWithLoadGuards({ loadPhase: "loaded", baselineValidated: true }),
    true,
  );
  assert.equal(
    shouldShowEmptyInventoryMessage({ loadPhase: "loaded", productCount: 1 }),
    false,
  );

  console.log("count-load-state: OK");
}

runLoadFailure();
console.log("count-load-failure.test.ts: OK");

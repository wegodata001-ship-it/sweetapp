import assert from "node:assert/strict";
import {
  canOfferDraftRestore,
  CURRENT_COUNT_DRAFT_VERSION,
  isCountDraftStale,
  isLegacyCountDraft,
  type CountDraftPayloadV1,
  type CountDraftPayloadV2,
  type CountDraftPayloadV3,
} from "./count-draft";

function runDraftVersioning() {
  const products = [
    { id: "p1", latestCountId: "c100", latestCountCreatedAt: "2026-09-10T10:00:00.000Z" },
  ];

  // TEST 4 — Old draft version not auto-restored
  const v2: CountDraftPayloadV2 = {
    version: 2,
    locationId: "loc1",
    countDate: "2026-09-10",
    actualById: {},
    workerQtyByProduct: { p1: { fridge: "8", freezer: "0" } },
    touchedIds: ["p1"],
    savedAt: "2026-09-10T09:00:00Z",
    baseLatestCountsByProduct: {
      p1: { countId: "c100", createdAt: "2026-09-10T10:00:00.000Z" },
    },
  };
  assert.equal(isLegacyCountDraft(v2), true);
  assert.equal(canOfferDraftRestore(v2, products), false);
  assert.equal(isCountDraftStale(v2, products), true);

  const v1: CountDraftPayloadV1 = {
    version: 1,
    locationId: "loc1",
    countDate: "2026-09-10",
    actualById: {},
    workerQtyByProduct: { p1: { fridge: "0", freezer: "0" } },
    touchedIds: ["p1"],
    savedAt: "2026-09-10T09:00:00Z",
  };
  assert.equal(isLegacyCountDraft(v1), true);
  assert.equal(canOfferDraftRestore(v1, products), false);

  // TEST 5 — Current draft 8 + "" preserved
  const v3Empty: CountDraftPayloadV3 = {
    version: CURRENT_COUNT_DRAFT_VERSION,
    locationId: "loc1",
    countDate: "2026-09-10",
    actualById: {},
    workerQtyByProduct: { p1: { fridge: "8", freezer: "" } },
    touchedIds: ["p1"],
    savedAt: "2026-09-10T11:00:00Z",
    baseLatestCountsByProduct: {
      p1: { countId: "c100", createdAt: "2026-09-10T10:00:00.000Z" },
    },
  };
  assert.equal(canOfferDraftRestore(v3Empty, products), true);
  assert.equal(v3Empty.workerQtyByProduct.p1!.fridge, "8");
  assert.equal(v3Empty.workerQtyByProduct.p1!.freezer, "");

  // TEST 6 — Current draft 8 + explicit 0 preserved
  const v3Zero: CountDraftPayloadV3 = {
    ...v3Empty,
    workerQtyByProduct: { p1: { fridge: "8", freezer: "0" } },
  };
  assert.equal(canOfferDraftRestore(v3Zero, products), true);
  assert.equal(v3Zero.workerQtyByProduct.p1!.freezer, "0");

  // TEST 7 — Stale baseline
  assert.equal(
    isCountDraftStale(v3Empty, [
      { id: "p1", latestCountId: "c999", latestCountCreatedAt: "2026-09-10T12:00:00.000Z" },
    ]),
    true,
  );
  assert.equal(
    canOfferDraftRestore(v3Empty, [
      { id: "p1", latestCountId: "c999", latestCountCreatedAt: "2026-09-10T12:00:00.000Z" },
    ]),
    false,
  );

  assert.equal(CURRENT_COUNT_DRAFT_VERSION, 3);
  console.log("count-draft-version: OK");
}

runDraftVersioning();
console.log("count-draft-version.test.ts: OK");

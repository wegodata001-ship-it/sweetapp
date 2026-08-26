import assert from "node:assert/strict";
import { pickLatestCountForLocation } from "./count-latest";
import {
  buildBaseCountsFromProducts,
  countDraftStorageKey,
  isCountDraftStale,
  type CountDraftPayloadV2,
} from "./count-draft";

function runConcurrencyLogic() {
  /** מדמה בדיקת שרת: base count id חייב להתאים ל-latest */
  function assertBaseMatchesLatest(
    baseId: string,
    counts: { id: string; locationId: string | null; createdAt: Date }[],
    locationId: string,
  ): boolean {
    const latest = pickLatestCountForLocation(counts, locationId);
    return latest?.id === baseId;
  }

  const counts = [
    { id: "c100", locationId: "loc1", createdAt: new Date("2026-08-26T09:00:00Z") },
  ];
  assert.equal(assertBaseMatchesLatest("c100", counts, "loc1"), true);

  // אחרי שמירה — DB מחזיר רק latest (distinct)
  const countsAfterSave = [
    { id: "c101", locationId: "loc1", createdAt: new Date("2026-08-26T10:00:00Z") },
  ];
  assert.equal(assertBaseMatchesLatest("c100", countsAfterSave, "loc1"), false);
  assert.equal(assertBaseMatchesLatest("c101", countsAfterSave, "loc1"), true);

  console.log("count-concurrency logic: OK");
}

function runDraftStale() {
  const draft: CountDraftPayloadV2 = {
    version: 2,
    locationId: "loc1",
    countDate: "2026-08-26",
    actualById: {},
    workerQtyByProduct: { p1: { w1: "8", w2: "7" } },
    touchedIds: ["p1"],
    savedAt: "2026-08-26T10:00:00Z",
    baseLatestCountsByProduct: {
      p1: { countId: "c100", createdAt: "2026-08-26T09:00:00.000Z" },
    },
  };

  assert.equal(
    isCountDraftStale(draft, [
      { id: "p1", latestCountId: "c100", latestCountCreatedAt: "2026-08-26T09:00:00.000Z" },
    ]),
    false,
  );

  assert.equal(
    isCountDraftStale(draft, [
      { id: "p1", latestCountId: "c101", latestCountCreatedAt: "2026-08-26T10:30:00.000Z" },
    ]),
    true,
  );

  const bases = buildBaseCountsFromProducts([
    { id: "p1", latestCountId: "c100", latestCountCreatedAt: "t1" },
    { id: "p2", latestCountId: "c200", latestCountCreatedAt: "t2" },
  ]);
  assert.equal(bases.p1.countId, "c100");
  assert.equal(bases.p2.countId, "c200");

  // בידוד מיקומים — מפתח Draft שונה
  assert.notEqual(
    countDraftStorageKey("locA", "2026-08-26"),
    countDraftStorageKey("locB", "2026-08-26"),
  );

  console.log("count-draft stale: OK");
}

runConcurrencyLogic();
runDraftStale();

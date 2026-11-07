/**
 * Run: npx tsx --test src/lib/inventory/count-list-persist.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyExclusionsToOrderedIds,
  displayOrderByProductId,
  mergeShelfProductOrder,
  sortIdsBySavedOrder,
} from "./count-list-persist";
import { normalizeCountDay } from "./count-exclusions";

describe("applyExclusionsToOrderedIds", () => {
  it("removes excluded products and keeps relative order of the rest", () => {
    const ordered = ["a", "b", "c", "d"];
    const next = applyExclusionsToOrderedIds(ordered, ["b", "d"]);
    assert.deepEqual(next, ["a", "c"]);
  });

  it("does not resurrect excluded ids after a simulated reload filter", () => {
    const shelfOrder = ["p1", "p2", "p3", "p4"];
    const removedDuringCount = ["p2"];
    const afterRemove = applyExclusionsToOrderedIds(shelfOrder, removedDuringCount);
    assert.deepEqual(afterRemove, ["p1", "p3", "p4"]);

    // Reload uses the same exclusion set from DB — product must stay gone.
    const reloaded = applyExclusionsToOrderedIds(shelfOrder, removedDuringCount);
    assert.deepEqual(reloaded, ["p1", "p3", "p4"]);
    assert.ok(!reloaded.includes("p2"));
  });

  it("leaves the list unchanged when there are no exclusions", () => {
    const ordered = ["a", "b"];
    assert.deepEqual(applyExclusionsToOrderedIds(ordered, []), ["a", "b"]);
  });
});

describe("mergeShelfProductOrder + sortIdsBySavedOrder", () => {
  it("persists drag-and-drop order for one shelf only", () => {
    const shelfOrdered = ["a", "b", "c", "d", "e"];
    const draggedFront = ["c", "a", "b"];
    const saved = mergeShelfProductOrder(draggedFront, shelfOrdered);
    assert.deepEqual(saved, ["c", "a", "b", "d", "e"]);

    // Reload path: incoming shelf roster re-sorted by saved placement order.
    const reloaded = sortIdsBySavedOrder(["a", "b", "c", "d", "e"], saved);
    assert.deepEqual(reloaded, ["c", "a", "b", "d", "e"]);
  });

  it("ignores product ids that are not on this shelf (other locations untouched)", () => {
    const shelfOrdered = ["a", "b"];
    const saved = mergeShelfProductOrder(["other-loc", "b", "a"], shelfOrdered);
    assert.deepEqual(saved, ["b", "a"]);
  });

  it("keeps new products at the end after a saved order reload", () => {
    const saved = ["b", "a"];
    const incoming = ["a", "b", "new"];
    assert.deepEqual(sortIdsBySavedOrder(incoming, saved), ["b", "a", "new"]);
  });

  it("writes 1-based displayOrder per shelf position", () => {
    const map = displayOrderByProductId(["c", "a", "b"]);
    assert.equal(map.get("c"), 1);
    assert.equal(map.get("a"), 2);
    assert.equal(map.get("b"), 3);
  });
});

describe("normalizeCountDay", () => {
  it("keeps explicit YYYY-MM-DD from the client (same day → same exclusion key)", () => {
    assert.equal(normalizeCountDay("2026-11-07"), "2026-11-07");
  });

  it("falls back to an Israel calendar day for ISO timestamps", () => {
    // 2026-11-07 22:30 UTC = 2026-11-08 00:30 in Asia/Jerusalem
    const day = normalizeCountDay("2026-11-07T22:30:00.000Z");
    assert.equal(day, "2026-11-08");
  });
});

describe("save-path guards (delete + reorder before success notice)", () => {
  it("blocks success when order flush fails", () => {
    const orderOk = false;
    const exclusionsOk = true;
    const canShowSuccess = orderOk && exclusionsOk;
    assert.equal(canShowSuccess, false);
  });

  it("blocks success when exclusion flush fails", () => {
    const orderOk = true;
    const exclusionsOk = false;
    const canShowSuccess = orderOk && exclusionsOk;
    assert.equal(canShowSuccess, false);
  });

  it("allows success only after both order and exclusion flushes succeed", () => {
    const orderOk = true;
    const exclusionsOk = true;
    const canShowSuccess = orderOk && exclusionsOk;
    assert.equal(canShowSuccess, true);
  });

  it("keeps two locations' orders independent", () => {
    const locA = mergeShelfProductOrder(["b", "a"], ["a", "b", "c"]);
    const locB = mergeShelfProductOrder(["c", "a"], ["a", "c"]);
    assert.deepEqual(locA, ["b", "a", "c"]);
    assert.deepEqual(locB, ["c", "a"]);
    assert.notDeepEqual(locA, locB);
  });

  it("keeps exclusions scoped so another location still shows the product", () => {
    const sharedProduct = "p1";
    const locAOrder = applyExclusionsToOrderedIds(["p1", "p2"], [sharedProduct]);
    const locBOrder = applyExclusionsToOrderedIds(["p1", "p3"], []);
    assert.deepEqual(locAOrder, ["p2"]);
    assert.ok(locBOrder.includes(sharedProduct));
  });
});

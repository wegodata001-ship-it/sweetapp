/**
 * Run: npx tsx --test src/lib/dashboard/time-range.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundsForDashboardRange } from "@/lib/dashboard/time-range";

describe("boundsForDashboardRange", () => {
  const anchor = new Date(2026, 9, 1, 15, 30, 0, 0);

  it("today is start of local day through end of local day", () => {
    const { from, to } = boundsForDashboardRange("today", anchor);
    assert.equal(from.getFullYear(), 2026);
    assert.equal(from.getMonth(), 9);
    assert.equal(from.getDate(), 1);
    assert.equal(from.getHours(), 0);
    assert.equal(to.getDate(), 1);
    assert.equal(to.getHours(), 23);
    assert.equal(to.getMinutes(), 59);
  });

  it("week is Sunday start through today — same business week as Z/wedding filters", () => {
    const { from, to } = boundsForDashboardRange("week", anchor);
    assert.equal(from.getDay(), 0);
    assert.equal(from.getDate(), 27);
    assert.equal(from.getMonth(), 8);
    assert.equal(to.getDate(), 1);
    assert.equal(to.getMonth(), 9);
  });

  it("month is first of current month through today", () => {
    const { from, to } = boundsForDashboardRange("month", anchor);
    assert.equal(from.getDate(), 1);
    assert.equal(from.getMonth(), 9);
    assert.equal(from.getHours(), 0);
    assert.equal(to.getDate(), 1);
    assert.equal(to.getMonth(), 9);
  });
});

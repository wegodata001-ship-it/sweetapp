import assert from "node:assert/strict";
import {
  addCalendarDaysYmd,
  changeFlags,
  isPositiveToZero,
  isSignificantDrop,
  resolveQuickRange,
} from "./count-history-audit";

assert.equal(isPositiveToZero(20, 0), true);
assert.equal(isPositiveToZero(0, 0), false);
assert.equal(isPositiveToZero(20, 1), false);

assert.equal(isSignificantDrop(20, 8), true);
assert.equal(isSignificantDrop(20, 10), false);
assert.equal(isSignificantDrop(0, 0), false);

const up = changeFlags(8, 20);
assert.equal(up.direction, "up");
assert.equal(up.positiveToZero, false);

const down = changeFlags(15, 8);
assert.equal(down.direction, "down");
assert.equal(down.significantDrop, false);

const zero = changeFlags(10, 0);
assert.equal(zero.positiveToZero, true);
assert.equal(zero.significantDrop, true);

assert.equal(addCalendarDaysYmd("2026-09-01", -1), "2026-08-31");

const week = resolveQuickRange("7d");
assert.ok(week.dateFrom <= week.dateTo);

console.log("count-history-audit.test.ts: OK");

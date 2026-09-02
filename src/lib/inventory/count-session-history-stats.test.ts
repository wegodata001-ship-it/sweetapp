/**
 * Unit smoke for history audit flags + session list shape (no DB).
 */
import assert from "node:assert/strict";
import { changeFlags } from "./count-history-audit";

function lineStats(
  lines: Array<{ previousQuantity: number; currentQuantity: number; difference: number }>,
) {
  let changedCount = 0;
  let unchangedCount = 0;
  let positiveToZeroCount = 0;
  let significantDropCount = 0;
  for (const line of lines) {
    if (Math.abs(line.difference) < 1e-9) unchangedCount += 1;
    else changedCount += 1;
    if (line.previousQuantity > 0 && line.currentQuantity === 0) positiveToZeroCount += 1;
    if (line.previousQuantity > 0 && line.currentQuantity < line.previousQuantity * 0.5) {
      significantDropCount += 1;
    }
  }
  return { changedCount, unchangedCount, positiveToZeroCount, significantDropCount };
}

const sample = [
  { previousQuantity: 15, currentQuantity: 15, difference: 0 },
  { previousQuantity: 20, currentQuantity: 17, difference: -3 },
  { previousQuantity: 8, currentQuantity: 12, difference: 4 },
  { previousQuantity: 10, currentQuantity: 0, difference: -10 },
  { previousQuantity: 20, currentQuantity: 8, difference: -12 },
];

const stats = lineStats(sample);
assert.equal(stats.unchangedCount, 1);
assert.equal(stats.changedCount, 4);
assert.equal(stats.positiveToZeroCount, 1);
assert.equal(stats.significantDropCount, 2);

assert.equal(changeFlags(15, 15).direction, "flat");
assert.equal(changeFlags(8, 20).direction, "up");
assert.equal(changeFlags(15, 8).direction, "down");

console.log("count-session-history-stats.test.ts: OK");

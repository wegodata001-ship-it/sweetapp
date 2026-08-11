import assert from "node:assert/strict";
import {
  pickLatestCountForLocation,
  previousQtyFromCounts,
  requiredQtyToMinimum,
  systemTotalFromCounts,
} from "./count-latest";

function run() {
  // TEST 1: אותו מוצר בשני מחסנים — כל מחסן עצמאי; SUM רק גלובלי
  const sugarCounts = [
    { locationId: "wh1", currentQuantity: 20 },
    { locationId: "wh2", currentQuantity: 20 },
  ];
  assert.equal(previousQtyFromCounts(sugarCounts, "wh1"), 20);
  assert.equal(previousQtyFromCounts(sugarCounts, "wh2"), 20);
  assert.equal(systemTotalFromCounts(sugarCounts), 40);

  // TEST 2: עדכון מחסן 1 בלבד לא משנה מחסן 2
  const afterRecount = [
    { locationId: "wh1", currentQuantity: 25 },
    { locationId: "wh2", currentQuantity: 20 },
  ];
  assert.equal(previousQtyFromCounts(afterRecount, "wh1"), 25);
  assert.equal(previousQtyFromCounts(afterRecount, "wh2"), 20);
  assert.equal(systemTotalFromCounts(afterRecount), 45);

  // TEST 3/4: אין ערבוב — ספירה במחסן אחר לא נחשבת למיקום הנוכחי
  assert.equal(previousQtyFromCounts([{ locationId: "wh2", currentQuantity: 99 }], "wh1"), 0);
  assert.equal(
    pickLatestCountForLocation([{ locationId: "wh2", currentQuantity: 99 }], "wh1"),
    null,
  );

  // legacy: רק כשאין בכלל locationId
  assert.equal(
    previousQtyFromCounts([{ locationId: null, currentQuantity: 7 }], "wh1"),
    7,
  );

  // required qty לפי מלאי המיקום
  assert.equal(requiredQtyToMinimum(12, 20), 8);
  assert.equal(requiredQtyToMinimum(25, 20), 0);

  // לא כפילות legacy כשיש מיקומים מודרניים
  assert.equal(
    systemTotalFromCounts([
      { locationId: null, currentQuantity: 100 },
      { locationId: "a", currentQuantity: 12 },
      { locationId: "b", currentQuantity: 8 },
    ]),
    20,
  );

  console.log("count-latest.test.ts: OK (location isolation)");
}

run();

import assert from "node:assert/strict";
import {
  previousQtyFromCounts,
  requiredQtyToMinimum,
  systemTotalFromCounts,
} from "./count-latest";

function run() {
  // إجمالي المخزون — סכום כל המיקומים
  assert.equal(
    systemTotalFromCounts([
      { locationId: "a", currentQuantity: 12 },
      { locationId: "b", currentQuantity: 8 },
      { locationId: "c", currentQuantity: 5 },
    ]),
    25,
  );

  // לא סופרים legacy כשיש מיקומים מודרניים
  assert.equal(
    systemTotalFromCounts([
      { locationId: null, currentQuantity: 100 },
      { locationId: "a", currentQuantity: 12 },
      { locationId: "b", currentQuantity: 8 },
    ]),
    20,
  );

  // الكمية المطلوبة — חסר למינימום, לא שלילי
  assert.equal(requiredQtyToMinimum(12, 20), 8);
  assert.equal(requiredQtyToMinimum(25, 20), 0);
  assert.equal(requiredQtyToMinimum(10, 0), 0);

  // previous qty לפי מיקום
  assert.equal(
    previousQtyFromCounts(
      [
        { locationId: "a", currentQuantity: 12 },
        { locationId: "b", currentQuantity: 8 },
      ],
      "b",
    ),
    8,
  );

  console.log("count-latest.test.ts: OK");
}

run();

import assert from "node:assert/strict";
import { canEditWeekdayMinimums } from "./count-access";
import { requiredQtyToMinimum } from "./count-latest";
import {
  israelWeekdayIndex,
  israelWeekdayIndexFromCountDay,
  resolveTodayMinimum,
  resolveTodayMinimumForCountDay,
  weekdayFieldForCountDay,
  WEEKDAY_MINIMUM_FIELDS,
} from "./weekday-minimum";

function run() {
  const sunday = "2026-08-23";

  // Sunday=0 … Saturday=6 in Israel
  assert.equal(WEEKDAY_MINIMUM_FIELDS[0], "minimumSun");
  assert.equal(WEEKDAY_MINIMUM_FIELDS[6], "minimumSat");

  // explicit weekday column for count day (Sunday)
  assert.equal(
    resolveTodayMinimumForCountDay(
      {
        minimumSun: 29,
        minimumMon: 35,
        minimumQuantity: 10,
      },
      5,
      sunday,
    ),
    29,
  );

  // null → placement legacy fallback
  assert.equal(
    resolveTodayMinimum({ minimumMon: null, minimumQuantity: 29 }, 10),
    29,
  );

  // null chain → product fallback
  assert.equal(
    resolveTodayMinimum({ minimumQuantity: null }, 15),
    15,
  );

  // explicit 0 on weekday stays 0 (not fallback)
  assert.equal(
    resolveTodayMinimumForCountDay(
      { minimumSun: 0, minimumQuantity: 29 },
      10,
      sunday,
    ),
    0,
  );
  assert.equal(requiredQtyToMinimum(18, 0), 0);

  // placement fallback when weekday null
  assert.equal(
    resolveTodayMinimumForCountDay(
      { minimumSun: null, minimumQuantity: 29 },
      10,
      sunday,
    ),
    29,
  );

  // product fallback
  assert.equal(
    resolveTodayMinimumForCountDay({ minimumSun: null, minimumQuantity: null }, 12, sunday),
    12,
  );

  // final 0
  assert.equal(
    resolveTodayMinimumForCountDay(
      { minimumSun: null, minimumQuantity: null },
      null,
      sunday,
    ),
    0,
  );

  // same product, two locations — isolation
  const locA = resolveTodayMinimumForCountDay(
    { minimumSun: 29, minimumQuantity: 10 },
    5,
    sunday,
  );
  const locB = resolveTodayMinimumForCountDay(
    { minimumSun: 40, minimumQuantity: 10 },
    5,
    sunday,
  );
  assert.equal(locA, 29);
  assert.equal(locB, 40);

  // shortage math
  assert.equal(requiredQtyToMinimum(18, 29), 11);
  assert.equal(requiredQtyToMinimum(35, 29), 0);

  // changing minimum does not change counted quantity (metadata only)
  const counted = 15;
  assert.equal(counted, 15);
  const shortageBefore = requiredQtyToMinimum(counted, 20);
  const shortageAfter = requiredQtyToMinimum(counted, 40);
  assert.equal(counted, 15);
  assert.equal(shortageBefore, 5);
  assert.equal(shortageAfter, 25);

  // snapshot isolation — historical min independent of new weekday table
  const historicalSnapshot = 29;
  const newTodayMin = resolveTodayMinimumForCountDay(
    { minimumSun: 40, minimumQuantity: 40 },
    5,
    sunday,
  );
  assert.equal(historicalSnapshot, 29);
  assert.equal(newTodayMin, 40);

  // timezone: Israel midnight edge
  const wedIsrael = new Date("2026-08-26T17:00:00.000Z"); // 20:00 Israel Wed
  const thuIsrael = new Date("2026-08-26T21:00:00.000Z"); // 00:00 Israel Thu
  assert.equal(israelWeekdayIndex(wedIsrael), 3);
  assert.equal(israelWeekdayIndex(thuIsrael), 4);

  // countDay field mapping
  assert.equal(weekdayFieldForCountDay("2026-08-23"), "minimumSun");

  // permissions
  assert.equal(canEditWeekdayMinimums("ADMIN"), true);
  assert.equal(canEditWeekdayMinimums("SUPER_ADMIN"), true);
  assert.equal(canEditWeekdayMinimums("EMPLOYEE"), false);
  assert.equal(canEditWeekdayMinimums("USER"), false);

  console.log("weekday-minimum.test.ts: OK");
}

run();

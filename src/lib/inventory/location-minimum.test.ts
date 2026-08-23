import assert from "node:assert/strict";
import {
  locationMinimumStatus,
  requiredQtyToMinimum,
  resolveCountDefaultMinimum,
  resolveLocationMinimum,
} from "./count-latest";

function run() {
  // TEST 1: מינימום לפי מקום — placement גובר על גלובלי
  assert.equal(resolveLocationMinimum(15, 10), 15);
  assert.equal(resolveLocationMinimum(null, 10), 10);
  assert.equal(resolveLocationMinimum(undefined, 30), 30);
  // מחסן 1 = 15 לא משפיע על מחסן 2 = 30 (ערכים נפרדים)
  const wh1 = resolveLocationMinimum(15, 10);
  const wh2 = resolveLocationMinimum(30, 10);
  assert.equal(wh1, 15);
  assert.equal(wh2, 30);

  // TEST 2: מתחת למינימום
  const below = locationMinimumStatus(7, 10);
  assert.equal(below.status, "below");
  assert.equal(below.shortage, 3);
  assert.equal(requiredQtyToMinimum(7, 10), 3);

  // TEST 3: תקין
  const ok = locationMinimumStatus(15, 10);
  assert.equal(ok.status, "ok");
  assert.equal(ok.shortage, 0);

  // TEST 4: שינוי מינימום לא משנה כמות — רק shortage
  const counted = 8;
  const afterMinChange = locationMinimumStatus(counted, 12);
  assert.equal(counted, 8);
  assert.equal(afterMinChange.status, "below");
  assert.equal(afterMinChange.shortage, 4);

  // TEST 5: ברירת מחדל לספירה חדשה = snapshot אחרון (לא placement נוכחי)
  assert.equal(
    resolveCountDefaultMinimum({
      hasLastCountForLocation: true,
      lastCountMinimum: 8,
      placementMinimum: 99,
      productMinimum: 5,
    }),
    8,
  );
  // יום חדש אחרי שינוי ל־12
  assert.equal(
    resolveCountDefaultMinimum({
      hasLastCountForLocation: true,
      lastCountMinimum: 12,
      placementMinimum: 8,
      productMinimum: 5,
    }),
    12,
  );
  // אין ספירה קודמת במיקום — placement
  assert.equal(
    resolveCountDefaultMinimum({
      hasLastCountForLocation: false,
      lastCountMinimum: null,
      placementMinimum: 30,
      productMinimum: 10,
    }),
    30,
  );
  // מחסנים נפרדים — snapshot שונה לכל מיקום
  const locA = resolveCountDefaultMinimum({
    hasLastCountForLocation: true,
    lastCountMinimum: 10,
    placementMinimum: 10,
    productMinimum: 5,
  });
  const locB = resolveCountDefaultMinimum({
    hasLastCountForLocation: true,
    lastCountMinimum: 30,
    placementMinimum: 30,
    productMinimum: 5,
  });
  assert.equal(locA, 10);
  assert.equal(locB, 30);
  // חסר = max(min - counted, 0)
  assert.equal(requiredQtyToMinimum(5, 8), 3);
  assert.equal(requiredQtyToMinimum(20, 8), 0);

  console.log("location-minimum.test.ts: OK");
}

run();

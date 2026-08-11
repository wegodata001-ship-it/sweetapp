import assert from "node:assert/strict";
import {
  locationMinimumStatus,
  requiredQtyToMinimum,
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

  console.log("location-minimum.test.ts: OK");
}

run();

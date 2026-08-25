import assert from "node:assert/strict";
import { buildPrefillFromLastCount } from "./count-prefill";

function run() {
  // בלי workers — כולם רואים את מלאי המיקום
  {
    const r = buildPrefillFromLastCount(
      [{ id: "p1", previousQuantity: 15 }],
      [],
    );
    assert.equal(r.actual.p1, "15");
  }

  // workers בלי lastWorkerQtys — previousQuantity על האתר הראשון
  {
    const r = buildPrefillFromLastCount(
      [{ id: "p1", previousQuantity: 15, lastWorkerQtys: [] }],
      [{ id: "w1" }, { id: "w2" }],
    );
    assert.equal(r.workerQty.p1!.w1, "15");
    assert.equal(r.workerQty.p1!.w2, "0");
  }

  // workers עם IDs תואמים — שומרים פירוט
  {
    const r = buildPrefillFromLastCount(
      [
        {
          id: "p1",
          previousQuantity: 20,
          lastWorkerQtys: [
            { inventoryLocationWorkerId: "w1", countedQuantity: 12 },
            { inventoryLocationWorkerId: "w2", countedQuantity: 8 },
          ],
        },
      ],
      [{ id: "w1" }, { id: "w2" }],
    );
    assert.equal(r.workerQty.p1!.w1, "12");
    assert.equal(r.workerQty.p1!.w2, "8");
  }

  // BUG regression: lastWorkerQtys קיימים אבל IDs לא תואמים —
  // אסור להציג 0 כש־previousQuantity=15 (מנהל/עובד / מובייל)
  {
    const r = buildPrefillFromLastCount(
      [
        {
          id: "croissant",
          previousQuantity: 15,
          lastWorkerQtys: [
            { inventoryLocationWorkerId: "old-worker-id", countedQuantity: 15 },
          ],
        },
      ],
      [{ id: "new-worker-id" }],
    );
    assert.equal(r.workerQty.croissant!["new-worker-id"], "15");
  }

  // שני משתמשים / שני workers — אותו previousQuantity (לא user-scoped)
  {
    const admin = buildPrefillFromLastCount(
      [{ id: "sugar", previousQuantity: 20 }],
      [],
    );
    const employee = buildPrefillFromLastCount(
      [{ id: "sugar", previousQuantity: 20 }],
      [],
    );
    assert.equal(admin.actual.sugar, employee.actual.sugar);
    assert.equal(employee.actual.sugar, "20");
  }

  // מיקומים נפרדים — כמויות עצמאיות
  {
    const loc1 = buildPrefillFromLastCount([{ id: "sugar", previousQuantity: 20 }], []);
    const loc2 = buildPrefillFromLastCount([{ id: "sugar", previousQuantity: 30 }], []);
    assert.equal(loc1.actual.sugar, "20");
    assert.equal(loc2.actual.sugar, "30");
  }

  console.log("count-prefill.test.ts: OK");
}

run();

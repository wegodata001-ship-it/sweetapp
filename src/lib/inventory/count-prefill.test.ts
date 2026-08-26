import assert from "node:assert/strict";
import { analyzeWorkerQuantities, sumWorkerQuantities } from "./count-worker-qty";
import { buildPrefillFromLastCount } from "./count-prefill";

const fridgeFreezerWorkers = [
  { id: "w1", workArea: "מקרר", displayName: "מקרר" },
  { id: "w2", workArea: "פריזר", displayName: "פריזר" },
];

function runPrefill() {
  // בלי workers — כולם רואים את מלאי המיקום
  {
    const r = buildPrefillFromLastCount([{ id: "p1", previousQuantity: 15 }], []);
    assert.equal(r.actual.p1, "15");
  }

  // workers בלי lastWorkerQtys — כל הנקודות unset (לא previousQuantity על worker ראשון)
  {
    const r = buildPrefillFromLastCount(
      [{ id: "p1", previousQuantity: 15, lastWorkerQtys: [] }],
      fridgeFreezerWorkers,
    );
    assert.equal(r.workerQty.p1!.w1, "");
    assert.equal(r.workerQty.p1!.w2, "");
  }

  // אין התאמה בין היסטוריה ל-roster — כל unset
  {
    const r = buildPrefillFromLastCount(
      [
        {
          id: "p1",
          previousQuantity: 15,
          lastWorkerQtys: [
            { inventoryLocationWorkerId: "old-only", countedQuantity: 15 },
          ],
        },
      ],
      [{ id: "new-only", displayName: "כללי" }],
    );
    assert.equal(r.workerQty.p1!["new-only"], "");
  }

  // exact ID match
  {
    const r = buildPrefillFromLastCount(
      [
        {
          id: "p1",
          previousQuantity: 20,
          lastWorkerQtys: [
            { inventoryLocationWorkerId: "w1", countedQuantity: 12, workerWorkArea: "מקרר" },
            { inventoryLocationWorkerId: "w2", countedQuantity: 8, workerWorkArea: "פריזר" },
          ],
        },
      ],
      fridgeFreezerWorkers,
    );
    assert.equal(r.workerQty.p1!.w1, "12");
    assert.equal(r.workerQty.p1!.w2, "8");
  }

  // partial ID + unique workArea → סה"כ 15
  {
    const r = buildPrefillFromLastCount(
      [
        {
          id: "pie",
          previousQuantity: 15,
          lastWorkerQtys: [
            {
              inventoryLocationWorkerId: "old-fridge",
              countedQuantity: 8,
              workerWorkArea: "מקרר",
            },
            {
              inventoryLocationWorkerId: "old-freezer",
              countedQuantity: 7,
              workerWorkArea: "פריזר",
            },
          ],
        },
      ],
      [
        { id: "same-fridge", workArea: "מקרר" },
        { id: "new-freezer", workArea: "פריזר" },
      ],
    );
    assert.equal(r.workerQty.pie!["same-fridge"], "8");
    assert.equal(r.workerQty.pie!["new-freezer"], "7");
    const analysis = analyzeWorkerQuantities(
      [
        { id: "same-fridge", displayName: "", workArea: "מקרר", displayOrder: 0 },
        { id: "new-freezer", displayName: "", workArea: "פריזר", displayOrder: 1 },
      ],
      r.workerQty.pie!,
    );
    assert.equal(analysis.total, 15);
  }

  // ID match + workArea match (פריזר id חדש)
  {
    const r = buildPrefillFromLastCount(
      [
        {
          id: "p1",
          previousQuantity: 15,
          lastWorkerQtys: [
            { inventoryLocationWorkerId: "1", countedQuantity: 8, workerWorkArea: "מקרר" },
            { inventoryLocationWorkerId: "2", countedQuantity: 7, workerWorkArea: "פריזר" },
          ],
        },
      ],
      [
        { id: "1", workArea: "מקרר" },
        { id: "999", workArea: "פריזר" },
      ],
    );
    assert.equal(r.workerQty.p1!["1"], "8");
    assert.equal(r.workerQty.p1!["999"], "7");
  }

  // partial match — workArea לא ייחודי → unset
  {
    const r = buildPrefillFromLastCount(
      [
        {
          id: "p1",
          previousQuantity: 15,
          lastWorkerQtys: [
            { inventoryLocationWorkerId: "w1", countedQuantity: 8, workerWorkArea: "מקרר" },
            { inventoryLocationWorkerId: "old-f", countedQuantity: 7, workerWorkArea: "פריזר" },
          ],
        },
      ],
      [
        { id: "w1", workArea: "מקרר" },
        { id: "w-new", workArea: "מחסן אחר" },
      ],
    );
    assert.equal(r.workerQty.p1!.w1, "8");
    assert.equal(r.workerQty.p1!["w-new"], "");
  }

  // duplicate workArea ב-roster נוכחי → unset (לא guessing)
  {
    const r = buildPrefillFromLastCount(
      [
        {
          id: "p1",
          previousQuantity: 10,
          lastWorkerQtys: [
            { inventoryLocationWorkerId: "old", countedQuantity: 8, workerWorkArea: "מקרר" },
          ],
        },
      ],
      [
        { id: "a", workArea: "מקרר", displayName: "א" },
        { id: "b", workArea: "מקרר", displayName: "ב" },
      ],
    );
    assert.equal(r.workerQty.p1!.a, "");
    assert.equal(r.workerQty.p1!.b, "");
  }

  // duplicate displayName ב-roster נוכחי → unset
  {
    const r = buildPrefillFromLastCount(
      [
        {
          id: "p1",
          previousQuantity: 10,
          lastWorkerQtys: [
            {
              inventoryLocationWorkerId: "old",
              countedQuantity: 5,
              workerDisplayName: "מקרר",
            },
          ],
        },
      ],
      [
        { id: "a", workArea: "אזור א", displayName: "מקרר" },
        { id: "b", workArea: "אזור ב", displayName: "מקרר" },
      ],
    );
    assert.equal(r.workerQty.p1!.a, "");
    assert.equal(r.workerQty.p1!.b, "");
  }

  // duplicate workArea בהיסטוריה → unset
  {
    const r = buildPrefillFromLastCount(
      [
        {
          id: "p1",
          previousQuantity: 15,
          lastWorkerQtys: [
            { inventoryLocationWorkerId: "h1", countedQuantity: 8, workerWorkArea: "מקרר" },
            { inventoryLocationWorkerId: "h2", countedQuantity: 7, workerWorkArea: "מקרר" },
          ],
        },
      ],
      fridgeFreezerWorkers,
    );
    assert.equal(r.workerQty.p1!.w1, "");
    assert.equal(r.workerQty.p1!.w2, "");
  }

  // unique displayName match
  {
    const r = buildPrefillFromLastCount(
      [
        {
          id: "croissant",
          previousQuantity: 15,
          lastWorkerQtys: [
            {
              inventoryLocationWorkerId: "old-worker-id",
              countedQuantity: 15,
              workerDisplayName: "כללי",
            },
          ],
        },
      ],
      [{ id: "new-worker-id", displayName: "כללי" }],
    );
    assert.equal(r.workerQty.croissant!["new-worker-id"], "15");
  }

  console.log("count-prefill.test.ts: OK");
}

function runWorkerQty() {
  const workers = [
    { id: "w1", displayName: "מקרר", workArea: "מקרר", displayOrder: 0 },
    { id: "w2", displayName: "פריזר", workArea: "פריזר", displayOrder: 1 },
  ];

  const partial = analyzeWorkerQuantities(workers, { w1: "8", w2: "" });
  assert.equal(partial.complete, false);
  assert.equal(partial.partialSum, 8);
  assert.equal(partial.total, null);
  assert.equal(sumWorkerQuantities(workers, { w1: "8", w2: "" }), null);

  const zero = analyzeWorkerQuantities(workers, { w1: "0", w2: "0" });
  assert.equal(zero.complete, true);
  assert.equal(zero.total, 0);

  const drop = analyzeWorkerQuantities(workers, { w1: "7", w2: "5" });
  assert.equal(drop.complete, true);
  assert.equal(drop.total, 12);

  const partialZero = analyzeWorkerQuantities(workers, { w1: "0", w2: "" });
  assert.equal(partialZero.complete, false);
  assert.equal(partialZero.partialSum, 0);

  console.log("count-worker-qty (in prefill test): OK");
}

runPrefill();
runWorkerQty();

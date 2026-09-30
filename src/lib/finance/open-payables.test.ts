/**
 * Run: npx tsx --test src/lib/finance/open-payables.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openPayableRows } from "./open-payables";

function entry(
  id: string,
  supplierId: string,
  debit: number,
  credit: number,
  day: string,
) {
  return {
    id,
    supplierId,
    debit,
    credit,
    entryDate: new Date(`${day}T12:00:00.000Z`),
    docType: "חשבונית",
    description: id,
  };
}

describe("open payables", () => {
  it("sums remaining supplier debt and drops fully paid parties", () => {
    const result = openPayableRows({
      parties: [
        { id: "a", entityType: "supplier", name: "ספק א", openingBalance: 0 },
        { id: "b", entityType: "supplier", name: "ספק ב", openingBalance: 0 },
        { id: "c", entityType: "supplier", name: "ספק ג", openingBalance: 0 },
        { id: "d", entityType: "supplier", name: "שולם", openingBalance: 0 },
      ],
      entries: [
        entry("a1", "a", 5000, 0, "2025-11-01"),
        entry("b1", "b", 2500, 0, "2026-01-01"),
        entry("c1", "c", 4000, 3000, "2026-02-01"),
        entry("d1", "d", 1000, 1000, "2026-03-01"),
      ],
    });

    assert.equal(result.total, 8500);
    assert.equal(result.count, 3);
    const byName = new Map(result.rows.map((row) => [row.name, row]));
    assert.equal(byName.get("ספק ג")?.charges, 4000);
    assert.equal(byName.get("ספק ג")?.paid, 3000);
    assert.equal(byName.get("ספק ג")?.remaining, 1000);
    assert.equal(byName.has("שולם"), false);
  });

  it("keeps an unpaid balance from a previous month", () => {
    const result = openPayableRows({
      parties: [{ id: "old", entityType: "supplier", name: "ישן", openingBalance: 0 }],
      entries: [entry("old1", "old", 700, 0, "2024-01-15")],
    });
    assert.equal(result.total, 700);
    assert.equal(result.rows[0]?.remaining, 700);
  });
});

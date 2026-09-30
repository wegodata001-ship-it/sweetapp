import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mixLedgerSuggestions, selectRecentLedgerActivity } from "./recent-ledger-activity";

describe("recent ledger activity", () => {
  it("keeps the newest movement per entity and does not merge different ids", () => {
    const rows = selectRecentLedgerActivity([
      { entityType: "supplier", entityId: "s1", entityName: "ספק א", lastActivityAt: "2026-09-01T08:00:00.000Z" },
      { entityType: "supplier", entityId: "s1", entityName: "ספק א", lastActivityAt: "2026-09-29T10:00:00.000Z" },
      { entityType: "supplier", entityId: "s1", entityName: "ספק א", lastActivityAt: "2026-09-20T10:00:00.000Z" },
      { entityType: "customer", entityId: "c1", entityName: "לקוח ג", lastActivityAt: "2026-09-28T10:00:00.000Z" },
      { entityType: "employee", entityId: "e1", entityName: "עובד ד", lastActivityAt: "2026-09-27T10:00:00.000Z" },
      { entityType: "supplier", entityId: "s2", entityName: "ספק א", lastActivityAt: "2026-09-21T10:00:00.000Z" },
    ]);
    assert.deepEqual(
      rows.map((row) => `${row.entityType}:${row.entityId}`),
      ["supplier:s1", "customer:c1", "employee:e1", "supplier:s2"],
    );
    assert.equal(rows.filter((row) => row.entityId === "s1").length, 1);
    assert.equal(rows[0]?.lastActivityAt, "2026-09-29T10:00:00.000Z");
  });

  it("returns at most eight entities", () => {
    const rows = selectRecentLedgerActivity(
      Array.from({ length: 12 }, (_, index) => ({
        entityType: "customer" as const,
        entityId: `c${index}`,
        entityName: `לקוח ${index}`,
        lastActivityAt: new Date(Date.UTC(2026, 8, index + 1)).toISOString(),
      })),
    );
    assert.equal(rows.length, 8);
    assert.equal(rows[0]?.entityId, "c11");
  });

  it("mixes customer, supplier and employee suggestions", () => {
    const mixed = mixLedgerSuggestions([
      [
        { entityType: "customer", entityId: "c1", entityName: "محمد خالد" },
        { entityType: "customer", entityId: "c2", entityName: "לקוח" },
      ],
      [{ entityType: "supplier", entityId: "s1", entityName: "محمد أحمد" }],
      [{ entityType: "employee", entityId: "e1", entityName: "محمد علي" }],
    ]);
    assert.deepEqual(
      mixed.map((row) => row.entityType),
      ["customer", "supplier", "employee", "customer"],
    );
  });
});

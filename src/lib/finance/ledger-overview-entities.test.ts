/**
 * Unit tests for unified ledger overview entity pipeline (no DB).
 * Run: npx tsx --test src/lib/finance/ledger-overview-entities.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLedgerOverviewPage,
  ledgerEntityNameMatches,
  type LedgerMasterEntity,
} from "./ledger-overview-entities";

function supplier(id: string, name: string, notes?: string): LedgerMasterEntity {
  return {
    entity_type: "supplier",
    id,
    name,
    opening_balance: 0,
    notes: notes ?? null,
  };
}

function customer(id: string, name: string): LedgerMasterEntity {
  return { entity_type: "customer", id, name, opening_balance: 0 };
}

function employee(id: string, name: string): LedgerMasterEntity {
  return { entity_type: "employee", id, name, opening_balance: 0 };
}

describe("ledger-overview-entities", () => {
  it("zero-activity supplier is included in master page", () => {
    const page = buildLedgerOverviewPage({
      customers: [],
      suppliers: [supplier("s1", "هاني كعك")],
      employees: [],
      entityType: "all",
      page: 1,
      pageSize: 12,
    });
    assert.equal(page.counts.suppliers, 1);
    assert.equal(page.rows[0]?.name, "هاني كعك");
    assert.equal(page.rows[0]?.opening_balance, 0);
  });

  it("Arabic search هاني finds هاني كعك", () => {
    assert.equal(ledgerEntityNameMatches("هاني كعك", "هاني"), true);
    const page = buildLedgerOverviewPage({
      customers: [customer("c1", "אחר")],
      suppliers: [
        supplier("s1", "האחר"),
        supplier("s2", "هاني كعك"),
        supplier("s3", "كعك الشام"),
      ],
      employees: [],
      q: "هاني",
      entityType: "all",
      page: 1,
      pageSize: 12,
    });
    assert.equal(page.counts.suppliers, 1);
    assert.equal(page.counts.customers, 0);
    assert.equal(page.rows.length, 1);
    assert.equal(page.rows[0]?.id, "s2");
  });

  it("search runs before pagination (not only first page window)", () => {
    const suppliers = Array.from({ length: 40 }, (_, i) =>
      supplier(`s${i}`, `Supplier ${String(i).padStart(2, "0")}`),
    );
    suppliers.push(supplier("hani", "هاني كعك"));
    // Old bug: take first 24 by name then search — would miss late names.
    const page = buildLedgerOverviewPage({
      customers: Array.from({ length: 40 }, (_, i) => customer(`c${i}`, `Cust ${i}`)),
      suppliers,
      employees: [],
      q: "هاني",
      entityType: "all",
      page: 1,
      pageSize: 12,
    });
    assert.equal(page.total, 1);
    assert.equal(page.rows[0]?.id, "hani");
  });

  it("all suppliers appear across pages without listCap truncation", () => {
    const suppliers = Array.from({ length: 30 }, (_, i) =>
      supplier(`s${i}`, `ספק ${String(i).padStart(2, "0")}`),
    );
    const page1 = buildLedgerOverviewPage({
      customers: [],
      suppliers,
      employees: [],
      entityType: "supplier",
      page: 1,
      pageSize: 12,
    });
    const page3 = buildLedgerOverviewPage({
      customers: [],
      suppliers,
      employees: [],
      entityType: "supplier",
      page: 3,
      pageSize: 12,
    });
    assert.equal(page1.counts.suppliers, 30);
    assert.equal(page1.rows.length, 12);
    assert.equal(page3.rows.length, 6);
    assert.equal(page3.total, 30);
  });

  it("explicit zero-balance and customers/employees still work", () => {
    const page = buildLedgerOverviewPage({
      customers: [customer("c1", "לקוח א")],
      suppliers: [supplier("s1", "ספק ב")],
      employees: [employee("e1", "עובד ג")],
      entityType: "all",
      page: 1,
      pageSize: 12,
    });
    assert.equal(page.counts.customers, 1);
    assert.equal(page.counts.suppliers, 1);
    assert.equal(page.counts.employees, 1);
    assert.equal(page.total, 3);
  });

  it("alias in supplier notes is searchable", () => {
    const page = buildLedgerOverviewPage({
      customers: [],
      suppliers: [
        supplier("s1", "מאפיית השכונה", "[ocr-aliases: هاني كعك | هاني]"),
      ],
      employees: [],
      q: "هاني",
      entityType: "supplier",
      page: 1,
      pageSize: 12,
    });
    assert.equal(page.total, 1);
    assert.equal(page.rows[0]?.id, "s1");
  });
});

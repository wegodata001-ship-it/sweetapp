/**
 * Unit tests for count-copy (no DB).
 * Run: npx tsx --test src/lib/inventory/count-copy-service.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCopyProductRows,
  formatAllCountSessionsCopyText,
  formatCopyCountDate,
  formatCopyQuantity,
  formatCopyQuantityOrStatus,
  formatCountSessionCopyText,
  isValidCopyYmd,
  notCountedCopyLabel,
  resolveCopyProductName,
  sessionLinesToExplicitCountMap,
  countedCopyLabel,
  totalCopyLabel,
  type CountCopySession,
} from "./count-copy-service";

describe("count-copy-service formatters", () => {
  it("validates YYYY-MM-DD", () => {
    assert.equal(isValidCopyYmd("2026-08-13"), true);
    assert.equal(isValidCopyYmd("2026-13-01"), false);
    assert.equal(isValidCopyYmd("13/08/2026"), false);
  });

  it("formats date as D/M", () => {
    assert.equal(formatCopyCountDate(new Date(2026, 7, 13)), "13/8");
    assert.equal(formatCopyCountDate(new Date(2026, 0, 5)), "5/1");
  });

  it("keeps explicit zero and arabic names", () => {
    const session: CountCopySession = {
      id: "s1",
      sessionNumber: 1,
      locationId: "loc1",
      locationName: "عجوت",
      countDate: new Date(2026, 7, 13).toISOString(),
      createdAt: new Date(2026, 7, 13, 10, 0, 0).toISOString(),
      products: [
        {
          inventoryProductId: "p1",
          name: "Regular",
          nameHe: "רגיל",
          nameAr: "ريجولاخ",
          nameEn: "Regular",
          quantity: 15,
          totalQuantity: 15,
        },
        {
          inventoryProductId: "p2",
          name: "Croissant",
          nameHe: "קרואסון",
          nameAr: "كروسون عادي",
          nameEn: null,
          quantity: 0,
          totalQuantity: 0,
        },
      ],
    };

    const text = formatCountSessionCopyText(session, "ar");
    assert.match(text, /^عجوت\n13\/8\n\n/);
    assert.match(text, /1\. ريجولاخ - 15/);
    assert.match(text, /2\. كروسون عادي - 0/);
    assert.doesNotMatch(text, /الإجمالي/);
    assert.doesNotMatch(text, /تم الجرد/);
    assert.doesNotMatch(text, /لم يتم الجرد/);
    assert.equal(formatCopyQuantity(0), "0");
    assert.equal(resolveCopyProductName(session.products[0]!, "ar"), "ريجولاخ");
  });

  it("separates multiple sessions", () => {
    const a: CountCopySession = {
      id: "a",
      sessionNumber: 1,
      locationId: null,
      locationName: "عجوت",
      countDate: new Date(2026, 7, 13).toISOString(),
      createdAt: new Date().toISOString(),
      products: [
        {
          inventoryProductId: "p1",
          name: "A",
          nameHe: "A",
          nameAr: "أ",
          nameEn: null,
          quantity: 1,
          totalQuantity: 1,
        },
      ],
    };
    const b: CountCopySession = {
      ...a,
      id: "b",
      locationName: "מחסן 1",
      countDate: new Date(2026, 7, 14).toISOString(),
    };
    const all = formatAllCountSessionsCopyText([a, b], "he");
    assert.match(all, /---/);
    assert.match(all, /عجوت/);
    assert.match(all, /מחסן 1/);
  });
});

describe("count-copy location products + not counted", () => {
  const meta = (id: string, name: string) =>
    [
      id,
      { name, nameHe: name, nameAr: name, nameEn: name },
    ] as const;

  it("TEST A: 23 location products + 18 counts → 23 rows, 5 not counted", () => {
    const ordered = Array.from({ length: 23 }, (_, i) => `p${i + 1}`);
    const productsById = new Map(ordered.map((id, i) => meta(id, `Product ${i + 1}`)));
    const explicit = new Map<string, number>();
    for (let i = 0; i < 18; i++) explicit.set(`p${i + 1}`, i + 1);

    const rows = buildCopyProductRows({
      orderedProductIds: ordered,
      productsById,
      explicitCountsByProductId: explicit,
    });

    assert.equal(rows.length, 23);
    assert.equal(rows.filter((r) => r.quantity !== null).length, 18);
    assert.equal(rows.filter((r) => r.quantity === null).length, 5);
    assert.equal(rows[18]!.quantity, null);
    assert.equal(rows[0]!.quantity, 1);
  });

  it("TEST B: all counted → no not-counted", () => {
    const ordered = ["a", "b", "c"];
    const productsById = new Map(ordered.map((id) => meta(id, id)));
    const explicit = new Map([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    const rows = buildCopyProductRows({
      orderedProductIds: ordered,
      productsById,
      explicitCountsByProductId: explicit,
    });
    assert.equal(rows.length, 3);
    assert.equal(rows.every((r) => r.quantity !== null), true);
  });

  it("TEST C: explicit zero stays 0", () => {
    assert.equal(formatCopyQuantityOrStatus(0, "he"), "0");
    assert.equal(formatCopyQuantityOrStatus(0, "ar"), "0");
    const rows = buildCopyProductRows({
      orderedProductIds: ["b"],
      productsById: new Map([meta("b", "B")]),
      explicitCountsByProductId: new Map([["b", 0]]),
    });
    assert.equal(rows[0]!.quantity, 0);
    const text = formatCountSessionCopyText(
      {
        id: "s",
        sessionNumber: 1,
        locationId: "loc",
        locationName: "Loc",
        countDate: new Date(2026, 8, 15).toISOString(),
        createdAt: new Date().toISOString(),
        products: rows,
      },
      "he",
    );
    assert.match(text, /1\. B - 0/);
    assert.doesNotMatch(text, /סה״כ/);
    assert.doesNotMatch(text, /נספר/);
    assert.doesNotMatch(text, /לא נספר/);
  });

  it("TEST D: missing count → not counted, not 0", () => {
    assert.equal(formatCopyQuantityOrStatus(null, "he"), "לא נספר");
    assert.equal(formatCopyQuantityOrStatus(null, "ar"), "لم يتم الجرد");
    assert.equal(notCountedCopyLabel("en"), "Not counted");
    const rows = buildCopyProductRows({
      orderedProductIds: ["a", "b", "c"],
      productsById: new Map([meta("a", "A"), meta("b", "B"), meta("c", "C")]),
      explicitCountsByProductId: new Map([
        ["a", 13],
        ["b", 0],
      ]),
    });
    assert.equal(rows[0]!.quantity, 13);
    assert.equal(rows[1]!.quantity, 0);
    assert.equal(rows[2]!.quantity, null);
    const text = formatCountSessionCopyText(
      {
        id: "s",
        sessionNumber: 1,
        locationId: "loc",
        locationName: "مخزن",
        countDate: new Date(2026, 8, 15).toISOString(),
        createdAt: new Date().toISOString(),
        products: rows,
      },
      "ar",
    );
    assert.match(text, /1\. A - 0/);
    assert.match(text, /2\. B - 0/);
    assert.match(text, /3\. C - 0/);
    assert.doesNotMatch(text, /لم يتم الجرد/);
    assert.doesNotMatch(text, /تم الجرد/);
  });

  it("TEST E: copy order matches count-screen order (not alphabetical)", () => {
    const ordered = ["A", "C", "B", "D"];
    const productsById = new Map(ordered.map((id) => meta(id, id)));
    const rows = buildCopyProductRows({
      orderedProductIds: ordered,
      productsById,
      explicitCountsByProductId: new Map([
        ["A", 1],
        ["C", 2],
        ["B", 3],
        ["D", 4],
      ]),
      totalsByProductId: new Map([
        ["A", 1],
        ["C", 2],
        ["B", 3],
        ["D", 4],
      ]),
    });
    assert.deepEqual(
      rows.map((r) => r.inventoryProductId),
      ["A", "C", "B", "D"],
    );
    const text = formatCountSessionCopyText(
      {
        id: "s",
        sessionNumber: 1,
        locationId: "loc",
        locationName: "Shelf",
        countDate: new Date(2026, 8, 15).toISOString(),
        createdAt: new Date().toISOString(),
        products: rows,
      },
      "en",
    );
    const lines = text.split("\n").filter((l) => /^\d+\./.test(l));
    assert.deepEqual(lines, ["1. A - 1", "2. C - 2", "3. B - 3", "4. D - 4"]);
  });

  it("TEST F: inactive / not on ordered list is omitted", () => {
    const rows = buildCopyProductRows({
      orderedProductIds: ["a", "c"],
      productsById: new Map([meta("a", "A"), meta("b", "B"), meta("c", "C")]),
      explicitCountsByProductId: new Map([
        ["a", 1],
        ["b", 99],
        ["c", 3],
      ]),
    });
    assert.deepEqual(
      rows.map((r) => r.inventoryProductId),
      ["a", "c"],
    );
    assert.equal(rows.some((r) => r.inventoryProductId === "b"), false);
  });

  it("latest line wins for duplicate product in session", () => {
    const map = sessionLinesToExplicitCountMap([
      {
        inventoryProductId: "p1",
        currentQuantity: 5,
        createdAt: "2026-09-15T08:00:00.000Z",
        countDate: "2026-09-15T00:00:00.000Z",
        id: "c1",
      },
      {
        inventoryProductId: "p1",
        currentQuantity: 9,
        createdAt: "2026-09-15T10:00:00.000Z",
        countDate: "2026-09-15T00:00:00.000Z",
        id: "c2",
      },
    ]);
    assert.equal(map.get("p1"), 9);
  });

  it("tie-break by id matches LATEST_COUNT_ORDER_BY", () => {
    const map = sessionLinesToExplicitCountMap([
      {
        inventoryProductId: "p1",
        currentQuantity: 1,
        createdAt: "2026-09-15T10:00:00.000Z",
        countDate: "2026-09-15T00:00:00.000Z",
        id: "aaa",
      },
      {
        inventoryProductId: "p1",
        currentQuantity: 7,
        createdAt: "2026-09-15T10:00:00.000Z",
        countDate: "2026-09-15T00:00:00.000Z",
        id: "zzz",
      },
    ]);
    assert.equal(map.get("p1"), 7);
  });

  it("copy-all includes every product row from every session", () => {
    const session: CountCopySession = {
      id: "s1",
      sessionNumber: 1,
      locationId: "loc",
      locationName: "Loc",
      countDate: new Date(2026, 8, 15).toISOString(),
      createdAt: new Date().toISOString(),
      products: Array.from({ length: 23 }, (_, i) => ({
        inventoryProductId: `p${i + 1}`,
        name: `P${i + 1}`,
        nameHe: `P${i + 1}`,
        nameAr: null,
        nameEn: null,
        quantity: i < 18 ? i : null,
        totalQuantity: i < 18 ? i : 0,
      })),
    };
    const text = formatAllCountSessionsCopyText([session], "he");
    assert.match(text, /23\. P23 - 0/);
    assert.doesNotMatch(text, /לא נספר/);
    assert.doesNotMatch(text, /נספר/);
    assert.equal([...text.matchAll(/^\d+\./gm)].length, 23);
  });

  it("shows current total even when this session did not count the product", () => {
    assert.equal(totalCopyLabel("he"), "סה״כ");
    assert.equal(countedCopyLabel("ar"), "تم الجرد");
    const rows = buildCopyProductRows({
      orderedProductIds: ["makrouta", "croissant", "apple"],
      productsById: new Map([
        meta("makrouta", "مقروطة"),
        meta("croissant", "كروسون"),
        meta("apple", "تفاح"),
      ]),
      explicitCountsByProductId: new Map(),
      totalsByProductId: new Map([
        ["makrouta", 5],
        ["croissant", 12],
        ["apple", 0],
      ]),
    });
    assert.equal(rows[0]!.quantity, null);
    assert.equal(rows[0]!.totalQuantity, 5);
    assert.equal(rows[1]!.totalQuantity, 12);
    assert.equal(rows[2]!.totalQuantity, 0);
    const text = formatCountSessionCopyText(
      {
        id: "s",
        sessionNumber: 1,
        locationId: "loc",
        locationName: "مخزن",
        countDate: new Date(2026, 8, 15).toISOString(),
        createdAt: new Date().toISOString(),
        products: rows,
      },
      "ar",
    );
    assert.match(text, /1\. مقروطة - 5/);
    assert.match(text, /2\. كروسون - 12/);
    assert.match(text, /3\. تفاح - 0/);
    assert.doesNotMatch(text, /لم يتم الجرد/);
    assert.doesNotMatch(text, /تم الجرد/);
    assert.doesNotMatch(text, /الإجمالي/);
  });

  it("copy uses on-screen totalQuantity, never counted quantity or status labels", () => {
    const session: CountCopySession = {
      id: "s",
      sessionNumber: 1,
      locationId: "loc",
      locationName: "قائمة البضاعة نص البلد (عدي ذياب)",
      countDate: new Date(2026, 8, 14).toISOString(),
      createdAt: new Date().toISOString(),
      products: [
        {
          inventoryProductId: "p1",
          name: "سدر مبرومة",
          nameHe: "سدر مبرومة",
          nameAr: "سدر مبرومة",
          nameEn: null,
          quantity: 7.5,
          totalQuantity: 4,
        },
        {
          inventoryProductId: "p2",
          name: "קקקוווו",
          nameHe: "קקקוווו",
          nameAr: "קקקוווו",
          nameEn: null,
          quantity: 11,
          totalQuantity: 25,
        },
        {
          inventoryProductId: "p3",
          name: "شوال جبنة شغاله",
          nameHe: "شوال جبنة شغاله",
          nameAr: "شوال جبنة شغاله",
          nameEn: null,
          quantity: 0,
          totalQuantity: 0,
        },
        {
          inventoryProductId: "p4",
          name: "كيس عجيب شماريم",
          nameHe: "كيس عجيب شماريم",
          nameAr: "كيس عجيب شماريم",
          nameEn: null,
          quantity: null,
          totalQuantity: 106,
        },
      ],
    };
    const text = formatCountSessionCopyText(session, "he");
    assert.equal(
      text,
      [
        "قائمة البضاعة نص البلد (عدي ذياب)",
        "14/9",
        "",
        "1. سدر مبرومة - 4",
        "2. קקקוווו - 25",
        "3. شوال جبنة شغاله - 0",
        "4. كيس عجيب شماريم - 106",
      ].join("\n"),
    );
    assert.doesNotMatch(text, /7\.5/);
    assert.doesNotMatch(text, /11/);
    assert.doesNotMatch(text, /סה״כ/);
    assert.doesNotMatch(text, /נספר/);
    assert.doesNotMatch(text, /לא נספר/);
  });

  it("copies all 34 products in displayOrder using totalQuantity", () => {
    const ordered = Array.from({ length: 34 }, (_, i) => `p${i + 1}`);
    const rows = buildCopyProductRows({
      orderedProductIds: ordered,
      productsById: new Map(
        ordered.map((id, i) => [
          id,
          { name: `P${i + 1}`, nameHe: `P${i + 1}`, nameAr: `P${i + 1}`, nameEn: `P${i + 1}` },
        ]),
      ),
      explicitCountsByProductId: new Map(
        ordered.slice(0, 20).map((id, i) => [id, i === 0 ? 7.5 : i]),
      ),
      totalsByProductId: new Map(ordered.map((id, i) => [id, i === 0 ? 4 : i])),
    });
    assert.equal(rows.length, 34);
    assert.equal(rows[0]!.quantity, 7.5);
    assert.equal(rows[0]!.totalQuantity, 4);
    assert.equal(rows[20]!.quantity, null);
    assert.equal(rows[20]!.totalQuantity, 20);
    const text = formatCountSessionCopyText(
      {
        id: "s",
        sessionNumber: 1,
        locationId: "loc",
        locationName: "Shelf",
        countDate: new Date(2026, 8, 14).toISOString(),
        createdAt: new Date().toISOString(),
        products: rows,
      },
      "he",
    );
    const lines = text.split("\n").filter((l) => /^\d+\./.test(l));
    assert.equal(lines.length, 34);
    assert.equal(lines[0], "1. P1 - 4");
    assert.equal(lines[33], "34. P34 - 33");
    assert.doesNotMatch(text, /7\.5/);
    assert.doesNotMatch(text, /נספר/);
    assert.doesNotMatch(text, /לא נספר/);
    assert.doesNotMatch(text, /סה״כ/);
  });
});

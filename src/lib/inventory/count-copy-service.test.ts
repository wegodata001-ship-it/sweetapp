/**
 * Unit tests for count-copy formatting (no DB).
 * Run: npx tsx --test src/lib/inventory/count-copy-service.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAllCountSessionsCopyText,
  formatCopyCountDate,
  formatCopyQuantity,
  formatCountSessionCopyText,
  isValidCopyYmd,
  resolveCopyProductName,
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

  it("keeps zero quantities and arabic names", () => {
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
        },
        {
          inventoryProductId: "p2",
          name: "Croissant",
          nameHe: "קרואסון",
          nameAr: "كروسون عادي",
          nameEn: null,
          quantity: 0,
        },
      ],
    };

    const text = formatCountSessionCopyText(session, "ar");
    assert.match(text, /^عجوت\n13\/8\n\n/);
    assert.match(text, /1\. ريجولاخ\. 15/);
    assert.match(text, /2\. كروسون عادي\. 0/);
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

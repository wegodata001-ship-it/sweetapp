import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDate, formatMoney } from "@/lib/pdf/pdf-utils";
import { isArabicTag, localeToBcp47 } from "./constants";
import { hasArabicIndicDigits, installLatinDigits, withLatinDigits } from "./latin-digits";

installLatinDigits();

function visible(value: string): string {
  return value.replace(/[\u200E\u200F\u061C]/g, "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

describe("latin digits for Arabic", () => {
  it("keeps Arabic locale tags and forces the latn numbering system", () => {
    assert.equal(localeToBcp47("ar"), "ar-u-nu-latn");
    assert.equal(isArabicTag("ar-u-nu-latn"), true);
    assert.equal(isArabicTag("he-IL"), false);
    assert.equal(withLatinDigits("ar-EG"), "ar-EG-u-nu-latn");
    assert.equal(withLatinDigits("ar-IL"), "ar-IL-u-nu-latn");
    assert.equal(withLatinDigits("he-IL"), "he-IL");
    assert.equal(withLatinDigits("ar-u-nu-latn"), "ar-u-nu-latn");
  });

  it("formats money, dates, time, percents and quantities with 0-9", () => {
    const samples = ["ar", "ar-SA", "ar-EG", "ar-IL", "ar-u-nu-latn"];
    for (const locale of samples) {
      const money = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "ILS",
        minimumFractionDigits: 2,
      }).format(1250.5);
      const date = new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date("2026-09-24T00:00:00Z"));
      const time = new Date("2026-09-24T05:30:00Z").toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      });
      const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(0.18);
      const quantity = (125).toLocaleString(locale);
      for (const value of [money, date, time, percent, quantity, "1355", "1334"]) {
        assert.equal(hasArabicIndicDigits(value), false, `${locale} ${value}`);
      }
      assert.match(visible(money), /1,250\.50/);
      assert.match(visible(date), /24\/09\/2026/);
      assert.match(visible(time), /05:30/);
      assert.match(visible(percent), /18%/);
      assert.equal(quantity, "125");
      assert.equal(new Intl.NumberFormat(locale).resolvedOptions().numberingSystem, "latn");
    }
  });

  it("keeps PDF and plain identifiers on western digits", () => {
    const money = formatMoney(1250.5);
    const date = formatDate(new Date(2026, 8, 24, 12, 0, 0));
    assert.equal(hasArabicIndicDigits(money), false);
    assert.equal(hasArabicIndicDigits(date), false);
    assert.match(visible(money), /₪ 1,250\.50|₪1,250\.50/);
    assert.match(visible(date), /24\/09\/2026/);
    assert.equal(hasArabicIndicDigits("1355"), false);
    assert.equal(hasArabicIndicDigits("1334"), false);
  });
});

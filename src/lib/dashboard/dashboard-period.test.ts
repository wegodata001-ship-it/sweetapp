/**
 * Run: npx tsx --test src/lib/dashboard/dashboard-period.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customRangeBounds,
  dashboardCacheKey,
  formatCustomPeriodLabel,
  isFullCalendarMonth,
  localizedMonthName,
  parseDashboardPeriodSearch,
  validateCustomRange,
} from "@/lib/dashboard/dashboard-period";
import { dashboardPeriodDate } from "@/lib/finance/document-business-date";
import { parseBusinessDocDate } from "@/lib/finance/document-business-date";

describe("dashboard period selection", () => {
  it("defaults to this month when URL has no period", () => {
    const sel = parseDashboardPeriodSearch({ get: () => null }, new Date(2026, 9, 5));
    assert.equal(sel.period, "month");
    assert.equal(sel.from, "2026-10-01");
    assert.equal(sel.to, "2026-10-31");
  });

  it("parses custom September without mixing October cache keys", () => {
    const q = new Map([
      ["period", "custom"],
      ["from", "2026-09-01"],
      ["to", "2026-09-30"],
    ]);
    const sel = parseDashboardPeriodSearch({ get: (k) => q.get(k) ?? null });
    assert.equal(sel.period, "custom");
    assert.equal(dashboardCacheKey("dashboard-full", sel), "dashboard-full:custom:2026-09-01:2026-09-30");
    assert.notEqual(
      dashboardCacheKey("dashboard-full", sel),
      dashboardCacheKey("dashboard-full", { period: "month", from: "2026-10-01", to: "2026-10-31" }),
    );
  });

  it("rejects from > to and invalid dates", () => {
    assert.equal(validateCustomRange("2026-10-01", "2026-09-01"), "order");
    assert.equal(validateCustomRange("nope", "2026-09-01"), "invalid");
    assert.equal(validateCustomRange("2026-09-01", "2026-09-30"), null);
  });

  it("localizes the current month name from the date, not a hardcoded October", () => {
    const october = new Date(2026, 9, 5);
    const november = new Date(2026, 10, 5);
    const december = new Date(2026, 11, 5);
    const january = new Date(2027, 0, 5);
    assert.match(localizedMonthName(october, "he-IL"), /אוקטובר/);
    assert.match(localizedMonthName(october, "ar-u-nu-latn"), /أكتوبر/);
    assert.match(localizedMonthName(november, "ar-u-nu-latn"), /نوفمبر/);
    assert.match(localizedMonthName(december, "ar-u-nu-latn"), /ديسمبر/);
    assert.match(localizedMonthName(january, "ar-u-nu-latn"), /يناير/);
  });

  it("labels a full calendar month by localized month name", () => {
    assert.equal(isFullCalendarMonth("2026-09-01", "2026-09-30"), true);
    assert.match(formatCustomPeriodLabel("2026-09-01", "2026-09-30", "he-IL"), /2026/);
    assert.equal(isFullCalendarMonth("2026-09-15", "2026-10-15"), false);
    assert.equal(formatCustomPeriodLabel("2026-09-15", "2026-10-15", "en-US"), "15/09/26 - 15/10/26");
  });

  it("includes a 30/09 document in custom September and excludes it from October", () => {
    const sept = customRangeBounds("2026-09-01", "2026-09-30")!;
    const oct = customRangeBounds("2026-10-01", "2026-10-31")!;
    const created = new Date("2026-10-05T08:00:00.000Z");
    const ed = dashboardPeriodDate({
      entryType: "income",
      entryDate: created,
      documentDocDate: parseBusinessDocDate("2026-09-30"),
    });
    assert.ok(ed.getTime() >= sept.from.getTime() && ed.getTime() <= sept.to.getTime());
    assert.ok(ed.getTime() < oct.from.getTime() || ed.getTime() > oct.to.getTime());
  });
});

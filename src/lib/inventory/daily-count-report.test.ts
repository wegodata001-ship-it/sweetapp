/**
 * בדיקות דוח סיכום ספירות יומי — npm run test:daily-count-report
 *
 * החלק הראשון בודק את האגרגציה כפונקציה טהורה, בלי מסד נתונים ובלי שליחת מייל.
 * החלק השני מפיק PDF ו־Excel מאותם נתונים ומוודא שהקבצים תקינים.
 */
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateDailyReport,
  dayRange,
  daySpanRange,
  localDay,
  normalizeReportDay,
  sessionDurationMinutes,
  type RawExclusion,
  type RawPlacement,
  type RawSession,
} from "./daily-count-report";
import { inventoryDailyReportExcel } from "./daily-count-report-excel";
import {
  inventoryCountSummaryFileName,
  inventoryDailyReportFileName,
  inventoryDailyReportPdf,
} from "./daily-count-report-pdf";
import {
  daysInRange,
  isValidDayString,
  MAX_SUMMARY_RANGE_DAYS,
  resolveSummaryRange,
} from "./count-summary-range";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const DAY = "2026-07-26";

function at(hour: number, minute = 0): Date {
  return new Date(2026, 6, 26, hour, minute, 0, 0);
}

function session(over: Partial<RawSession> & { id: string; sessionNumber: number }): RawSession {
  return {
    locationId: "loc-main",
    locationName: "מחסן ראשי",
    status: "COMPLETED",
    startedAt: at(9, 0),
    createdAt: at(9, 25),
    productCount: 0,
    matchCount: 0,
    shortageCount: 0,
    surplusCount: 0,
    totalCountedQty: 0,
    countedBy: { fullName: "סאמר כנעאן" },
    lines: [],
    ...over,
  };
}

function line(over: Partial<RawSession["lines"][number]> = {}): RawSession["lines"][number] {
  return {
    previousQuantity: 10,
    currentQuantity: 10,
    difference: 0,
    inventoryProduct: {
      name: "Sugar 1kg",
      nameHe: "סוכר 1 ק״ג",
      barcode: "7290001234567",
      unit: "יח׳",
      minimumQuantity: 20,
    },
    workerLines: [{ workerDisplayName: "אחמד", workerWorkArea: "מחסן", countedQuantity: 10 }],
    ...over,
  };
}

function buildFixture() {
  const sessions: RawSession[] = [
    session({
      id: "s1",
      sessionNumber: 101,
      productCount: 3,
      matchCount: 2,
      shortageCount: 1,
      surplusCount: 0,
      totalCountedQty: 30,
      lines: [line(), line({ currentQuantity: 8, difference: -2 }), line()],
    }),
    session({
      id: "s2",
      sessionNumber: 102,
      startedAt: at(11, 0),
      createdAt: at(11, 40),
      productCount: 2,
      matchCount: 1,
      shortageCount: 0,
      surplusCount: 1,
      totalCountedQty: 14,
      countedBy: { fullName: "ליאת כהן" },
      lines: [line(), line({ currentQuantity: 12, difference: 2 })],
    }),
    session({
      id: "s3",
      sessionNumber: 103,
      locationId: "loc-freezer",
      locationName: "מקפיא",
      // ספירה היסטורית בלי שעת התחלה מתועדת
      startedAt: null,
      createdAt: at(14, 5),
      productCount: 4,
      matchCount: 4,
      totalCountedQty: 65,
      countedBy: { fullName: "Ahmad Ali" },
      lines: [line({ inventoryProduct: null })],
    }),
  ];

  const exclusions: RawExclusion[] = [
    {
      locationKey: "loc-main",
      locationName: "מחסן ראשי",
      productName: "מוצר כפול",
      removedAt: at(10, 12),
      reason: "נוסף בטעות",
      removedBy: { fullName: "סאמר כנעאן" },
      inventoryProduct: { name: "Duplicate", nameHe: "מוצר כפול" },
    },
  ];

  const newPlacements: RawPlacement[] = [
    { locationId: "loc-main", location: { name: "מחסן ראשי" } },
    { locationId: "loc-freezer", location: { name: "מקפיא" } },
  ];

  return { sessions, exclusions, newPlacements };
}

function testHelpers(): void {
  assert(localDay(new Date(2026, 0, 5)) === "2026-01-05", "localDay pads month and day");
  assert(normalizeReportDay("2026-07-26") === "2026-07-26", "normalize keeps ISO day");
  assert(normalizeReportDay("  ") === localDay(), "blank day falls back to today");
  assert(normalizeReportDay("not-a-date") === localDay(), "garbage day falls back to today");

  const { start, end } = dayRange(DAY);
  assert(start.getHours() === 0 && start.getDate() === 26, "day starts at local midnight");
  assert(end.getDate() === 27, "day ends at next local midnight");

  assert(sessionDurationMinutes(at(9, 0), at(9, 25)) === 25, "duration in minutes");
  assert(sessionDurationMinutes(null, at(9, 25)) === null, "no start time means unknown duration");
  assert(sessionDurationMinutes(at(9, 30), at(9, 0)) === null, "negative duration rejected");
  const halfMinute = new Date(2026, 6, 26, 9, 0, 30, 0);
  assert(sessionDurationMinutes(at(9, 0), halfMinute) === 1, "sub-minute rounds up to 1");
  const tooLong = new Date(2026, 6, 28, 9, 0, 0, 0);
  assert(sessionDurationMinutes(at(9, 0), tooLong) === null, "duration over 24h rejected");

  const span = daySpanRange("2026-07-20", "2026-07-26");
  assert(span.start.getDate() === 20 && span.start.getHours() === 0, "span starts at first midnight");
  assert(span.end.getDate() === 27, "span ends after the last day");
}

/** טווחי הזמן של מסך הסיכומים */
function testRanges(): void {
  assert(isValidDayString("2026-07-26"), "valid iso day accepted");
  assert(!isValidDayString("2026-02-31"), "impossible calendar date rejected");
  assert(!isValidDayString("26/07/2026"), "non-iso format rejected");
  assert(daysInRange("2026-07-26", "2026-07-26") === 1, "single day range is one day");
  assert(daysInRange("2026-07-20", "2026-07-26") === 7, "week range is seven days");

  // 2026-07-26 הוא יום ראשון — תחילת השבוע בישראל
  const sunday = new Date(2026, 6, 26, 14, 0, 0, 0);
  const today = resolveSummaryRange({ preset: "today", now: sunday });
  assert(today.from === "2026-07-26" && today.to === "2026-07-26", "today is a single day");

  const week = resolveSummaryRange({ preset: "week", now: sunday });
  assert(week.from === "2026-07-26", "week starts on sunday");

  const wednesday = new Date(2026, 6, 29, 8, 0, 0, 0);
  const midWeek = resolveSummaryRange({ preset: "week", now: wednesday });
  assert(midWeek.from === "2026-07-26" && midWeek.to === "2026-07-29", "week runs sunday..today");

  const month = resolveSummaryRange({ preset: "month", now: wednesday });
  assert(month.from === "2026-07-01" && month.to === "2026-07-29", "month starts on the 1st");

  const custom = resolveSummaryRange({
    preset: "custom",
    from: "2026-07-01",
    to: "2026-07-10",
    now: sunday,
  });
  assert(custom.from === "2026-07-01" && custom.to === "2026-07-10", "custom range kept as given");

  const reversed = resolveSummaryRange({
    preset: "custom",
    from: "2026-07-10",
    to: "2026-07-01",
    now: sunday,
  });
  assert(reversed.from === "2026-07-01" && reversed.to === "2026-07-10", "reversed range corrected");

  const bad = resolveSummaryRange({ preset: "custom", from: "oops", to: null, now: sunday });
  assert(bad.from === "2026-07-26" && bad.to === "2026-07-26", "invalid custom falls back to today");

  const huge = resolveSummaryRange({
    preset: "custom",
    from: "2000-01-01",
    to: "2026-07-26",
    now: sunday,
  });
  assert(huge.clamped, "oversized range is clamped");
  assert(daysInRange(huge.from, huge.to) === MAX_SUMMARY_RANGE_DAYS, "clamped to the cap");

  const unknown = resolveSummaryRange({ preset: "yesterday", now: sunday });
  assert(unknown.preset === "today", "unknown preset falls back to today");
}

function testAggregation() {
  const { sessions, exclusions, newPlacements } = buildFixture();
  const report = aggregateDailyReport({ day: DAY, sessions, exclusions, newPlacements });

  assert(report.day === DAY, "report day");
  assert(report.sessionCount === 3, "three sessions counted");
  assert(report.totals.productsChecked === 9, "products checked = 3+2+4");
  assert(report.totals.ok === 7, "ok = 2+1+4");
  assert(report.totals.shortage === 1, "shortage total");
  assert(report.totals.surplus === 1, "surplus total");
  assert(report.totals.anomalies === 2, "anomalies = shortage + surplus");
  assert(report.totals.totalCountedQty === 109, "counted qty total");
  assert(report.totals.addedDuringCount === 2, "added during count = new placements");
  assert(report.totals.removedFromCount === 1, "removed from count = exclusions");

  assert(report.counters.length === 3, "three distinct counters");
  assert(report.counters.includes("ליאת כהן"), "counter names collected");

  const main = report.byLocation.find((l) => l.locationName === "מחסן ראשי");
  const freezer = report.byLocation.find((l) => l.locationName === "מקפיא");
  assert(!!main && !!freezer, "both locations present");
  assert(main!.sessionCount === 2, "main warehouse had 2 sessions");
  assert(main!.productCount === 5, "main warehouse products");
  assert(main!.shortageCount === 1 && main!.surplusCount === 1, "main warehouse anomalies");
  assert(main!.removedCount === 1, "removal attributed to its location");
  assert(main!.addedCount === 1 && freezer!.addedCount === 1, "additions per location");
  assert(freezer!.sessionCount === 1 && freezer!.shortageCount === 0, "freezer has no shortage");
  assert(report.byLocation[0]!.locationName === "מחסן ראשי", "locations sorted by session count");

  assert(report.sessions[0]!.sessionNumber === 101, "sessions ordered by end time");
  assert(report.sessions[0]!.durationMinutes === 25, "session duration");
  assert(report.sessions[1]!.durationMinutes === 40, "second session duration");
  assert(report.sessions[2]!.durationMinutes === null, "historic session duration unknown");
  assert(report.sessions[2]!.countedByName === "Ahmad Ali", "latin counter name kept");

  const shortLine = report.lines.find((l) => l.difference === -2);
  assert(!!shortLine, "shortage line present");
  assert(shortLine!.shortageVsMinimum === 12, "shortage vs minimum = 20 - 8");
  assert(report.lines[0]!.shortageVsMinimum === 10, "matched line still below minimum");
  assert(report.lines[0]!.productName === "סוכר 1 ק״ג", "hebrew product name preferred");
  assert(report.lines[0]!.workersText.includes("אחמד"), "worker breakdown kept");
  assert(report.lines.some((l) => l.productName === "—"), "missing product falls back");
  assert(report.linesTruncated === false, "small report is not truncated");

  assert(report.removedRows.length === 1, "one removed row");
  assert(report.removedRows[0]!.removedByName === "סאמר כנעאן", "removal author");
  assert(report.removedRows[0]!.reason === "נוסף בטעות", "removal reason");

  // מדף טקסט ישן ללא InventoryLocation — ההסרה חייבת להתאחד עם אותה שורת מיקום
  const textShelf = aggregateDailyReport({
    day: DAY,
    sessions: [
      session({ id: "t1", sessionNumber: 200, locationId: null, locationName: "מקרר", productCount: 2 }),
    ],
    exclusions: [
      {
        locationKey: "name:מקרר",
        locationName: "מקרר",
        // ללא snapshot שם מוצר — הדוח לא אמור להיפול על נתון חסר
        productName: "",
        removedAt: at(10),
        reason: null,
        removedBy: null,
        inventoryProduct: null,
      },
    ],
    newPlacements: [],
  });
  assert(textShelf.byLocation.length === 1, "text shelf removal merges into one location row");
  assert(textShelf.byLocation[0]!.removedCount === 1, "text shelf removal counted");
  assert(textShelf.byLocation[0]!.sessionCount === 1, "text shelf session counted");

  // דוח יום ריק — התנאי שמונע שליחה כשלא בוצעו ספירות
  const empty = aggregateDailyReport({ day: DAY, sessions: [], exclusions: [], newPlacements: [] });
  assert(empty.sessionCount === 0, "empty day has no sessions");
  assert(empty.byLocation.length === 0 && empty.totals.anomalies === 0, "empty day totals are zero");

  return report;
}

/** אגרגציה על טווח של כמה ימים — הבסיס למסך "סיכומי ספירות" */
function testRangeAggregation(): void {
  const { sessions, exclusions, newPlacements } = buildFixture();
  const single = aggregateDailyReport({ day: DAY, sessions, exclusions, newPlacements });
  assert(single.isRange === false, "single day is not a range");
  assert(single.from === DAY && single.to === DAY, "single day range collapses to the day");

  const earlier = session({
    id: "prev",
    sessionNumber: 90,
    locationName: "מקרר",
    locationId: "loc-fridge",
    startedAt: new Date(2026, 6, 24, 8, 0, 0, 0),
    createdAt: new Date(2026, 6, 24, 8, 45, 0, 0),
    productCount: 4,
    matchCount: 4,
    totalCountedQty: 12,
  });

  const report = aggregateDailyReport({
    day: "2026-07-24",
    from: "2026-07-24",
    to: DAY,
    sessions: [earlier, ...sessions],
    exclusions,
    newPlacements,
  });

  assert(report.isRange === true, "multi-day report is a range");
  assert(report.from === "2026-07-24" && report.to === DAY, "range bounds preserved");
  assert(report.sessionCount === 4, "sessions across days are summed");
  assert(report.totals.productsChecked === 13, "products across days = 4 + 9");
  assert(report.locationsCounted === 3, "three distinct locations were counted");

  const fridge = report.sessions.find((s) => s.sessionNumber === 90);
  assert(fridge?.day === "2026-07-24", "each session carries its own day");
  assert(report.sessions[0]!.sessionNumber === 90, "sessions ordered chronologically across days");

  // המשך מחושב רק על ספירות עם שעת התחלה מתועדת (s3 הוא סשן ותיק ללא startedAt)
  assert(report.totals.sessionsWithDuration === 3, "only timed sessions are counted");
  assert(report.totals.totalDurationMinutes === 110, "total duration = 45 + 25 + 40");
  assert(report.totals.avgDurationMinutes === 37, "average over timed sessions only");

  const emptyRange = aggregateDailyReport({
    day: "2026-07-01",
    from: "2026-07-01",
    to: "2026-07-05",
    sessions: [],
    exclusions: [],
    newPlacements: [],
  });
  assert(emptyRange.locationsCounted === 0, "empty range counted no locations");
  assert(emptyRange.totals.avgDurationMinutes === null, "no average without timed sessions");
}

function testTruncation(): void {
  const many = session({
    id: "big",
    sessionNumber: 900,
    productCount: 5000,
    lines: Array.from({ length: 5000 }, () => line()),
  });
  const report = aggregateDailyReport({
    day: DAY,
    sessions: [many],
    exclusions: [],
    newPlacements: [],
  });
  assert(report.linesTruncated === true, "oversized report is truncated");
  assert(report.lines.length === 3000, "line cap enforced");
  assert(report.totals.productsChecked === 5000, "totals stay accurate when lines are capped");
}

async function testDocuments(report: ReturnType<typeof testAggregation>): Promise<void> {
  const out = tmpdir();

  for (const lang of ["he", "ar", "en"] as const) {
    const pdf = await inventoryDailyReportPdf(report, lang);
    assert(pdf.byteLength > 2000, `${lang} pdf has content`);
    const head = Buffer.from(pdf.subarray(0, 5)).toString("latin1");
    assert(head === "%PDF-", `${lang} pdf has a pdf header`);
    const path = join(out, inventoryDailyReportFileName(report.day, "pdf").replace(".pdf", `-${lang}.pdf`));
    await writeFile(path, pdf);
    console.log(`  pdf ${lang}: ${(pdf.byteLength / 1024).toFixed(0)} KB → ${path}`);
  }

  const xlsx = inventoryDailyReportExcel(report);
  assert(xlsx.byteLength > 2000, "excel has content");
  assert(xlsx[0] === 0x50 && xlsx[1] === 0x4b, "excel is a zip container");
  const xlsxPath = join(out, inventoryDailyReportFileName(report.day, "xlsx"));
  await writeFile(xlsxPath, xlsx);
  console.log(`  excel: ${(xlsx.byteLength / 1024).toFixed(0)} KB → ${xlsxPath}`);

  const name = inventoryDailyReportFileName(report.day, "pdf");
  assert(name.endsWith(".pdf") && name.includes(report.day), "file name carries the day");
}

/** אותם מסמכים בדיוק, הפעם על טווח — כולל עמודת התאריך שנוספת רק בטווח */
async function testRangeDocuments(): Promise<void> {
  const { sessions, exclusions, newPlacements } = buildFixture();
  const report = aggregateDailyReport({
    day: "2026-07-24",
    from: "2026-07-24",
    to: DAY,
    sessions,
    exclusions,
    newPlacements,
  });

  const out = tmpdir();
  for (const lang of ["he", "ar", "en"] as const) {
    const pdf = await inventoryDailyReportPdf(report, lang);
    assert(pdf.byteLength > 2000, `${lang} range pdf has content`);
    assert(Buffer.from(pdf.subarray(0, 5)).toString("latin1") === "%PDF-", `${lang} range pdf header`);
    const path = join(out, inventoryCountSummaryFileName(report, "pdf").replace(".pdf", `-${lang}.pdf`));
    await writeFile(path, pdf);
    console.log(`  range pdf ${lang}: ${(pdf.byteLength / 1024).toFixed(0)} KB → ${path}`);
  }

  const xlsx = inventoryDailyReportExcel(report);
  assert(xlsx[0] === 0x50 && xlsx[1] === 0x4b, "range excel is a zip container");
  const xlsxPath = join(out, inventoryCountSummaryFileName(report, "xlsx"));
  await writeFile(xlsxPath, xlsx);
  console.log(`  range excel: ${(xlsx.byteLength / 1024).toFixed(0)} KB → ${xlsxPath}`);

  const name = inventoryCountSummaryFileName(report, "pdf");
  assert(name.includes("2026-07-24") && name.includes(DAY), "range file name carries both bounds");
}

async function main(): Promise<void> {
  console.log("daily count report tests…");
  testHelpers();
  testRanges();
  const report = testAggregation();
  testRangeAggregation();
  testTruncation();
  await testDocuments(report);
  await testRangeDocuments();
  console.log("all daily count report tests passed");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

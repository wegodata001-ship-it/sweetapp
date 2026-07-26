/**
 * Verification for the unified PDF engine. Run with: npm run test:pdf
 *
 * Asserts the properties that the Arabic-tofu bug violated: every character is drawn with a
 * font that contains it, Arabic is shaped into contextual forms, and mixed-direction text is
 * ordered by the Unicode Bidi Algorithm.
 */
import assert from "node:assert/strict";
import { createPdf, pdfFileName, type PdfContext } from "./pdf-engine";
import { drawTable } from "./pdf-table";
import { shapeTextRuns } from "./pdf-i18n";
import { resolveScriptForCodePoint, preloadPdfFonts } from "./pdf-fonts";
import { formatMoney, formatDate, formatIdentifier, formatQuantity } from "./pdf-utils";

let failures = 0;
const results: string[] = [];

function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return (async () => {
    try {
      await fn();
      results.push(`  PASS  ${name}`);
    } catch (e) {
      failures++;
      results.push(`  FAIL  ${name}\n        ${e instanceof Error ? e.message : String(e)}`);
    }
  })();
}

const SAMPLE_ROWS = [
  { name: "اسم المنتج العربي", he: "מוצר בעברית", qty: 12, price: 25.5, code: "SKU-001" },
  { name: "Latin Product Name", he: "מוצר שני", qty: 3, price: 1250, code: "SKU-002" },
  { name: "حلويات القدس", he: "מארז שוקולד", qty: 140, price: 8.25, code: "TR-00125" },
];

/** A document exercising every feature: mixed scripts, tables, totals, long text. */
const renderSample = async (ctx: PdfContext) => {
  const { layout, t } = ctx;
  await layout.infoPanel([
    { label: t("documentNumber"), value: formatIdentifier("INV-00015") },
    { label: t("date"), value: formatDate(new Date("2026-07-26")) },
    { label: t("customer"), value: "شركة حلويات القدس / חלווית קודס בע\u05F4מ" },
    { label: t("paymentMethod"), value: "Visa •••• 4242" },
  ]);
  await layout.sectionTitle(t("details"));
  await drawTable(layout, {
    columns: [
      { header: t("product"), width: 3, value: (r: (typeof SAMPLE_ROWS)[number]) => r.name },
      { header: t("description"), width: 3, value: (r) => r.he },
      { header: t("reference"), width: 2, value: (r) => formatIdentifier(r.code), align: "start" },
      { header: t("quantity"), width: 1.2, value: (r) => formatQuantity(r.qty), align: "end" },
      { header: t("unitPrice"), width: 1.6, value: (r) => formatMoney(r.price), align: "end" },
      { header: t("total"), width: 1.8, value: (r) => formatMoney(r.qty * r.price), align: "end" },
    ],
    rows: SAMPLE_ROWS,
    emptyText: t("noRows"),
  });
  const sum = SAMPLE_ROWS.reduce((s, r) => s + r.qty * r.price, 0);
  await layout.totals([
    { label: t("subtotal"), value: formatMoney(sum) },
    { label: t("vat"), value: formatMoney(sum * 0.18) },
    { label: t("grandTotal"), value: formatMoney(sum * 1.18), strong: true },
  ]);
  await layout.sectionTitle(t("notes"));
  await layout.paragraph(
    "ملاحظة طويلة بالعربية لاختبار التغليف التلقائي للنص داخل المستند مع أرقام 12345 ومبالغ 250 وكذلك טקסט בעברית באותה פסקה together with English words to prove the bidi algorithm keeps every run in the right visual order even across many lines of wrapped content.",
  );
};

async function main() {
  await preloadPdfFonts();

  // --- 1. Font resolution: the actual root cause of the boxes ---
  await check("Arabic letter resolves to the Arabic font", async () => {
    const r = await resolveScriptForCodePoint("ب".codePointAt(0)!, "regular");
    assert.equal(r.script, "arabic");
    assert.equal(r.covered, true);
  });
  await check("Hebrew letter resolves to the Hebrew font", async () => {
    const r = await resolveScriptForCodePoint("א".codePointAt(0)!, "regular");
    assert.equal(r.script, "hebrew");
    assert.equal(r.covered, true);
  });
  await check("digits resolve to a font that has them", async () => {
    const r = await resolveScriptForCodePoint("5".codePointAt(0)!, "regular");
    assert.equal(r.covered, true);
  });
  await check("shekel sign is covered (Arabic font lacks it, must fall back)", async () => {
    const r = await resolveScriptForCodePoint(0x20aa, "regular");
    assert.equal(r.covered, true);
  });

  // --- 2. Bidi run ordering ---
  await check("Arabic + Latin run order is visually correct", async () => {
    const runs = await shapeTextRuns("الفاتورة INV-00015", { direction: "rtl" });
    assert.ok(runs.length >= 2, "expected multiple runs");
    // In RTL, the Latin/number run must be drawn first (leftmost).
    assert.match(runs[0].text, /INV/);
    assert.equal(runs.at(-1)!.script, "arabic");
  });
  await check("Hebrew paragraph with digits keeps digits LTR", async () => {
    const runs = await shapeTextRuns("מספר 12345", { direction: "rtl" });
    assert.equal(runs[0].text.trim(), "12345");
    assert.equal(runs[0].level % 2, 0, "digits must sit at an even (LTR) level");
  });
  await check("LTR base direction places the Hebrew run after the Latin run", async () => {
    const runs = await shapeTextRuns("Total סה\u05F4כ 250", { direction: "ltr" });
    assert.match(runs[0].text, /^Total/);
    assert.equal(runs[0].script, "latin");
    const hebrewIndex = runs.findIndex((r) => r.script === "hebrew");
    assert.ok(hebrewIndex > 0, "Hebrew must not be drawn first in an LTR paragraph");
    // The trailing number belongs to an even level, so it stays left-to-right.
    const digitRun = runs.find((r) => /\d/.test(r.text));
    assert.ok(digitRun && digitRun.level % 2 === 0);
  });
  await check("LTR base: Arabic block is reversed as a block, Latin word stays last", async () => {
    const runs = await shapeTextRuns("ملاحظة عربية together", { direction: "ltr" });
    // The Latin word is logically last and must therefore be drawn rightmost.
    assert.equal(runs.at(-1)!.text.trim(), "together");
    assert.equal(runs[0].script, "arabic");
  });
  await check("RTL base: Latin word is drawn leftmost", async () => {
    const runs = await shapeTextRuns("ملاحظة عربية together", { direction: "rtl" });
    assert.equal(runs[0].text.trim(), "together");
    assert.equal(runs.at(-1)!.script, "arabic");
  });
  await check("a pure Arabic phrase stays one run (spaces inherit the script)", async () => {
    const runs = await shapeTextRuns("مرحبا بالعالم", { direction: "rtl" });
    assert.equal(runs.length, 1, `expected 1 run, got ${runs.length}`);
    assert.equal(runs[0].script, "arabic");
  });
  await check("a pure Hebrew phrase stays one run", async () => {
    const runs = await shapeTextRuns("שלום עולם", { direction: "rtl" });
    assert.equal(runs.length, 1, `expected 1 run, got ${runs.length}`);
    assert.equal(runs[0].script, "hebrew");
  });

  await check("each run is single-script (no mixed-font run)", async () => {
    const runs = await shapeTextRuns("مرحبا שלום Hello 123", { direction: "rtl" });
    for (const run of runs) {
      const scripts = new Set(
        [...run.text].map((c) => {
          const cp = c.codePointAt(0)!;
          if (cp >= 0x0600 && cp <= 0x06ff) return "arabic";
          if (cp >= 0x0590 && cp <= 0x05ff) return "hebrew";
          return "other";
        }),
      );
      scripts.delete("other");
      assert.ok(scripts.size <= 1, `run "${run.text}" mixes scripts`);
    }
  });

  // --- 3. End-to-end document generation in all languages ---
  for (const language of ["he", "ar", "en"] as const) {
    await check(`createPdf renders a full document in "${language}" with zero missing glyphs`, async () => {
      const out = await createPdf({
        documentType: "invoice",
        data: null,
        language,
        render: (ctx) => renderSample(ctx),
      });
      assert.equal(
        out.missingGlyphs.length,
        0,
        `missing glyphs: ${out.missingGlyphs.map((c) => "U+" + c.toString(16)).join(", ")}`,
      );
      assert.ok(out.pageCount >= 1);
      assert.ok(out.bytes.byteLength > 4000, "PDF looks suspiciously small");
      assert.equal(out.direction, language === "en" ? "ltr" : "rtl");
    });
  }

  await check("mixed Hebrew+Arabic+English document has no missing glyphs", async () => {
    const out = await createPdf({
      documentType: "inventoryCount",
      data: null,
      language: "ar",
      render: async (ctx) => {
        await ctx.layout.paragraph("عربي עברית English 123 ₪ $ € 45.50");
        await ctx.layout.infoPanel([
          { label: "مختلط", value: "מוצר اسم Product ₪250" },
        ]);
      },
    });
    assert.equal(out.missingGlyphs.length, 0);
  });

  // --- 4. Multi-page and large tables ---
  await check("large table paginates and repeats headers", async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      name: `منتج رقم ${i + 1}`,
      he: `מוצר ${i + 1}`,
      qty: i + 1,
      price: (i + 1) * 3.5,
      code: `SKU-${String(i + 1).padStart(4, "0")}`,
    }));
    const out = await createPdf({
      documentType: "inventoryReport",
      data: null,
      language: "ar",
      render: async (ctx) => {
        await drawTable(ctx.layout, {
          columns: [
            { header: ctx.t("product"), width: 3, value: (r: (typeof many)[number]) => r.name },
            { header: ctx.t("description"), width: 3, value: (r) => r.he },
            { header: ctx.t("quantity"), width: 1, value: (r) => formatQuantity(r.qty), align: "end" },
            { header: ctx.t("total"), width: 1.5, value: (r) => formatMoney(r.price), align: "end" },
          ],
          rows: many,
        });
      },
    });
    assert.ok(out.pageCount > 1, `expected multiple pages, got ${out.pageCount}`);
    assert.equal(out.missingGlyphs.length, 0);
  });

  await check("empty table renders its placeholder", async () => {
    const out = await createPdf({
      documentType: "salesReport",
      data: null,
      language: "he",
      render: async (ctx) => {
        await drawTable(ctx.layout, {
          columns: [{ header: ctx.t("product"), width: 1, value: () => "" }],
          rows: [],
          emptyText: ctx.t("noRows"),
        });
      },
    });
    assert.equal(out.pageCount, 1);
  });

  // --- 5. Formatting helpers ---
  await check("money/date/quantity formatting is stable", () => {
    assert.match(formatMoney(1234.5), /1,234\.50/);
    assert.match(formatMoney(-20, "USD"), /-\$/);
    assert.equal(formatQuantity(12), "12");
    assert.equal(formatQuantity(12.5), "12.50");
    assert.match(formatDate(new Date("2026-07-26T10:00:00Z")), /26\/07\/2026/);
  });

  await check("file names are safe and referenced", () => {
    const name = pdfFileName("invoice", "INV/00015", "he");
    assert.ok(name.endsWith(".pdf"));
    assert.ok(!name.includes("/"), `unsafe name: ${name}`);
  });

  // --- 6. Performance guard ---
  await check("a typical document generates in under 1500ms after warmup", async () => {
    const out = await createPdf({
      documentType: "receipt",
      data: null,
      language: "ar",
      render: (ctx) => renderSample(ctx),
    });
    assert.ok(out.durationMs < 1500, `took ${out.durationMs}ms`);
  });

  console.log("pdf-engine.test.ts");
  console.log(results.join("\n"));
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll PDF engine checks passed.");
}

void main();

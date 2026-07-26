import { PDFDocument, rgb } from "pdf-lib";
import * as XLSX from "xlsx";
import {
  CONTENT_W,
  PDF_MARGIN,
  PDF_PAGE_H,
  PDF_PAGE_W,
  drawFooter,
  drawHeader,
  drawRtlText,
} from "@/lib/pdf/invoice-pdf-draw";
import { loadInvoicePdfFonts, safeFilePart } from "@/lib/pdf/pdf-helpers";
import { ltrIsolate } from "@/lib/pdf/pdf-utils";
import type { CountSessionDetail } from "@/lib/inventory/count-session-service";

function businessName(): string {
  return (
    process.env.WEGO_BUSINESS_NAME?.trim() ||
    process.env.NEXT_PUBLIC_BUSINESS_NAME?.trim() ||
    "WEGO BUSINESS"
  );
}

function fmtDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function countSessionExcelBuffer(detail: CountSessionDetail): Buffer {
  const { date, time } = fmtDateTime(detail.createdAt);
  const meta = [
    ["שם העסק", businessName()],
    ["מיקום אחסון", detail.locationName],
    ["מספר ספירה", detail.sessionNumber],
    ["תאריך", date],
    ["שעה", time],
    ["מבצע הספירה", detail.countedByName ?? "—"],
    ["סטטוס", detail.status],
    [],
    ["סיכום"],
    ["מספר מוצרים", detail.productCount],
    ["חוסרים", detail.shortageCount],
    ["עודפים", detail.surplusCount],
    ["תקינים", detail.matchCount],
    ["סה״כ יחידות שנספרו", detail.totalCountedQty],
  ];

  const productRows = [
    [
      "שם מוצר",
      "ברקוד",
      "מק״ט",
      "כמות במיקום (לפני)",
      "מינימום",
      "נספר",
      "הפרש",
      "חוסר מול מינימום",
      "פירוט עובדים",
    ],
    ...detail.lines.map((line) => {
      const shortage =
        line.minimumQuantity > 0
          ? Math.max(0, line.minimumQuantity - line.currentQuantity)
          : 0;
      const workersText = line.workers
        .map(
          (w) =>
            `${w.workerDisplayName} (${w.workerWorkArea || "—"}): ${w.countedQuantity}`,
        )
        .join(" | ");
      return [
        line.name,
        line.barcode ?? "",
        line.sku ?? "",
        line.previousQuantity,
        line.minimumQuantity,
        line.currentQuantity,
        line.difference,
        shortage,
        workersText,
      ];
    }),
  ];

  const workerRows = [
    ["מוצר", "עובד", "אזור אחריות", "כמות שנספרה", "זמן"],
    ...detail.lines.flatMap((line) =>
      line.workers.map((w) => [
        line.name,
        w.workerDisplayName,
        w.workerWorkArea,
        w.countedQuantity,
        new Date(w.createdAt).toLocaleString("he-IL"),
      ]),
    ),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), "פרטי ספירה");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(productRows), "מוצרים");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(workerRows), "עובדים");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function countSessionPdfBytes(detail: CountSessionDetail): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const loaded = await loadInvoicePdfFonts(pdfDoc);
  const fonts = {
    he: loaded.he,
    heBold: loaded.heBold,
    en: loaded.en,
    enBold: loaded.enBold,
    num: loaded.num,
  };

  let page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
  let y = PDF_PAGE_H - PDF_MARGIN;
  const { date, time } = fmtDateTime(detail.createdAt);

  y = await drawHeader(
    page,
    { he: fonts.he, heBold: fonts.heBold, enBold: fonts.enBold },
    {
      reportTitleHe: "דוח ספירת מלאי",
      metaLines: [
        `עסק: ${businessName()}`,
        `מיקום: ${detail.locationName}`,
        `מספר ספירה: ${detail.sessionNumber}`,
        `תאריך: ${date} · שעה: ${time}`,
        `מבצע: ${detail.countedByName ?? "—"}`,
      ],
    },
  );

  const summary = [
    `מוצרים: ${detail.productCount}`,
    `חוסרים: ${detail.shortageCount}`,
    `עודפים: ${detail.surplusCount}`,
    `סה״כ נספר: ${detail.totalCountedQty}`,
  ].join("  |  ");
  await drawRtlText(page, fonts.heBold, summary, PDF_PAGE_W - PDF_MARGIN, y, 10);
  y -= 22;

  const headers = ["מוצר", "ברקוד", "במיקום", "מינ׳", "נספר", "הפרש", "חוסר"];
  const colW = [180, 90, 70, 55, 70, 60, 55];
  const tableRight = PDF_PAGE_W - PDF_MARGIN;

  const drawTableHeader = async () => {
    let x = tableRight;
    page.drawRectangle({
      x: PDF_MARGIN,
      y: y - 4,
      width: CONTENT_W,
      height: 18,
      color: rgb(0.02, 0.08, 0.18),
    });
    for (let i = 0; i < headers.length; i++) {
      await drawRtlText(page, fonts.heBold, headers[i], x - 4, y, 8, rgb(1, 1, 1));
      x -= colW[i];
    }
    y -= 20;
  };

  await drawTableHeader();

  for (const line of detail.lines) {
    if (y < 90) {
      await drawFooter(page, { en: fonts.en, enBold: fonts.enBold });
      page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
      y = PDF_PAGE_H - PDF_MARGIN;
      await drawTableHeader();
    }
    const shortage =
      line.minimumQuantity > 0
        ? Math.max(0, line.minimumQuantity - line.currentQuantity)
        : 0;
    const cells = [
      line.name.slice(0, 28),
      ltrIsolate((line.barcode ?? "—").slice(0, 14)),
      ltrIsolate(String(line.previousQuantity)),
      ltrIsolate(String(line.minimumQuantity)),
      ltrIsolate(String(line.currentQuantity)),
      // Signed: without isolation a difference of -2 reads as "2-" in a right-to-left row.
      ltrIsolate(String(line.difference)),
      ltrIsolate(String(shortage)),
    ];
    let x = tableRight;
    for (let i = 0; i < cells.length; i++) {
      await drawRtlText(page, fonts.he, cells[i], x - 4, y, 8);
      x -= colW[i];
    }
    y -= 14;

    if (line.workers.length > 0) {
      const wText = line.workers
        .map(
          (w) =>
            `${w.workerDisplayName}/${w.workerWorkArea || "—"}: ${w.countedQuantity}`,
        )
        .join(" · ");
      if (y < 70) {
        await drawFooter(page, { en: fonts.en, enBold: fonts.enBold });
        page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
        y = PDF_PAGE_H - PDF_MARGIN;
      }
      await drawRtlText(page, fonts.he, `עובדים: ${wText}`.slice(0, 110), tableRight, y, 7, rgb(0.3, 0.35, 0.4));
      y -= 12;
    }
  }

  y -= 16;
  if (y < 100) {
    await drawFooter(page, { en: fonts.en, enBold: fonts.enBold });
    page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
    y = PDF_PAGE_H - PDF_MARGIN;
  }

  await drawRtlText(page, fonts.heBold, "חתימת מבצע הספירה: ____________________", tableRight, y, 10);
  y -= 22;
  await drawRtlText(page, fonts.heBold, "חתימת מנהל: ____________________", tableRight, y, 10);

  await drawFooter(page, { en: fonts.en, enBold: fonts.enBold });
  return pdfDoc.save();
}

export function countSessionExportFileName(
  detail: CountSessionDetail,
  ext: "pdf" | "xlsx",
): string {
  const d = detail.createdAt.slice(0, 10);
  return `${safeFilePart(`count-${detail.sessionNumber}-${detail.locationName}-${d}`)}.${ext}`;
}

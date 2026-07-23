import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireDb } from "@/lib/api-route";
import { getInventoryAnalyticsDashboard } from "@/lib/inventory/analytics-service";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") || "xlsx").toLowerCase();
  if (format === "pdf") {
    return NextResponse.json(
      { ok: false, error: "ייצוא PDF כבוי כרגע", code: "PDF_DISABLED" },
      { status: 501 },
    );
  }
  if (format !== "xlsx" && format !== "csv") {
    return NextResponse.json({ ok: false, error: "format חייב להיות xlsx או csv" }, { status: 400 });
  }

  try {
    const data = await getInventoryAnalyticsDashboard({
      range: sp.get("range"),
      from: sp.get("from"),
      to: sp.get("to"),
      locationId: sp.get("locationId"),
      workerId: sp.get("workerId"),
      category: sp.get("category"),
      productId: sp.get("productId"),
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([data.kpis]),
      "KPIs",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(data.usage.daily),
      "UsageDaily",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(data.topProducts.mostUsed),
      "TopUsed",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(data.workers),
      "Workers",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(data.locations),
      "Locations",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(data.forecast),
      "Forecast",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(data.critical.belowMinimum),
      "CriticalMin",
    );

    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet([data.kpis]));
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="inventory-analytics.csv"`,
        },
      });
    }

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="inventory-analytics.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

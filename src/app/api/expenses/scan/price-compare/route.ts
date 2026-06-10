import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import type { ScannedDocument } from "@/lib/document-scan/api-response";
import { enrichExpenseSupplierScan } from "@/lib/procurement/enrich-expense-supplier-scan";

/** POST — השוואת מחירים מחדש אחרי קישור ספק (ללא סריקה חוזרת) */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  try {
    const body = (await req.json()) as {
      supplierId?: string;
      supplierName?: string;
      items?: ScannedDocument["items"];
    };
    const supplierId = body.supplierId?.trim();
    if (!supplierId) {
      return NextResponse.json({ ok: false, error: "supplierId required" }, { status: 400 });
    }

    const doc: ScannedDocument = {
      supplierRawName: body.supplierName ?? "",
      supplierName: body.supplierName ?? "",
      supplierId,
      invoiceNumber: "",
      date: "",
      items: Array.isArray(body.items) ? body.items : [],
      rawText: "",
      engine: "gemini_vision",
      confidence: 0,
    };

    const enriched = await enrichExpenseSupplierScan(doc);
    return NextResponse.json({
      ok: true,
      data: {
        items: enriched.items,
        priceCompareSummary: enriched.priceCompareSummary,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
}

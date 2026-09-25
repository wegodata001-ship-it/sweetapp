import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { loadVatSummary } from "@/lib/finance/load-vat-summary";
import {
  buildFinancialSummaryPdf,
  buildFinancialSummaryWorkbook,
  financialSummaryFileStem,
  type VatExportSections,
} from "@/lib/finance/vat-summary-export";

export const dynamic = "force-dynamic";

function sectionsFrom(raw: unknown): VatExportSections {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    summary: body.summary !== false,
    z: body.z !== false,
    income: body.income !== false,
    input: body.input !== false,
  };
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    from?: string;
    to?: string;
    format?: string;
    sections?: unknown;
  } | null;
  const from = body?.from?.trim() ?? "";
  const to = body?.to?.trim() ?? "";
  const format = body?.format === "xlsx" ? "xlsx" : body?.format === "pdf" ? "pdf" : "";
  if (!format || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return NextResponse.json({ ok: false, error: "בקשת ייצוא לא תקינה" }, { status: 400 });
  }

  const sections = sectionsFrom(body?.sections);
  if (format === "pdf" && !sections.summary && !sections.z && !sections.income && !sections.input) {
    return NextResponse.json({ ok: false, error: "יש לבחור לפחות חלק אחד לדוח" }, { status: 400 });
  }

  const summary = await loadVatSummary(from, to);
  try {
    const bytes =
      format === "pdf"
        ? await buildFinancialSummaryPdf({ summary, from, to, sections })
        : await buildFinancialSummaryWorkbook({ summary, from, to });
    const ext = format === "pdf" ? "pdf" : "xlsx";
    const name = `${financialSummaryFileStem(from, to)}.${ext}`;
    const ascii = name.replace(/[^\x20-\x7E]/g, "_");
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("VAT_EXPORT_MISMATCH") || message === "PDF_MISSING_GLYPHS") {
      return NextResponse.json({ ok: false, error: "הסיכום לא תואם לפירוט" }, { status: 409 });
    }
    console.error("[vat-export] failed", { from, to, format });
    return NextResponse.json({ ok: false, error: "הפקת הדוח נכשלה" }, { status: 500 });
  }
}

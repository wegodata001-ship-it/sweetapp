import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import {
  LEDGER_V2_PAGE_SIZE_DEFAULT,
  aggregateLedgerV2Totals,
  buildCustomerStatements,
  customerMatchesSearch,
  filterLedgerV2Rows,
  loadLedgerV2Sources,
  paginateLedgerV2,
  type LedgerV2SideFilter,
} from "@/lib/finance/ledger-v2";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const rawSide = sp.get("side")?.trim() ?? "all";
  const side: LedgerV2SideFilter =
    rawSide === "DEBT" || rawSide === "CREDIT" || rawSide === "ZERO" ? rawSide : "all";
  const dateFrom = sp.get("dateFrom")?.trim() || null;
  const dateTo = sp.get("dateTo")?.trim() || null;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(5, parseInt(sp.get("pageSize") ?? String(LEDGER_V2_PAGE_SIZE_DEFAULT), 10) || LEDGER_V2_PAGE_SIZE_DEFAULT),
  );

  try {
    const bundle = await loadLedgerV2Sources();
    const searched = q
      ? bundle.customers.filter((c) => customerMatchesSearch(c, q))
      : bundle.customers;
    const idSet = new Set(searched.map((c) => c.id));

    const { rows } = buildCustomerStatements({
      customers: searched,
      documents: bundle.documents.filter((d) => d.customerId && idSet.has(d.customerId)),
      payments: bundle.payments.filter((p) => idSet.has(p.customerId)),
      dateFrom,
      dateTo,
    });

    const totals = aggregateLedgerV2Totals(rows);
    const filtered = filterLedgerV2Rows(rows, side);
    const ordered =
      sp.get("sort") === "debt"
        ? [...filtered].sort((a, b) => b.debt - a.debt || a.name.localeCompare(b.name))
        : filtered;
    const pageRows = paginateLedgerV2(ordered, page, pageSize);

    return NextResponse.json({
      ok: true,
      totals,
      total: filtered.length,
      page,
      pageSize,
      rows: pageRows,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

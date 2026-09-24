import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import {
  LEDGER_V2_PAGE_SIZE_DEFAULT,
  LEDGER_V2_SAFETY_CAP,
  aggregateLedgerV2Totals,
  buildCustomerStatements,
  customerMatchesSearch,
  filterLedgerV2Rows,
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
    const customers = await prisma.customer.findMany({
      orderBy: { name: "asc" },
      take: LEDGER_V2_SAFETY_CAP,
      select: { id: true, name: true, phone: true, openingBalance: true },
    });

    const searched = q
      ? customers.filter((c) => customerMatchesSearch(c, q))
      : customers;
    const ids = searched.map((c) => c.id);

    const [documents, payments] = await Promise.all([
      ids.length > 0
        ? prisma.financialDocument.findMany({
            where: { customerId: { in: ids } },
            select: {
              id: true,
              customerId: true,
              documentType: true,
              category: true,
              title: true,
              totalAmount: true,
              remainingAmount: true,
              paymentStatus: true,
              docDate: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      ids.length > 0
        ? prisma.payment.findMany({
            where: { customerId: { in: ids } },
            select: {
              id: true,
              customerId: true,
              amount: true,
              createdAt: true,
              documentId: true,
              document: { select: { title: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const { rows } = buildCustomerStatements({
      customers: searched,
      documents,
      payments: payments.map((p) => ({
        id: p.id,
        customerId: p.customerId,
        amount: p.amount,
        createdAt: p.createdAt,
        documentId: p.documentId,
        documentTitle: p.document?.title ?? null,
      })),
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

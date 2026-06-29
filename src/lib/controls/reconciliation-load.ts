import { prisma } from "@/lib/prisma";
import { RECON_STATUS, isReconStatus, type ReconStatus } from "@/lib/controls/reconciliation-constants";
import type {
  ReconImportDetailDto,
  ReconImportDto,
  ReconKpis,
  ReconRowDto,
} from "@/lib/controls/reconciliation-types";

function asStatus(value: string): ReconStatus {
  return isReconStatus(value) ? value : RECON_STATUS.PENDING;
}

export function computeKpis(rows: { status: string }[]): ReconKpis {
  const kpis: ReconKpis = {
    total: rows.length,
    matched: 0,
    differences: 0,
    missingInWego: 0,
    missingInExternal: 0,
  };
  for (const r of rows) {
    if (r.status === RECON_STATUS.MATCHED) kpis.matched++;
    else if (r.status === RECON_STATUS.AMOUNT_DIFFERENCE) kpis.differences++;
    else if (r.status === RECON_STATUS.MISSING_IN_WEGO) kpis.missingInWego++;
    else if (r.status === RECON_STATUS.MISSING_IN_EXTERNAL) kpis.missingInExternal++;
  }
  return kpis;
}

export async function loadImportDetail(importId: string): Promise<ReconImportDetailDto | null> {
  const imp = await prisma.systemReconciliationImport.findUnique({
    where: { id: importId },
    include: { importedBy: { select: { fullName: true } } },
  });
  if (!imp) return null;

  const rows = await prisma.systemReconciliationRow.findMany({
    where: { importId },
    orderBy: { createdAt: "asc" },
  });

  const orderIds = Array.from(
    new Set(rows.map((r) => r.matchedOrderId).filter((v): v is string => Boolean(v))),
  );
  const orders = orderIds.length
    ? await prisma.futureOrder.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderNumber: true, totalAmount: true },
      })
    : [];
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const rowDtos: ReconRowDto[] = rows.map((r) => {
    const order = r.matchedOrderId ? orderMap.get(r.matchedOrderId) : undefined;
    return {
      id: r.id,
      customerCode: r.externalCustomerCode,
      customerName: r.externalCustomerName,
      externalOrderId: r.externalOrderId,
      wegoOrderId: order?.id ?? null,
      wegoOrderNumber: order?.orderNumber ?? null,
      externalAmount: r.externalAmount ?? null,
      wegoAmount: order?.totalAmount ?? null,
      difference: r.differenceAmount ?? null,
      externalDate: r.externalDate ? r.externalDate.toISOString() : null,
      status: asStatus(r.status),
    };
  });

  const importDto: ReconImportDto = {
    id: imp.id,
    country: imp.country,
    weekCode: imp.weekCode,
    fileName: imp.fileName,
    importedAt: imp.importedAt.toISOString(),
    importedByName: imp.importedBy?.fullName ?? null,
    totalRows: imp.totalRows,
    matched: rows.some((r) => r.status !== RECON_STATUS.PENDING),
  };

  return { import: importDto, rows: rowDtos, kpis: computeKpis(rows) };
}

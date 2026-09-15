/**
 * בניית רשימת כרטסת מאוחדת — Master-first (Customer/Supplier/Employee),
 * חיפוש לפני pagination, כולל התאמת שמות בעברית/ערבית.
 * לא נוגע ביתרות / תנועות / DB writes.
 */

import {
  normalizeSupplierName,
  parseSupplierAliases,
} from "@/lib/document-scan/supplier-aliases";
import type { EntityType } from "@/lib/finance/types";

export type LedgerMasterEntity = {
  entity_type: EntityType;
  id: string;
  name: string;
  opening_balance: number;
  /** לספקים — aliases ב־notes */
  notes?: string | null;
};

export const LEDGER_MASTER_SAFETY_CAP = 10_000;

/** האם שם ישות תואם לשאילתת חיפוש (substring + נירמול ערבית/עברית + aliases) */
export function ledgerEntityNameMatches(
  name: string,
  query: string,
  notes?: string | null,
): boolean {
  const q = query.trim();
  if (!q) return true;
  const raw = name ?? "";
  if (raw.includes(q)) return true;

  const nq = normalizeSupplierName(q);
  const nn = normalizeSupplierName(raw);
  if (nq && nn && (nn.includes(nq) || nq.includes(nn))) return true;

  for (const alias of parseSupplierAliases(notes)) {
    if (alias.includes(q)) return true;
    const na = normalizeSupplierName(alias);
    if (nq && na && (na.includes(nq) || nq.includes(na))) return true;
  }
  return false;
}

export function filterLedgerMasterEntities(
  entities: LedgerMasterEntity[],
  query: string,
): LedgerMasterEntity[] {
  const q = query.trim();
  if (!q) return entities;
  return entities.filter((e) => ledgerEntityNameMatches(e.name, q, e.notes));
}

export function mergeLedgerMasterEntities(params: {
  customers: LedgerMasterEntity[];
  suppliers: LedgerMasterEntity[];
  employees: LedgerMasterEntity[];
  entityType: "all" | EntityType;
}): LedgerMasterEntity[] {
  const { customers, suppliers, employees, entityType } = params;
  if (entityType === "customer") return [...customers];
  if (entityType === "supplier") return [...suppliers];
  if (entityType === "employee") return [...employees];
  return [...customers, ...suppliers, ...employees];
}

export function paginateLedgerEntities(params: {
  entities: LedgerMasterEntity[];
  entityId?: string;
  page: number;
  pageSize: number;
}): {
  rows: LedgerMasterEntity[];
  total: number;
  counts: { customers: number; suppliers: number; employees: number };
} {
  let filtered = params.entities;
  if (params.entityId?.trim()) {
    filtered = filtered.filter((e) => e.id === params.entityId!.trim());
  }
  filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name, "he"));

  const counts = {
    customers: filtered.filter((e) => e.entity_type === "customer").length,
    suppliers: filtered.filter((e) => e.entity_type === "supplier").length,
    employees: filtered.filter((e) => e.entity_type === "employee").length,
  };
  const total = filtered.length;
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(5, params.pageSize));
  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);
  return { rows, total, counts };
}

/**
 * Pipeline מלא: filter by q → merge by type → paginate.
 * Search תמיד על כל ה-master שהועבר (לא על עמוד בודד).
 */
export function buildLedgerOverviewPage(params: {
  customers: LedgerMasterEntity[];
  suppliers: LedgerMasterEntity[];
  employees: LedgerMasterEntity[];
  q?: string;
  entityType?: "all" | EntityType;
  entityId?: string;
  page: number;
  pageSize: number;
}): {
  rows: LedgerMasterEntity[];
  total: number;
  counts: { customers: number; suppliers: number; employees: number };
} {
  const q = params.q?.trim() ?? "";
  const entityType = params.entityType ?? "all";
  const customers = filterLedgerMasterEntities(params.customers, q);
  const suppliers = filterLedgerMasterEntities(params.suppliers, q);
  const employees = filterLedgerMasterEntities(params.employees, q);
  const merged = mergeLedgerMasterEntities({
    customers,
    suppliers,
    employees,
    entityType,
  });
  return paginateLedgerEntities({
    entities: merged,
    entityId: params.entityId,
    page: params.page,
    pageSize: params.pageSize,
  });
}

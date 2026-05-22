import type {
  AccountantTransferLogRow,
  CashFlowRow,
  EntityType,
  FinanceDocumentRow,
  FinanceEntityRow,
  LedgerMovementView,
  LedgerOverviewRow,
} from "@/lib/finance/types";
import type { FinanceDocumentPayload } from "@/lib/finance/document-payload";

export async function fetchEntitiesByType(entityType: EntityType): Promise<FinanceEntityRow[]> {
  const res = await fetch(`/api/ledger/entities?type=${encodeURIComponent(entityType)}`, {
    credentials: "same-origin",
  });
  try {
    const j = (await res.json()) as { ok?: boolean; data?: FinanceEntityRow[] };
    if (!j.ok || !j.data) return [];
    return j.data;
  } catch {
    return [];
  }
}

export type LedgerOverviewResponse = {
  counts: { customers: number; suppliers: number; employees: number };
  total: number;
  page: number;
  pageSize: number;
  rows: LedgerOverviewRow[];
};

export async function fetchLedgerOverview(params: {
  q?: string;
  entityType?: "all" | EntityType;
  entityId?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<LedgerOverviewResponse> {
  const q = new URLSearchParams();
  if (params.q?.trim()) q.set("q", params.q.trim());
  if (params.entityType && params.entityType !== "all") q.set("entityType", params.entityType);
  if (params.entityId?.trim()) q.set("entityId", params.entityId.trim());
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));

  const res = await fetch(`/api/ledger/overview?${q}`, { credentials: "same-origin", cache: "no-store" });
  try {
    const j = (await res.json()) as { ok?: boolean } & Partial<LedgerOverviewResponse>;
    if (!j.ok) {
      return { counts: { customers: 0, suppliers: 0, employees: 0 }, total: 0, page: 1, pageSize: 10, rows: [] };
    }
    return {
      counts: j.counts ?? { customers: 0, suppliers: 0, employees: 0 },
      total: j.total ?? 0,
      page: j.page ?? 1,
      pageSize: j.pageSize ?? 10,
      rows: j.rows ?? [],
    };
  } catch {
    return { counts: { customers: 0, suppliers: 0, employees: 0 }, total: 0, page: 1, pageSize: 10, rows: [] };
  }
}

export async function fetchLedgerForFilters(params: {
  entityType: EntityType;
  entityId: string;
  dateFrom: string | null;
  dateTo: string | null;
}): Promise<{
  opening: number;
  movements: LedgerMovementView[];
  entityName: string;
  openDebt: number;
  totalCredit: number;
  balance: number;
}> {
  const q = new URLSearchParams({
    entityType: params.entityType,
    entityId: params.entityId,
  });
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);

  const res = await fetch(`/api/ledger/movements?${q}`, { credentials: "same-origin", cache: "no-store" });
  try {
    const j = (await res.json()) as {
      ok?: boolean;
      opening?: number;
      movements?: LedgerMovementView[];
      entityName?: string;
      openDebt?: number;
      totalCredit?: number;
      balance?: number;
    };
    if (!j.ok) {
      return { opening: 0, movements: [], entityName: "", openDebt: 0, totalCredit: 0, balance: 0 };
    }
    return {
      opening: j.opening ?? 0,
      movements: j.movements ?? [],
      entityName: j.entityName ?? "",
      openDebt: j.openDebt ?? 0,
      totalCredit: j.totalCredit ?? 0,
      balance: j.balance ?? j.openDebt ?? 0,
    };
  } catch {
    return { opening: 0, movements: [], entityName: "", openDebt: 0, totalCredit: 0, balance: 0 };
  }
}

export async function fetchCashOpeningBalance(): Promise<number> {
  const res = await fetch("/api/cashflow/opening", { credentials: "same-origin" });
  try {
    const j = (await res.json()) as { ok?: boolean; cashOpeningBalance?: number };
    if (!j.ok) return 0;
    return j.cashOpeningBalance ?? 0;
  } catch {
    return 0;
  }
}

export type CashFlowFetchFilters = {
  entryType?: "income" | "expense";
  expenseType?: string;
};

export async function fetchCashFlowEntries(filters?: CashFlowFetchFilters): Promise<CashFlowRow[]> {
  const params = new URLSearchParams();
  if (filters?.entryType) params.set("entryType", filters.entryType);
  if (filters?.entryType === "expense" && filters.expenseType) {
    params.set("expenseType", filters.expenseType);
  }
  const qs = params.toString();
  const res = await fetch(`/api/cashflow${qs ? `?${qs}` : ""}`, { credentials: "same-origin" });
  try {
    const j = (await res.json()) as { ok?: boolean; data?: CashFlowRow[] };
    if (!j.ok || !j.data) return [];
    return j.data;
  } catch {
    return [];
  }
}

export async function deleteCashFlowEntry(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/cashflow/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  try {
    const j = (await res.json()) as { ok?: boolean; error?: string };
    return { ok: Boolean(j.ok), error: j.error };
  } catch {
    return { ok: false, error: "תגובת שרת לא תקינה" };
  }
}

export async function updateCashFlowEntry(
  id: string,
  patch: Partial<
    Pick<
      CashFlowRow,
      "entry_date" | "inflow" | "outflow" | "description" | "entry_type" | "customer_name" | "payment_method"
    >
  >,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/cashflow/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entry_date: patch.entry_date,
      inflow: patch.inflow,
      outflow: patch.outflow,
      description: patch.description,
      entryType: patch.entry_type,
      customerName: patch.customer_name,
      paymentMethod: patch.payment_method,
    }),
    credentials: "same-origin",
  });
  try {
    const j = (await res.json()) as { ok?: boolean; error?: string };
    return { ok: Boolean(j.ok), error: j.error };
  } catch {
    return { ok: false, error: "תגובת שרת לא תקינה" };
  }
}

export async function insertDirectCashFlow(params: {
  entry_date: string;
  description: string;
  side: "debit" | "credit";
  amount: number;
}): Promise<{ ok: boolean; error?: string }> {
  const raw = params.amount;
  const amt = raw >= 0 ? raw : -raw;
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, error: "סכום לא תקין" };
  }
  const res = await fetch("/api/cashflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entryType: params.side === "credit" ? "income" : "expense",
      amount: amt,
      description: params.description.trim() || "רישום ישירות",
      entryDate: params.entry_date,
      isDirect: true,
    }),
    credentials: "same-origin",
  });
  try {
    const j = (await res.json()) as { ok?: boolean; error?: string };
    return { ok: Boolean(j.ok), error: j.error };
  } catch {
    return { ok: false, error: "תגובת שרת לא תקינה" };
  }
}

export type FinanceDocumentsResponse = {
  rows: FinanceDocumentRow[];
  counts: { total: number; sent: number; notSent: number };
};

export async function fetchFinanceDocuments(): Promise<FinanceDocumentRow[]> {
  const res = await fetch("/api/documents", { credentials: "same-origin", cache: "no-store" });
  try {
    const j = (await res.json()) as { ok?: boolean; data?: FinanceDocumentRow[] };
    if (!j.ok || !j.data) return [];
    return j.data;
  } catch {
    return [];
  }
}

/**
 * משיכת מסמכים עם סינון לפי סטטוס רואה חשבון + ספירות סיכום.
 */
export async function fetchFinanceDocumentsWithCounts(params: {
  accountant?: "all" | "sent" | "not_sent";
}): Promise<FinanceDocumentsResponse> {
  const q = new URLSearchParams();
  if (params.accountant && params.accountant !== "all") q.set("accountant", params.accountant);
  const res = await fetch(`/api/documents?${q}`, { credentials: "same-origin", cache: "no-store" });
  try {
    const j = (await res.json()) as {
      ok?: boolean;
      data?: FinanceDocumentRow[];
      counts?: { total: number; sent: number; notSent: number };
    };
    if (!j.ok) {
      return { rows: [], counts: { total: 0, sent: 0, notSent: 0 } };
    }
    return {
      rows: j.data ?? [],
      counts: j.counts ?? { total: 0, sent: 0, notSent: 0 },
    };
  } catch {
    return { rows: [], counts: { total: 0, sent: 0, notSent: 0 } };
  }
}

export async function fetchFinanceDocumentById(id: string): Promise<FinanceDocumentRow | null> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" });
  try {
    const j = (await res.json()) as { ok?: boolean; data?: FinanceDocumentRow };
    if (!j.ok || !j.data) return null;
    return j.data;
  } catch {
    return null;
  }
}

export async function updateFinanceDocument(
  id: string,
  patch: Partial<
    Pick<FinanceDocumentRow, "title" | "category" | "doc_date" | "sent_to_cpa" | "payload">
  >,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: patch.title,
      category: patch.category,
      doc_date: patch.doc_date,
      sent_to_cpa: patch.sent_to_cpa,
      payload: patch.payload,
    }),
    credentials: "same-origin",
  });
  try {
    const j = (await res.json()) as { ok?: boolean; error?: string };
    return { ok: Boolean(j.ok), error: j.error };
  } catch {
    return { ok: false, error: "תגובת שרת לא תקינה" };
  }
}

export async function deleteFinanceDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  try {
    const j = (await res.json()) as { ok?: boolean; error?: string };
    return { ok: Boolean(j.ok), error: j.error };
  } catch {
    return { ok: false, error: "תגובת שרת לא תקינה" };
  }
}

/**
 * סימון / ביטול העברה לרואה חשבון למסמך בודד.
 * מחזיר את הרשומה המעודכנת לעדכון מיידי ב־UI (ללא refresh מלא).
 */
export async function setDocumentAccountantSent(
  id: string,
  sent: boolean,
): Promise<{ ok: boolean; data?: FinanceDocumentRow; error?: string }> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}/accountant`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sent }),
    credentials: "same-origin",
  });
  try {
    const j = (await res.json()) as { ok?: boolean; data?: FinanceDocumentRow; error?: string };
    return { ok: Boolean(j.ok), data: j.data, error: j.error };
  } catch {
    return { ok: false, error: "תגובת שרת לא תקינה" };
  }
}

export async function bulkSetDocumentsAccountantSent(
  ids: string[],
  sent: boolean,
): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const res = await fetch(`/api/documents/accountant/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, sent }),
    credentials: "same-origin",
  });
  try {
    const j = (await res.json()) as { ok?: boolean; updated?: number; error?: string };
    return { ok: Boolean(j.ok), updated: j.updated, error: j.error };
  } catch {
    return { ok: false, error: "תגובת שרת לא תקינה" };
  }
}

export async function fetchAccountantTransferLog(documentId: string): Promise<AccountantTransferLogRow[]> {
  const res = await fetch(
    `/api/documents/${encodeURIComponent(documentId)}/accountant/log`,
    { credentials: "same-origin" },
  );
  try {
    const j = (await res.json()) as { ok?: boolean; data?: AccountantTransferLogRow[] };
    if (!j.ok || !j.data) return [];
    return j.data;
  } catch {
    return [];
  }
}

export async function insertFinanceDocument(params: {
  title: string;
  category: string;
  docDate: string | null;
  payload: FinanceDocumentPayload;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const res = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: params.title,
      category: params.category,
      docDate: params.docDate,
      payload: params.payload,
    }),
    credentials: "same-origin",
  });
  try {
    const j = (await res.json()) as { ok?: boolean; error?: string; id?: string };
    return { ok: Boolean(j.ok), error: j.error, id: j.id };
  } catch {
    return { ok: false, error: "תגובת שרת לא תקינה" };
  }
}

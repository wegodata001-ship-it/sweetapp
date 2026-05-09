import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CashFlowRow,
  EntityType,
  FinanceDocumentRow,
  FinanceEntityRow,
  LedgerMovementView,
} from "@/lib/finance/types";

const STORAGE_BUCKET = "finance-docs";

/** Fallback demo entities when Supabase env is missing */
export const FALLBACK_ENTITIES: FinanceEntityRow[] = [
  { id: "demo-supplier", entity_type: "supplier", name: "ספק קמח מרכזי", opening_balance: 18240.5 },
  { id: "demo-customer", entity_type: "customer", name: "רשת דרום", opening_balance: 9650 },
  { id: "demo-employee", entity_type: "employee", name: "עובד ייצור א׳", opening_balance: 3200 },
];

export const FALLBACK_CASH_OPENING = 42180.9;

const FALLBACK_CASH_FLOW: CashFlowRow[] = [
  {
    id: "demo-cf-1",
    entry_date: "2026-05-09",
    description: "פתיחת קופת מזומן בוקר + הפקדה אתמול",
    inflow: 5200,
    outflow: 0,
    is_direct: false,
  },
  {
    id: "demo-cf-2",
    entry_date: "2026-05-09",
    description: "משלוח לקוח מוסדי — חשבונית מס 9044",
    inflow: 8760,
    outflow: 0,
    is_direct: false,
  },
  {
    id: "demo-cf-3",
    entry_date: "2026-05-09",
    description: "דוח Z קופה — סיכום יום קודם (מזומן + אשראי)",
    inflow: 13240,
    outflow: 0,
    is_direct: false,
  },
  {
    id: "demo-cf-4",
    entry_date: "2026-05-09",
    description: "תשלום ספק חלב וחמאה — העברה בנקאית",
    inflow: 0,
    outflow: 6890,
    is_direct: false,
  },
  {
    id: "demo-cf-5",
    entry_date: "2026-05-09",
    description: "שירות שילוח דחופים — כרטיס אשראי עסקי",
    inflow: 0,
    outflow: 1240,
    is_direct: false,
  },
  {
    id: "demo-cf-6",
    entry_date: "2026-05-09",
    description: "קיזוז פיקדון מגשים — החזר ללקוח אירוע",
    inflow: 0,
    outflow: 900,
    is_direct: false,
  },
  {
    id: "demo-cf-7",
    entry_date: "2026-05-09",
    description: "קבלת תשלום זיכוי מספק אריזות",
    inflow: 630,
    outflow: 0,
    is_direct: false,
  },
];

function fallbackLedgerForEntity(entityId: string): LedgerMovementView[] {
  const entity = FALLBACK_ENTITIES.find((e) => e.id === entityId);
  if (!entity) return [];

  const lines: Record<EntityType, Omit<LedgerMovementView, "id" | "entity_id" | "entity_name" | "entity_type">[]> = {
    supplier: [
      { entry_date: "2026-05-01", doc_type: "חשבונית רכש", description: "ספק קמח מרכזי — אספקה שבועית", debit: 4100, credit: 0 },
      { entry_date: "2026-05-03", doc_type: "תשלום", description: "העברה בנקאית לספק", debit: 0, credit: 8200 },
      { entry_date: "2026-05-05", doc_type: "חשבונית רכש", description: "חומרי אריזה חד פעמי", debit: 1290.75, credit: 0 },
      { entry_date: "2026-05-07", doc_type: "זיכוי", description: "החזרת סחורה פגומה", debit: 0, credit: 410 },
      { entry_date: "2026-05-09", doc_type: "חשבונית רכש", description: "שמנת וחמאה לייצור", debit: 2680, credit: 0 },
    ],
    customer: [
      { entry_date: "2026-05-02", doc_type: "חשבונית מס", description: "משלוח קונדיטוריה — רשת דרום", debit: 0, credit: 5400 },
      { entry_date: "2026-05-04", doc_type: "קבלה", description: "תשלום מזומן — חשבונית 9921", debit: 3200, credit: 0 },
      { entry_date: "2026-05-06", doc_type: "חשבונית זיכוי", description: "ביטול פריטים באירוע", debit: 890, credit: 0 },
      { entry_date: "2026-05-08", doc_type: "הזמנת אירוע", description: "פיקדון מגשים — גן אירועים שמשון", debit: 0, credit: 1800 },
      { entry_date: "2026-05-09", doc_type: "קבלה", description: "סגירת יתרה — העברה בנקאית", debit: 4500, credit: 0 },
    ],
    employee: [
      { entry_date: "2026-05-01", doc_type: "משכורת", description: "שכר בסיס — עובד ייצור א׳", debit: 6200, credit: 0 },
      { entry_date: "2026-05-01", doc_type: "שווי הטבות", description: "ארוחות במפעל", debit: 420, credit: 0 },
      { entry_date: "2026-05-05", doc_type: "מקדמה", description: "מקדמה על חשבון שכר", debit: 0, credit: 1500 },
      { entry_date: "2026-05-09", doc_type: "נסיעות", description: "החזר נסיעות שבועי", debit: 380, credit: 0 },
    ],
  };

  return lines[entity.entity_type].map((row, i) => ({
    id: `${entityId}-fb-${i}`,
    entity_id: entity.id,
    entity_name: entity.name,
    entity_type: entity.entity_type,
    ...row,
  }));
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function fetchEntitiesByType(entityType: EntityType): Promise<FinanceEntityRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return FALLBACK_ENTITIES.filter((e) => e.entity_type === entityType);

  const { data, error } = await supabase
    .from("finance_entities")
    .select("id, entity_type, name, opening_balance")
    .eq("entity_type", entityType)
    .order("name");

  if (error || !data?.length) {
    return FALLBACK_ENTITIES.filter((e) => e.entity_type === entityType);
  }

  return data.map((row) => ({
    id: row.id as string,
    entity_type: row.entity_type as EntityType,
    name: row.name as string,
    opening_balance: num(row.opening_balance),
  }));
}

export async function fetchLedgerForFilters(params: {
  entityId: string;
  dateFrom: string | null;
  dateTo: string | null;
}): Promise<{ opening: number; movements: LedgerMovementView[]; entityName: string }> {
  const supabase = getSupabaseBrowserClient();
  const fallbackEntity = FALLBACK_ENTITIES.find((e) => e.id === params.entityId) ?? FALLBACK_ENTITIES[0];

  if (!supabase) {
    let movements = fallbackLedgerForEntity(params.entityId);
    if (params.dateFrom) movements = movements.filter((m) => m.entry_date >= params.dateFrom!);
    if (params.dateTo) movements = movements.filter((m) => m.entry_date <= params.dateTo!);
    return { opening: fallbackEntity.opening_balance, movements, entityName: fallbackEntity.name };
  }

  const { data: entityRow, error: entErr } = await supabase
    .from("finance_entities")
    .select("id, name, opening_balance, entity_type")
    .eq("id", params.entityId)
    .maybeSingle();

  if (entErr || !entityRow) {
    return { opening: fallbackEntity.opening_balance, movements: [], entityName: fallbackEntity.name };
  }

  let q = supabase
    .from("ledger_entries")
    .select("id, entity_id, entry_date, doc_type, description, debit, credit")
    .eq("entity_id", params.entityId)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (params.dateFrom) q = q.gte("entry_date", params.dateFrom);
  if (params.dateTo) q = q.lte("entry_date", params.dateTo);

  const { data: rows, error } = await q;
  if (error || !rows) {
    return {
      opening: num(entityRow.opening_balance),
      movements: [],
      entityName: entityRow.name as string,
    };
  }

  const movements: LedgerMovementView[] = rows.map((row) => ({
    id: row.id as string,
    entity_id: row.entity_id as string,
    entry_date: row.entry_date as string,
    doc_type: (row.doc_type as string) ?? "",
    description: (row.description as string) ?? "",
    debit: num(row.debit),
    credit: num(row.credit),
    entity_name: entityRow.name as string,
    entity_type: entityRow.entity_type as EntityType,
  }));

  return {
    opening: num(entityRow.opening_balance),
    movements,
    entityName: entityRow.name as string,
  };
}

export async function fetchCashOpeningBalance(): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return FALLBACK_CASH_OPENING;

  const { data, error } = await supabase.from("finance_settings").select("value_numeric").eq("key", "cash_opening_balance").maybeSingle();

  if (error || data?.value_numeric == null) return FALLBACK_CASH_OPENING;
  return num(data.value_numeric);
}

export async function fetchCashFlowEntries(): Promise<CashFlowRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return FALLBACK_CASH_FLOW;

  const { data, error } = await supabase
    .from("cash_flow_entries")
    .select("id, entry_date, description, inflow, outflow, is_direct")
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return FALLBACK_CASH_FLOW;
  if (!data?.length) return [];

  return data.map((row) => ({
    id: row.id as string,
    entry_date: row.entry_date as string,
    description: (row.description as string) ?? "",
    inflow: num(row.inflow),
    outflow: num(row.outflow),
    is_direct: Boolean(row.is_direct),
  }));
}

export async function updateCashFlowEntry(
  id: string,
  patch: Partial<Pick<CashFlowRow, "entry_date" | "inflow" | "outflow" | "description">>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  let inflow = patch.inflow;
  let outflow = patch.outflow;
  if (inflow !== undefined && outflow !== undefined) {
    if (inflow > 0 && outflow > 0) return { ok: false, error: "נא להזין כניסה או יציאה, לא את שניהם." };
  }
  if (inflow !== undefined && inflow > 0) outflow = 0;
  if (outflow !== undefined && outflow > 0) inflow = 0;

  const updatePayload: Record<string, string | number> = {};
  if (patch.entry_date !== undefined) updatePayload.entry_date = patch.entry_date;
  if (patch.description !== undefined) updatePayload.description = patch.description;
  if (inflow !== undefined) updatePayload.inflow = inflow;
  if (outflow !== undefined) updatePayload.outflow = outflow;

  const { error } = await supabase.from("cash_flow_entries").update(updatePayload).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function insertDirectCashFlow(params: {
  entry_date: string;
  description: string;
  side: "debit" | "credit";
  amount: number;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const amt = Math.abs(params.amount);
  const inflow = params.side === "credit" ? amt : 0;
  const outflow = params.side === "debit" ? amt : 0;

  const { error } = await supabase.from("cash_flow_entries").insert({
    entry_date: params.entry_date,
    description: params.description.trim() || "רישום ישירות",
    inflow,
    outflow,
    is_direct: true,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const FALLBACK_FINANCE_DOCS: FinanceDocumentRow[] = [
  {
    id: "demo-arch-1",
    title: "חשבונית מס 9044",
    category: "הכנסה",
    doc_date: "2026-05-09",
    pdf_storage_path: "",
    sent_to_cpa: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-arch-2",
    title: "קבלה 3017",
    category: "הכנסה",
    doc_date: "2026-05-08",
    pdf_storage_path: "",
    sent_to_cpa: false,
    created_at: new Date().toISOString(),
  },
];

export async function fetchFinanceDocuments(): Promise<FinanceDocumentRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return FALLBACK_FINANCE_DOCS;

  const { data, error } = await supabase
    .from("finance_documents")
    .select("id, title, category, doc_date, pdf_storage_path, sent_to_cpa, created_at")
    .order("created_at", { ascending: false });

  if (error) return FALLBACK_FINANCE_DOCS;
  if (!data?.length) return [];

  return data.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    category: (row.category as string) ?? "",
    doc_date: (row.doc_date as string) ?? null,
    pdf_storage_path: row.pdf_storage_path as string,
    sent_to_cpa: Boolean(row.sent_to_cpa),
    created_at: row.created_at as string,
  }));
}

export async function updateFinanceDocument(
  id: string,
  patch: Partial<Pick<FinanceDocumentRow, "title" | "category" | "doc_date" | "sent_to_cpa">>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const { error } = await supabase.from("finance_documents").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteFinanceDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const { data: row } = await supabase.from("finance_documents").select("pdf_storage_path").eq("id", id).maybeSingle();
  if (row?.pdf_storage_path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([row.pdf_storage_path as string]);
  }

  const { error } = await supabase.from("finance_documents").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function getPdfPublicUrl(storagePath: string): string | null {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function uploadFinancePdfAndInsert(params: {
  blob: Blob;
  title: string;
  category: string;
  docDate: string | null;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const id = crypto.randomUUID();
  const path = `${id}.pdf`;

  const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, params.blob, {
    contentType: "application/pdf",
    upsert: false,
  });

  if (upErr) return { ok: false, error: upErr.message };

  const { error: insErr } = await supabase.from("finance_documents").insert({
    id,
    title: params.title,
    category: params.category,
    doc_date: params.docDate,
    pdf_storage_path: path,
    sent_to_cpa: false,
  });

  if (insErr) {
    await supabase.storage.from(STORAGE_BUCKET).remove([path]);
    return { ok: false, error: insErr.message };
  }

  return { ok: true, id };
}

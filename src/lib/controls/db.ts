import type {
  ReconCandidateOrderDto,
  ReconImportDetailDto,
  ReconImportDto,
} from "@/lib/controls/reconciliation-types";

const BASE = "/api/controls/reconciliation";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string } | null;
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "שגיאה בשרת");
  }
  return data.data as T;
}

export async function fetchReconImports(): Promise<ReconImportDto[]> {
  const res = await fetch(BASE, { credentials: "same-origin", cache: "no-store" });
  return jsonOrThrow<ReconImportDto[]>(res);
}

export async function importReconFile(input: {
  country: string;
  weekCode: string;
  file: File;
}): Promise<{ id: string }> {
  const fd = new FormData();
  fd.append("country", input.country);
  fd.append("weekCode", input.weekCode);
  fd.append("file", input.file);
  const res = await fetch(`${BASE}/import`, {
    method: "POST",
    body: fd,
    credentials: "same-origin",
  });
  return jsonOrThrow<{ id: string }>(res);
}

export async function fetchReconDetail(id: string): Promise<ReconImportDetailDto> {
  const res = await fetch(`${BASE}/${id}`, { credentials: "same-origin", cache: "no-store" });
  return jsonOrThrow<ReconImportDetailDto>(res);
}

export async function runReconMatch(id: string): Promise<ReconImportDetailDto> {
  const res = await fetch(`${BASE}/${id}/match`, {
    method: "POST",
    credentials: "same-origin",
  });
  return jsonOrThrow<ReconImportDetailDto>(res);
}

export async function assignReconRow(rowId: string, orderId: string): Promise<ReconImportDetailDto> {
  const res = await fetch(`${BASE}/rows/${rowId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
    credentials: "same-origin",
  });
  return jsonOrThrow<ReconImportDetailDto>(res);
}

export async function searchCandidateOrders(input: {
  q: string;
  country: string;
  weekCode: string;
}): Promise<ReconCandidateOrderDto[]> {
  const params = new URLSearchParams({ q: input.q, country: input.country, weekCode: input.weekCode });
  const res = await fetch(`${BASE}/candidates?${params.toString()}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  return jsonOrThrow<ReconCandidateOrderDto[]>(res);
}

export function reconExportUrl(id: string, kind: "pdf" | "xlsx"): string {
  return `${BASE}/${id}/${kind === "pdf" ? "pdf" : "export"}`;
}

export type TurkeyImportSummary = {
  totalRows: number;
  ordersCreated: number;
  ordersUpdated: number;
  customersCreated: number;
  skipped: number;
};

export async function seedTurkeyOrders(file: File): Promise<TurkeyImportSummary> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/seed-orders`, {
    method: "POST",
    body: fd,
    credentials: "same-origin",
  });
  return jsonOrThrow<TurkeyImportSummary>(res);
}

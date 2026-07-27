"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import type { CountSessionListItem } from "@/lib/inventory/count-session-service";
import { COUNT_SESSION_VOID } from "@/lib/inventory/count-session-status";

type Props = {
  open: boolean;
  shelfName: string;
  locationId?: string | null;
  /** ביטול/שחזור סבב ספירה — SUPER_ADMIN ו־ADMIN בלבד */
  canVoid?: boolean;
  onClose: () => void;
  onOpenSession: (sessionId: string) => void;
  /** נקרא אחרי ביטול או שחזור, כדי לרענן KPI ומסכים שנשענים על הספירה האחרונה */
  onVoidChanged?: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
};

async function downloadExport(sessionId: string, format: "pdf" | "xlsx") {
  const res = await fetch(
    `/api/inventory/count-sessions/${encodeURIComponent(sessionId)}/export?format=${format}`,
    { credentials: "same-origin" },
  );
  if (!res.ok) throw new Error("export failed");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download =
    res.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''(.+)/)?.[1] ??
    `count.${format}`;
  try {
    a.download = decodeURIComponent(a.download);
  } catch {
    /* keep */
  }
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ShelfHistoryModal({
  open,
  shelfName,
  locationId,
  canVoid = false,
  onClose,
  onOpenSession,
  onVoidChanged,
  t,
  locale,
}: Props) {
  const [rows, setRows] = useState<CountSessionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<CountSessionListItem | null>(null);

  const load = useCallback(async () => {
    if (!shelfName && !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ take: "80" });
      if (locationId) params.set("locationId", locationId);
      if (shelfName) params.set("location", shelfName);
      const res = await fetch(`/api/inventory/count-sessions?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; data?: CountSessionListItem[]; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? t("loadFailed"));
        setRows([]);
        return;
      }
      setRows(j.data ?? []);
    } catch {
      setRows([]);
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [locationId, shelfName, t]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  if (!open) return null;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const statusLabel = (status: string) => {
    if (status === COUNT_SESSION_VOID) return t("statusVoid");
    if (status === "COMPLETED") return t("statusCompleted");
    return status;
  };

  const doExport = async (sessionId: string, format: "pdf" | "xlsx") => {
    setExportingId(`${sessionId}-${format}`);
    try {
      await downloadExport(sessionId, format);
    } catch {
      setError(t("exportFailed"));
    } finally {
      setExportingId(null);
    }
  };

  const toggleVoid = async (row: CountSessionListItem) => {
    const isVoided = row.status === COUNT_SESSION_VOID;
    setVoidingId(row.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/inventory/count-sessions/${encodeURIComponent(row.id)}/void`,
        {
          method: isVoided ? "DELETE" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: isVoided ? undefined : JSON.stringify({}),
        },
      );
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? t("voidFailed"));
        return;
      }
      await load();
      onVoidChanged?.();
    } catch {
      setError(t("voidFailed"));
    } finally {
      setVoidingId(null);
      setConfirmVoid(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[20px] border border-[#e7ecf5] bg-white shadow-2xl"
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#6c4cff]" />
            <div>
              <h3 className="text-lg font-black text-slate-900">{t("title")}</h3>
              <p className="text-xs font-semibold text-slate-500">{shelfName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#6c4cff]" />
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm font-semibold text-rose-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-500">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-black text-slate-500">
                    <th className="px-2 py-2">{t("colNumber")}</th>
                    <th className="px-2 py-2">{t("colDate")}</th>
                    <th className="px-2 py-2">{t("colTime")}</th>
                    <th className="px-2 py-2">{t("colBy")}</th>
                    <th className="px-2 py-2">{t("colProducts")}</th>
                    <th className="px-2 py-2">{t("colShortage")}</th>
                    <th className="px-2 py-2">{t("colSurplus")}</th>
                    <th className="px-2 py-2">{t("colStatus")}</th>
                    <th className="px-2 py-2">{t("colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const isVoided = r.status === COUNT_SESSION_VOID;
                    return (
                    <tr
                      key={r.id}
                      className={`text-xs font-semibold ${isVoided ? "text-slate-400" : "text-slate-800"}`}
                    >
                      <td
                        className={`px-2 py-2.5 font-black ${isVoided ? "text-slate-400 line-through" : "text-[#6c4cff]"}`}
                      >
                        #{r.sessionNumber}
                      </td>
                      <td className="px-2 py-2.5">{fmtDate(r.createdAt)}</td>
                      <td className="px-2 py-2.5">{fmtTime(r.createdAt)}</td>
                      <td className="max-w-[8rem] truncate px-2 py-2.5">
                        {r.countedByName ?? "—"}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">{r.productCount}</td>
                      <td
                        className={`px-2 py-2.5 tabular-nums ${isVoided ? "" : "text-rose-600"}`}
                      >
                        {r.shortageCount}
                      </td>
                      <td
                        className={`px-2 py-2.5 tabular-nums ${isVoided ? "" : "text-amber-600"}`}
                      >
                        {r.surplusCount}
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${
                            isVoided
                              ? "bg-slate-100 text-slate-600 ring-slate-300"
                              : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          }`}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenSession(r.id)}
                            className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#e7ecf5] bg-white px-2 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                            title={t("view")}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {t("view")}
                          </button>
                          <button
                            type="button"
                            disabled={exportingId === `${r.id}-pdf`}
                            onClick={() => void doExport(r.id, "pdf")}
                            className="grid h-9 w-9 place-items-center rounded-xl border border-[#e7ecf5] bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            title="PDF"
                          >
                            {exportingId === `${r.id}-pdf` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileText className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={exportingId === `${r.id}-xlsx`}
                            onClick={() => void doExport(r.id, "xlsx")}
                            className="grid h-9 w-9 place-items-center rounded-xl border border-[#e7ecf5] bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            title="Excel"
                          >
                            {exportingId === `${r.id}-xlsx` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {canVoid ? (
                            <button
                              type="button"
                              disabled={voidingId === r.id}
                              onClick={() =>
                                isVoided ? void toggleVoid(r) : setConfirmVoid(r)
                              }
                              className={`grid h-9 w-9 place-items-center rounded-xl border bg-white disabled:opacity-50 ${
                                isVoided
                                  ? "border-[#e7ecf5] text-slate-600 hover:bg-slate-50"
                                  : "border-rose-200 text-rose-600 hover:bg-rose-50"
                              }`}
                              title={isVoided ? t("restore") : t("void")}
                            >
                              {voidingId === r.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : isVoided ? (
                                <RotateCcw className="h-3.5 w-3.5" />
                              ) : (
                                <Ban className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[11px] font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Download className="h-3.5 w-3.5" />
            {t("exportHint")}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700"
          >
            {t("close")}
          </button>
        </div>
      </div>

      {confirmVoid ? (
        <div className="fixed inset-0 z-[205] flex items-center justify-center bg-slate-900/50 p-4">
          <div
            className="w-full max-w-md rounded-[20px] border border-[#e7ecf5] bg-white p-5 shadow-2xl"
            dir="rtl"
          >
            <h4 className="text-base font-black text-slate-900">{t("voidConfirmTitle")}</h4>
            <p className="mt-1 text-sm font-black text-[#6c4cff]">
              #{confirmVoid.sessionNumber} · {fmtDate(confirmVoid.createdAt)}{" "}
              {fmtTime(confirmVoid.createdAt)}
            </p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
              {t("voidConfirmBody")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmVoid(null)}
                className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                {t("voidCancel")}
              </button>
              <button
                type="button"
                disabled={voidingId === confirmVoid.id}
                onClick={() => void toggleVoid(confirmVoid)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {voidingId === confirmVoid.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                {t("voidConfirmCta")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

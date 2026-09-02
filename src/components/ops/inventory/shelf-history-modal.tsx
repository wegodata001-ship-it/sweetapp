"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarDays,
  ChevronLeft,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import type {
  CountSessionDetail,
  CountSessionListItem,
  CountSessionProductLine,
  DailyLocationHistoryRow,
} from "@/lib/inventory/count-session-service";
import type { ProductTimelineItem } from "@/lib/inventory/count-product-timeline";
import { COUNT_SESSION_VOID } from "@/lib/inventory/count-session-status";
import {
  formatIsraelDateTime,
  type QuickRangeKey,
} from "@/lib/inventory/count-history-audit";

type LocationOpt = { id: string; name: string };

type Props = {
  open: boolean;
  shelfName: string;
  locationId?: string | null;
  /** מנהל — יכול לבחור «כל המלאי» */
  allowAllLocations?: boolean;
  locations?: LocationOpt[];
  canVoid?: boolean;
  onClose: () => void;
  onOpenSession: (sessionId: string, meta?: { locationId: string | null; locationName: string }) => void;
  onVoidChanged?: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
};

type ViewMode = "sessions" | "daily";
type Drill =
  | { kind: "list" }
  | { kind: "session"; sessionId: string }
  | {
      kind: "product";
      sessionId: string;
      line: CountSessionProductLine;
      locationId: string | null;
      locationName: string;
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

function fmtDiff(n: number): string {
  if (Math.abs(n) < 1e-9) return "0";
  return n > 0 ? `+${n}` : String(n);
}

function diffClass(n: number): string {
  if (Math.abs(n) < 1e-9) return "text-slate-700";
  if (n > 0) return "text-emerald-700";
  return "text-rose-700";
}

export function ShelfHistoryModal({
  open,
  shelfName,
  locationId,
  allowAllLocations = false,
  locations = [],
  canVoid = false,
  onClose,
  onOpenSession,
  onVoidChanged,
  t,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("sessions");
  const [range, setRange] = useState<QuickRangeKey>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterLocationId, setFilterLocationId] = useState<string>("");
  const [allLocations, setAllLocations] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [rows, setRows] = useState<CountSessionListItem[]>([]);
  const [daily, setDaily] = useState<DailyLocationHistoryRow[]>([]);
  const [nextCursor, setNextCursor] = useState<{ createdAt: string; id: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<CountSessionListItem | null>(null);
  const [drill, setDrill] = useState<Drill>({ kind: "list" });
  const [sessionDetail, setSessionDetail] = useState<CountSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timeline, setTimeline] = useState<ProductTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [showAuditIds, setShowAuditIds] = useState(false);

  // אתחול פילטר מיקום בפתיחה
  useEffect(() => {
    if (!open) return;
    setDrill({ kind: "list" });
    setRange("7d");
    setProductSearch("");
    setStatusFilter("");
    setError(null);
    if (locationId) {
      setFilterLocationId(locationId);
      setAllLocations(false);
    } else if (allowAllLocations) {
      setFilterLocationId("");
      setAllLocations(true);
    } else {
      setFilterLocationId("");
      setAllLocations(false);
    }
  }, [open, locationId, allowAllLocations]);

  const effectiveLocationId = allLocations ? null : filterLocationId || locationId || null;
  const canQuery = Boolean(effectiveLocationId || (allLocations && allowAllLocations));

  const buildSessionParams = useCallback(
    (cursor?: { createdAt: string; id: string } | null) => {
      const params = new URLSearchParams({ take: "40", range });
      if (range === "custom") {
        if (customFrom) params.set("dateFrom", customFrom);
        if (customTo) params.set("dateTo", customTo);
      }
      if (allLocations && allowAllLocations) params.set("allLocations", "1");
      else if (effectiveLocationId) params.set("locationId", effectiveLocationId);
      else if (shelfName) params.set("location", shelfName);
      if (productSearch.trim()) params.set("productSearch", productSearch.trim());
      if (employeeSearch.trim()) params.set("countedBySearch", employeeSearch.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (cursor) {
        params.set("cursorCreatedAt", cursor.createdAt);
        params.set("cursorId", cursor.id);
      }
      return params;
    },
    [
      range,
      customFrom,
      customTo,
      allLocations,
      allowAllLocations,
      effectiveLocationId,
      shelfName,
      productSearch,
      employeeSearch,
      statusFilter,
    ],
  );

  const loadSessions = useCallback(
    async (append = false, cursor?: { createdAt: string; id: string } | null) => {
      if (!canQuery) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = buildSessionParams(append ? cursor ?? null : null);
        const res = await fetch(`/api/inventory/count-sessions?${params}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const j = (await res.json()) as {
          ok?: boolean;
          data?: CountSessionListItem[];
          nextCursor?: { createdAt: string; id: string } | null;
          error?: string;
        };
        if (!res.ok || !j.ok) {
          setError(j.error ?? t("loadFailed"));
          if (!append) setRows([]);
          return;
        }
        setRows((prev) => (append ? [...prev, ...(j.data ?? [])] : (j.data ?? [])));
        setNextCursor(j.nextCursor ?? null);
      } catch {
        setError(t("loadFailed"));
        if (!append) setRows([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [canQuery, buildSessionParams, t],
  );

  const loadDaily = useCallback(async () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range });
      if (range === "custom") {
        if (customFrom) params.set("dateFrom", customFrom);
        if (customTo) params.set("dateTo", customTo);
      }
      if (allLocations && allowAllLocations) params.set("allLocations", "1");
      else if (effectiveLocationId) params.set("locationId", effectiveLocationId);
      const res = await fetch(`/api/inventory/count-sessions/daily?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        data?: DailyLocationHistoryRow[];
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? t("loadFailed"));
        setDaily([]);
        return;
      }
      setDaily(j.data ?? []);
    } catch {
      setError(t("loadFailed"));
      setDaily([]);
    } finally {
      setLoading(false);
    }
  }, [
    canQuery,
    range,
    customFrom,
    customTo,
    allLocations,
    allowAllLocations,
    effectiveLocationId,
    t,
  ]);

  useEffect(() => {
    if (!open) return;
    if (viewMode === "sessions" && drill.kind === "list") void loadSessions(false);
    if (viewMode === "daily" && drill.kind === "list") void loadDaily();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on filter change only
  }, [open, viewMode, range, customFrom, customTo, allLocations, filterLocationId, statusFilter, productSearch, employeeSearch, drill.kind]);

  const loadSessionDetail = useCallback(
    async (sessionId: string) => {
      setDetailLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/inventory/count-sessions/${encodeURIComponent(sessionId)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const j = (await res.json()) as {
          ok?: boolean;
          data?: CountSessionDetail;
          error?: string;
        };
        if (!res.ok || !j.ok || !j.data) {
          setError(j.error ?? t("loadFailed"));
          setSessionDetail(null);
          return;
        }
        setSessionDetail(j.data);
      } catch {
        setError(t("loadFailed"));
        setSessionDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!open) return;
    if (drill.kind === "session" || drill.kind === "product") {
      void loadSessionDetail(drill.sessionId);
    }
  }, [open, drill, loadSessionDetail]);

  const loadTimeline = useCallback(
    async (productId: string, locId: string | null) => {
      setTimelineLoading(true);
      try {
        const params = new URLSearchParams({
          mode: "timeline",
          productId,
          take: "60",
        });
        if (locId) params.set("locationId", locId);
        const res = await fetch(`/api/inventory/count-history?${params}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const j = (await res.json()) as { ok?: boolean; data?: ProductTimelineItem[] };
        setTimeline(j.ok ? (j.data ?? []) : []);
      } catch {
        setTimeline([]);
      } finally {
        setTimelineLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (drill.kind !== "product") return;
    void loadTimeline(drill.line.inventoryProductId, drill.locationId);
  }, [drill, loadTimeline]);

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
      await loadSessions(false);
      onVoidChanged?.();
    } catch {
      setError(t("voidFailed"));
    } finally {
      setVoidingId(null);
      setConfirmVoid(null);
    }
  };

  const titleShelf = useMemo(() => {
    if (allLocations) return t("allInventory");
    if (filterLocationId) {
      return locations.find((l) => l.id === filterLocationId)?.name ?? shelfName;
    }
    return shelfName;
  }, [allLocations, filterLocationId, locations, shelfName, t]);

  if (!open) return null;

  const statusLabel = (status: string) => {
    if (status === COUNT_SESSION_VOID) return t("statusVoid");
    if (status === "COMPLETED") return t("statusCompleted");
    return status;
  };

  const coverageLabel = (s: DailyLocationHistoryRow["coverageStatus"]) => {
    if (s === "completed") return t("coverageCompleted");
    if (s === "partial") return t("coveragePartial");
    return t("coverageNotStarted");
  };

  const rangeChips: { key: QuickRangeKey; label: string }[] = [
    { key: "today", label: t("chipToday") },
    { key: "yesterday", label: t("chipYesterday") },
    { key: "7d", label: t("chip7d") },
    { key: "30d", label: t("chip30d") },
    { key: "month", label: t("chipMonth") },
    { key: "custom", label: t("chipCustom") },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-stretch justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="flex h-[100dvh] w-full max-w-3xl flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-[20px] sm:border sm:border-[#e7ecf5]"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            {drill.kind !== "list" ? (
              <button
                type="button"
                onClick={() => {
                  if (drill.kind === "product") {
                    setDrill({ kind: "session", sessionId: drill.sessionId });
                    setShowAuditIds(false);
                  } else {
                    setDrill({ kind: "list" });
                    setSessionDetail(null);
                  }
                }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl hover:bg-slate-100"
                aria-label={t("back")}
              >
                <ChevronLeft className="h-5 w-5 rotate-180" />
              </button>
            ) : (
              <History className="h-5 w-5 shrink-0 text-[#6c4cff]" />
            )}
            <div className="min-w-0">
              <h3 className="truncate text-base font-black text-slate-900 sm:text-lg">
                {drill.kind === "product"
                  ? drill.line.name
                  : drill.kind === "session"
                    ? t("sessionDetailTitle")
                    : t("title")}
              </h3>
              <p className="truncate text-[11px] font-semibold text-slate-500 sm:text-xs">
                {drill.kind === "product"
                  ? drill.locationName
                  : drill.kind === "session" && sessionDetail
                    ? sessionDetail.locationName
                    : titleShelf}
              </p>
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

        {/* Filters — list only */}
        {drill.kind === "list" ? (
          <div className="space-y-2 border-b border-slate-100 px-4 py-3">
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {rangeChips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setRange(c.key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black ring-1 ${
                    range === c.key
                      ? "bg-[#6c4cff] text-white ring-[#6c4cff]"
                      : "bg-white text-slate-600 ring-slate-200"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {range === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="min-h-10 rounded-xl border border-slate-200 px-2 text-xs font-semibold"
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="min-h-10 rounded-xl border border-slate-200 px-2 text-xs font-semibold"
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {allowAllLocations || locations.length > 0 ? (
                <select
                  value={allLocations ? "__all__" : filterLocationId || locationId || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__all__") {
                      setAllLocations(true);
                      setFilterLocationId("");
                    } else {
                      setAllLocations(false);
                      setFilterLocationId(v);
                    }
                  }}
                  className="min-h-10 rounded-xl border border-slate-200 px-2 text-xs font-semibold"
                >
                  {allowAllLocations ? (
                    <option value="__all__">{t("allInventory")}</option>
                  ) : null}
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                  {!locations.some((l) => l.id === (locationId || "")) && locationId ? (
                    <option value={locationId}>{shelfName}</option>
                  ) : null}
                </select>
              ) : null}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-h-10 rounded-xl border border-slate-200 px-2 text-xs font-semibold"
              >
                <option value="">{t("statusAll")}</option>
                <option value="COMPLETED">{t("statusCompleted")}</option>
                <option value={COUNT_SESSION_VOID}>{t("statusVoid")}</option>
              </select>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder={t("searchProduct")}
                className="min-h-10 w-full rounded-xl border border-slate-200 pe-3 ps-9 text-xs font-semibold"
              />
            </div>
            <input
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder={t("searchEmployee")}
              className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-semibold"
            />

            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setViewMode("sessions")}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-black ring-1 ${
                  viewMode === "sessions"
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-white text-slate-600 ring-slate-200"
                }`}
              >
                {t("tabSessions")}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("daily")}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-black ring-1 ${
                  viewMode === "daily"
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-white text-slate-600 ring-slate-200"
                }`}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {t("tabDaily")}
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {loading || detailLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#6c4cff]" />
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm font-semibold text-rose-600">{error}</p>
          ) : drill.kind === "list" && viewMode === "sessions" ? (
            rows.length === 0 ? (
              <p className="py-8 text-center text-sm font-semibold text-slate-500">{t("empty")}</p>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => {
                  const { date, time } = formatIsraelDateTime(r.createdAt);
                  const isVoided = r.status === COUNT_SESSION_VOID;
                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl border p-3 ${
                        isVoided
                          ? "border-slate-200 bg-slate-50 opacity-80"
                          : "border-[#e7ecf5] bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setDrill({ kind: "session", sessionId: r.id })}
                        className="w-full text-start"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900">
                              {date} · {time}
                            </p>
                            <p className="mt-0.5 truncate text-xs font-bold text-slate-600">
                              {r.locationName}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${
                              isVoided
                                ? "bg-slate-100 text-slate-600 ring-slate-300"
                                : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            }`}
                          >
                            {statusLabel(r.status)}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] font-semibold text-slate-600 sm:grid-cols-4">
                          <span>
                            {t("countedProducts", { n: r.productCount })}
                          </span>
                          <span>
                            {t("performedBy")}: {r.countedByName ?? "—"}
                          </span>
                          <span className="text-amber-700">
                            {t("changesCount", { n: r.changedCount })}
                          </span>
                          <span>
                            {t("unchangedCount", { n: r.unchangedCount })}
                          </span>
                        </div>
                        {r.positiveToZeroCount > 0 ? (
                          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {t("zeroDropCount", { n: r.positiveToZeroCount })}
                          </p>
                        ) : null}
                      </button>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenSession(r.id, {
                              locationId: r.locationId,
                              locationName: r.locationName,
                            })
                          }
                          className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#e7ecf5] bg-white px-2 text-[11px] font-black text-slate-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {t("openInCount")}
                        </button>
                        <button
                          type="button"
                          disabled={exportingId === `${r.id}-pdf`}
                          onClick={() => void doExport(r.id, "pdf")}
                          className="grid h-9 w-9 place-items-center rounded-xl border border-[#e7ecf5]"
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
                          className="grid h-9 w-9 place-items-center rounded-xl border border-[#e7ecf5]"
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
                            className={`grid h-9 w-9 place-items-center rounded-xl border ${
                              isVoided
                                ? "border-slate-200 text-slate-600"
                                : "border-rose-200 text-rose-600"
                            }`}
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
                    </div>
                  );
                })}
                {nextCursor ? (
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadSessions(true, nextCursor)}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 text-sm font-black text-slate-700"
                  >
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t("loadMore")}
                  </button>
                ) : null}
              </div>
            )
          ) : drill.kind === "list" && viewMode === "daily" ? (
            daily.length === 0 ? (
              <p className="py-8 text-center text-sm font-semibold text-slate-500">{t("empty")}</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  daily.reduce<Record<string, DailyLocationHistoryRow[]>>((acc, row) => {
                    (acc[row.day] ??= []).push(row);
                    return acc;
                  }, {}),
                ).map(([day, items]) => (
                  <div key={day}>
                    <h4 className="mb-2 text-sm font-black text-slate-800">
                      {day.split("-").reverse().join("/")}
                    </h4>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={`${item.day}-${item.locationId ?? item.locationName}`}
                          className="rounded-2xl border border-[#e7ecf5] bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-black text-slate-900">
                                {item.locationName}
                              </p>
                              <p className="text-[11px] font-semibold text-slate-500">
                                {t("countedProducts", { n: item.productCount })}
                                {item.expectedProducts > 0
                                  ? ` / ${item.expectedProducts}`
                                  : ""}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-700">
                              {coverageLabel(item.coverageStatus)}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {item.sessions.map((s) => {
                              const { time } = formatIsraelDateTime(s.createdAt);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => setDrill({ kind: "session", sessionId: s.id })}
                                  className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-2 py-2 text-[11px] font-bold text-slate-700"
                                >
                                  <span>
                                    {time} · {s.countedByName ?? "—"} ·{" "}
                                    {t("countedProducts", { n: s.productCount })}
                                  </span>
                                  <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : drill.kind === "session" && sessionDetail ? (
            <SessionLinesView
              detail={sessionDetail}
              t={t}
              onOpenLine={(line) =>
                setDrill({
                  kind: "product",
                  sessionId: sessionDetail.id,
                  line,
                  locationId: sessionDetail.locationId,
                  locationName: sessionDetail.locationName,
                })
              }
            />
          ) : drill.kind === "product" && sessionDetail ? (
            <ProductDetailView
              line={drill.line}
              detail={sessionDetail}
              timeline={timeline}
              timelineLoading={timelineLoading}
              showAuditIds={showAuditIds}
              onToggleAuditIds={() => setShowAuditIds((v) => !v)}
              onOpenTimelineItem={(item) => {
                if (item.sessionId) {
                  setDrill({ kind: "session", sessionId: item.sessionId });
                }
              }}
              t={t}
            />
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full rounded-xl border border-slate-200 text-sm font-black text-slate-700 sm:w-auto sm:px-6"
          >
            {t("close")}
          </button>
        </div>
      </div>

      {confirmVoid ? (
        <div className="fixed inset-0 z-[205] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-[20px] border border-[#e7ecf5] bg-white p-5 shadow-2xl" dir="rtl">
            <h4 className="text-base font-black text-slate-900">{t("voidConfirmTitle")}</h4>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
              {t("voidConfirmBody")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmVoid(null)}
                className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-black"
              >
                {t("voidCancel")}
              </button>
              <button
                type="button"
                disabled={voidingId === confirmVoid.id}
                onClick={() => void toggleVoid(confirmVoid)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-black text-white"
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

function SessionLinesView({
  detail,
  t,
  onOpenLine,
}: {
  detail: CountSessionDetail;
  t: Props["t"];
  onOpenLine: (line: CountSessionProductLine) => void;
}) {
  const { date, time } = formatIsraelDateTime(detail.createdAt);
  const isVoided = detail.status === COUNT_SESSION_VOID;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">
        <p className="font-black text-slate-900">
          {date} · {time}
        </p>
        <p>
          {t("performedBy")}: {detail.countedByName ?? "—"}
        </p>
        {isVoided ? (
          <p className="mt-1 font-black text-slate-500">{t("statusVoid")}</p>
        ) : null}
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {detail.lines.map((line) => (
          <button
            key={line.id}
            type="button"
            onClick={() => onOpenLine(line)}
            className="w-full rounded-2xl border border-[#e7ecf5] bg-white p-3 text-start"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-black text-slate-900">{line.name}</p>
              {line.positiveToZero ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  {t("flagZero")}
                </span>
              ) : line.significantDrop ? (
                <span className="text-[10px] font-black text-amber-700">
                  {t("flagSignificant")}
                </span>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] font-bold">
              <div>
                <p className="text-slate-400">{t("colPrevious")}</p>
                <p className="tabular-nums text-slate-800">{line.previousQuantity}</p>
              </div>
              <div>
                <p className="text-slate-400">{t("colCurrent")}</p>
                <p className="tabular-nums text-slate-800">{line.currentQuantity}</p>
              </div>
              <div>
                <p className="text-slate-400">{t("colDiff")}</p>
                <p className={`tabular-nums ${diffClass(line.difference)}`}>
                  {fmtDiff(line.difference)}
                </p>
              </div>
            </div>
            {line.workers.length > 0 ? (
              <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-[11px] font-semibold text-slate-600">
                {line.workers.map((w) => (
                  <div key={w.inventoryLocationWorkerId} className="flex justify-between gap-2">
                    <span className="truncate">
                      {w.workerWorkArea || w.workerDisplayName}
                    </span>
                    <span className="tabular-nums">{w.countedQuantity}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-black text-slate-500">
              <th className="px-2 py-2 text-start">{t("colProduct")}</th>
              <th className="px-2 py-2 text-end">{t("colPrevious")}</th>
              <th className="px-2 py-2 text-end">{t("colCurrent")}</th>
              <th className="px-2 py-2 text-end">{t("colDiff")}</th>
              <th className="px-2 py-2 text-start">{t("colFlags")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detail.lines.map((line) => (
              <tr
                key={line.id}
                className="cursor-pointer text-xs font-semibold hover:bg-slate-50"
                onClick={() => onOpenLine(line)}
              >
                <td className="px-2 py-2.5 font-black text-slate-900">{line.name}</td>
                <td className="px-2 py-2.5 text-end tabular-nums">{line.previousQuantity}</td>
                <td className="px-2 py-2.5 text-end tabular-nums">{line.currentQuantity}</td>
                <td className={`px-2 py-2.5 text-end tabular-nums ${diffClass(line.difference)}`}>
                  {fmtDiff(line.difference)}
                </td>
                <td className="px-2 py-2.5 text-[10px] font-black text-amber-700">
                  {line.positiveToZero
                    ? t("flagZero")
                    : line.significantDrop
                      ? t("flagSignificant")
                      : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductDetailView({
  line,
  detail,
  timeline,
  timelineLoading,
  showAuditIds,
  onToggleAuditIds,
  onOpenTimelineItem,
  t,
}: {
  line: CountSessionProductLine;
  detail: CountSessionDetail;
  timeline: ProductTimelineItem[];
  timelineLoading: boolean;
  showAuditIds: boolean;
  onToggleAuditIds: () => void;
  onOpenTimelineItem: (item: ProductTimelineItem) => void;
  t: Props["t"];
}) {
  const { date, time } = formatIsraelDateTime(detail.createdAt);
  const shortage = Math.max(0, line.minimumQuantity - line.currentQuantity);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#e7ecf5] bg-white p-4">
        <dl className="space-y-2 text-sm font-semibold text-slate-700">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">{t("fieldLocation")}</dt>
            <dd className="font-black text-slate-900">{detail.locationName}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">{t("fieldWhen")}</dt>
            <dd className="font-black">
              {date} {time}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">{t("fieldPrevious")}</dt>
            <dd className="tabular-nums font-black">{line.previousQuantity}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">{t("fieldCurrent")}</dt>
            <dd className="tabular-nums font-black">{line.currentQuantity}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">{t("colDiff")}</dt>
            <dd className={`tabular-nums font-black ${diffClass(line.difference)}`}>
              {fmtDiff(line.difference)}
            </dd>
          </div>
        </dl>

        {line.workers.length > 0 ? (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-black text-slate-500">{t("workerPoints")}</p>
            <div className="space-y-1">
              {line.workers.map((w) => (
                <div
                  key={w.inventoryLocationWorkerId}
                  className="flex justify-between text-sm font-bold text-slate-800"
                >
                  <span>{w.workerWorkArea || w.workerDisplayName}</span>
                  <span className="tabular-nums">{w.countedQuantity}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between border-t border-dashed border-slate-200 pt-2 text-sm font-black">
              <span>{t("fieldTotal")}</span>
              <span className="tabular-nums">{line.currentQuantity}</span>
            </div>
          </div>
        ) : null}

        <div className="mt-3 space-y-1 text-xs font-semibold text-slate-600">
          <p>
            {t("fieldMinimum")}:{" "}
            <span className="font-black tabular-nums">{line.minimumQuantity}</span>
          </p>
          {shortage > 0 ? (
            <p className="text-rose-700">
              {t("fieldShortage")}: <span className="font-black tabular-nums">{shortage}</span>
            </p>
          ) : null}
          <p>
            {t("performedBy")}: {detail.countedByName ?? "—"}
          </p>
          {line.positiveToZero ? (
            <p className="inline-flex items-center gap-1 font-black text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("flagZero")}
            </p>
          ) : null}
          {line.significantDrop && !line.positiveToZero ? (
            <p className="font-black text-amber-700">{t("flagSignificant")}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onToggleAuditIds}
          className="mt-3 text-[11px] font-bold text-[#6c4cff] underline"
        >
          {showAuditIds ? t("hideAuditIds") : t("showAuditIds")}
        </button>
        {showAuditIds ? (
          <div className="mt-2 rounded-xl bg-slate-50 p-2 font-mono text-[10px] text-slate-600">
            <p>Session: {detail.id}</p>
            <p>Count: {line.id}</p>
          </div>
        ) : null}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-black text-slate-900">{t("productTimeline")}</h4>
        {timelineLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#6c4cff]" />
        ) : timeline.length === 0 ? (
          <p className="text-xs font-semibold text-slate-500">{t("timelineEmpty")}</p>
        ) : (
          <div className="space-y-1">
            {timeline.map((item) => {
              const { date: d } = formatIsraelDateTime(item.createdAt);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenTimelineItem(item)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-bold"
                >
                  <span className="text-slate-500">{d}</span>
                  <span className="inline-flex items-center gap-1 tabular-nums text-slate-900">
                    {item.currentQuantity}
                    {item.positiveToZero ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

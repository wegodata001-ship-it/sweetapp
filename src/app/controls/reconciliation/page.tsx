"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Link2,
  RefreshCw,
  Scale,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import {
  RECON_COUNTRY,
  RECON_STATUS,
  type ReconStatus,
} from "@/lib/controls/reconciliation-constants";
import {
  assignReconRow,
  fetchReconDetail,
  fetchReconImports,
  importReconFile,
  reconExportUrl,
  runReconMatch,
  searchCandidateOrders,
  seedTurkeyOrders,
} from "@/lib/controls/db";
import type {
  ReconCandidateOrderDto,
  ReconImportDetailDto,
  ReconImportDto,
  ReconRowDto,
} from "@/lib/controls/reconciliation-types";

function fmtAmount(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;
}

const STATUS_STYLES: Record<ReconStatus, string> = {
  MATCHED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  AMOUNT_DIFFERENCE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  MISSING_IN_WEGO: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  MISSING_IN_EXTERNAL: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  PENDING: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const ROW_TINT: Record<ReconStatus, string> = {
  MATCHED: "bg-emerald-500/[0.04]",
  AMOUNT_DIFFERENCE: "bg-amber-500/[0.05]",
  MISSING_IN_WEGO: "bg-rose-500/[0.05]",
  MISSING_IN_EXTERNAL: "bg-sky-500/[0.04]",
  PENDING: "",
};

export default function ReconciliationPage() {
  const { t } = useI18n();
  const { showToast } = useToast();

  const [imports, setImports] = useState<ReconImportDto[]>([]);
  const [detail, setDetail] = useState<ReconImportDetailDto | null>(null);
  const [view, setView] = useState<"list" | "detail">("list");
  const [loadingList, setLoadingList] = useState(true);

  const statusLabel = useCallback(
    (s: ReconStatus): string => {
      switch (s) {
        case RECON_STATUS.MATCHED:
          return t("reconciliation.statusMatched");
        case RECON_STATUS.AMOUNT_DIFFERENCE:
          return t("reconciliation.statusDifference");
        case RECON_STATUS.MISSING_IN_WEGO:
          return t("reconciliation.statusMissingWego");
        case RECON_STATUS.MISSING_IN_EXTERNAL:
          return t("reconciliation.statusMissingExternal");
        default:
          return t("reconciliation.statusPending");
      }
    },
    [t],
  );

  const countryLabel = useCallback(
    (c: string): string =>
      c === RECON_COUNTRY.TURKEY
        ? t("reconciliation.countryTurkey")
        : c === RECON_COUNTRY.CHINA
          ? t("reconciliation.countryChina")
          : c,
    [t],
  );

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      setImports(await fetchReconImports());
    } catch (e) {
      showToast({ tone: "error", title: e instanceof Error ? e.message : "שגיאה" });
    } finally {
      setLoadingList(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = useCallback(
    async (id: string) => {
      try {
        const d = await fetchReconDetail(id);
        setDetail(d);
        setView("detail");
      } catch (e) {
        showToast({ tone: "error", title: e instanceof Error ? e.message : "שגיאה" });
      }
    },
    [showToast],
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#c9a227]/40 bg-[linear-gradient(135deg,#c9a227,#e8d48a)] text-[#081224] shadow-[0_0_20px_rgba(201,162,39,0.4)]">
            <Scale className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-black text-white">{t("reconciliation.title")}</h1>
            <p className="text-sm text-slate-400">{t("reconciliation.subtitle")}</p>
          </div>
        </div>
        {view === "detail" ? (
          <button
            type="button"
            onClick={() => {
              setView("list");
              setDetail(null);
              void loadList();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]"
          >
            <ArrowRight className="h-4 w-4" />
            {t("reconciliation.backToList")}
          </button>
        ) : null}
      </header>

      {view === "list" ? (
        <ListView
          imports={imports}
          loading={loadingList}
          onImported={async (id) => {
            await loadList();
            await openDetail(id);
          }}
          onOpen={openDetail}
          countryLabel={countryLabel}
        />
      ) : detail ? (
        <DetailView
          detail={detail}
          onChange={setDetail}
          statusLabel={statusLabel}
          countryLabel={countryLabel}
        />
      ) : null}
    </div>
  );
}

function ListView({
  imports,
  loading,
  onImported,
  onOpen,
  countryLabel,
}: {
  imports: ReconImportDto[];
  loading: boolean;
  onImported: (id: string) => Promise<void> | void;
  onOpen: (id: string) => void;
  countryLabel: (c: string) => string;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [country, setCountry] = useState<string>(RECON_COUNTRY.TURKEY);
  const [weekCode, setWeekCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [seedBusy, setSeedBusy] = useState(false);
  const seedRef = useRef<HTMLInputElement>(null);

  const onSeedFile = async (f: File | null) => {
    if (!f) return;
    setSeedBusy(true);
    try {
      const s = await seedTurkeyOrders(f);
      showToast({
        tone: "success",
        title: t("reconciliation.seedDone"),
        description: t("reconciliation.seedSummary", {
          created: s.ordersCreated,
          updated: s.ordersUpdated,
          customers: s.customersCreated,
        }),
        durationMs: 7000,
      });
    } catch (e) {
      showToast({ tone: "error", title: e instanceof Error ? e.message : "שגיאה" });
    } finally {
      setSeedBusy(false);
      if (seedRef.current) seedRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!country || !weekCode.trim() || !file) {
      showToast({ tone: "warning", title: t("reconciliation.selectCountryWeekFile") });
      return;
    }
    setBusy(true);
    try {
      const { id } = await importReconFile({ country, weekCode: weekCode.trim(), file });
      showToast({ tone: "success", title: t("reconciliation.importSuccess") });
      setWeekCode("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await onImported(id);
    } catch (e) {
      showToast({ tone: "error", title: e instanceof Error ? e.message : "שגיאה" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-4 text-lg font-black text-white">{t("reconciliation.newImport")}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-400">
              {t("reconciliation.country")}
            </span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0b1426] px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-[#c9a227]/60"
            >
              <option value={RECON_COUNTRY.TURKEY}>{t("reconciliation.countryTurkey")}</option>
              <option value={RECON_COUNTRY.CHINA}>{t("reconciliation.countryChina")}</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-400">
              {t("reconciliation.weekCode")}
            </span>
            <input
              value={weekCode}
              onChange={(e) => setWeekCode(e.target.value)}
              placeholder={t("reconciliation.weekCodePlaceholder")}
              className="w-full rounded-xl border border-white/10 bg-[#0b1426] px-3 py-2.5 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#c9a227]/60"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-400">
              {t("reconciliation.excelFile")}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.1]"
              >
                <Upload className="h-4 w-4" />
                {t("reconciliation.chooseFile")}
              </button>
              <span className="truncate text-xs text-slate-400" title={file?.name}>
                {file?.name ?? t("reconciliation.noFile")}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </div>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#c9a227,#e8d48a)] px-4 py-2.5 text-sm font-black text-[#081224] shadow-[0_0_18px_rgba(201,162,39,0.3)] transition hover:brightness-105 disabled:opacity-60"
            >
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {busy ? t("reconciliation.importing") : t("reconciliation.import")}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{t("reconciliation.importHint")}</p>
      </section>

      <section className="rounded-2xl border border-sky-500/25 bg-sky-500/[0.05] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black text-white">{t("reconciliation.seedTitle")}</h2>
              <p className="text-xs text-slate-400">{t("reconciliation.seedHint")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => seedRef.current?.click()}
            disabled={seedBusy}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-200 transition hover:bg-sky-500/25 disabled:opacity-60"
          >
            {seedBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {seedBusy ? t("reconciliation.seedImporting") : t("reconciliation.seedButton")}
          </button>
          <input
            ref={seedRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => onSeedFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-4 text-lg font-black text-white">{t("reconciliation.history")}</h2>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">…</p>
        ) : imports.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">{t("reconciliation.historyEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-xs font-bold text-slate-400">
                  <th className="px-3 py-2">{t("reconciliation.country")}</th>
                  <th className="px-3 py-2">{t("reconciliation.weekCode")}</th>
                  <th className="px-3 py-2">{t("reconciliation.excelFile")}</th>
                  <th className="px-3 py-2">{t("reconciliation.rows")}</th>
                  <th className="px-3 py-2">{t("reconciliation.importedBy")}</th>
                  <th className="px-3 py-2">{t("reconciliation.importedAt")}</th>
                  <th className="px-3 py-2">{t("reconciliation.colStatus")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr
                    key={imp.id}
                    className="border-t border-white/5 text-slate-200 transition hover:bg-white/[0.03]"
                  >
                    <td className="px-3 py-2.5 font-semibold">{countryLabel(imp.country)}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-[#e8d48a]">{imp.weekCode}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5" title={imp.fileName}>
                      {imp.fileName}
                    </td>
                    <td className="px-3 py-2.5">{imp.totalRows}</td>
                    <td className="px-3 py-2.5">{imp.importedByName ?? "—"}</td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {new Date(imp.importedAt).toLocaleString("he-IL")}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${
                          imp.matched
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border-slate-500/30 bg-slate-500/10 text-slate-300"
                        }`}
                      >
                        {imp.matched
                          ? t("reconciliation.matchedBadge")
                          : t("reconciliation.notMatchedBadge")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-left">
                      <button
                        type="button"
                        onClick={() => onOpen(imp.id)}
                        className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.1]"
                      >
                        {t("reconciliation.open")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-xs font-bold opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function DetailView({
  detail,
  onChange,
  statusLabel,
  countryLabel,
}: {
  detail: ReconImportDetailDto;
  onChange: (d: ReconImportDetailDto) => void;
  statusLabel: (s: ReconStatus) => string;
  countryLabel: (c: string) => string;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [matching, setMatching] = useState(false);
  const [assignRow, setAssignRow] = useState<ReconRowDto | null>(null);

  const runMatch = async () => {
    setMatching(true);
    try {
      const d = await runReconMatch(detail.import.id);
      onChange(d);
      showToast({ tone: "success", title: t("reconciliation.matchSuccess") });
    } catch (e) {
      showToast({ tone: "error", title: e instanceof Error ? e.message : "שגיאה" });
    } finally {
      setMatching(false);
    }
  };

  const kpis = detail.kpis;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="font-semibold text-slate-300">
            {t("reconciliation.country")}: <b className="text-white">{countryLabel(detail.import.country)}</b>
          </span>
          <span className="font-semibold text-slate-300">
            {t("reconciliation.weekCode")}:{" "}
            <b className="font-mono text-[#e8d48a]">{detail.import.weekCode}</b>
          </span>
          <span className="max-w-[260px] truncate font-semibold text-slate-300" title={detail.import.fileName}>
            {t("reconciliation.excelFile")}: <b className="text-white">{detail.import.fileName}</b>
          </span>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runMatch}
            disabled={matching}
            className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#c9a227,#e8d48a)] px-4 py-2 text-sm font-black text-[#081224] transition hover:brightness-105 disabled:opacity-60"
          >
            {matching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {matching ? t("reconciliation.matching") : t("reconciliation.runMatch")}
          </button>
          <a
            href={reconExportUrl(detail.import.id, "pdf")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/[0.1]"
          >
            <FileText className="h-4 w-4" />
            {t("reconciliation.exportPdf")}
          </a>
          <a
            href={reconExportUrl(detail.import.id, "xlsx")}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/[0.1]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t("reconciliation.exportExcel")}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label={t("reconciliation.kpiTotal")} value={kpis.total} tone="border-white/10 bg-white/[0.04] text-white" />
        <Kpi label={t("reconciliation.kpiMatched")} value={kpis.matched} tone="border-emerald-500/30 bg-emerald-500/10 text-emerald-200" />
        <Kpi label={t("reconciliation.kpiDifferences")} value={kpis.differences} tone="border-amber-500/30 bg-amber-500/10 text-amber-200" />
        <Kpi label={t("reconciliation.kpiMissingWego")} value={kpis.missingInWego} tone="border-rose-500/30 bg-rose-500/10 text-rose-200" />
        <Kpi label={t("reconciliation.kpiMissingExternal")} value={kpis.missingInExternal} tone="border-sky-500/30 bg-sky-500/10 text-sky-200" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-right text-xs font-bold text-slate-400">
                <th className="px-3 py-3">{t("reconciliation.colCustomerCode")}</th>
                <th className="px-3 py-3">{t("reconciliation.colCustomerName")}</th>
                <th className="px-3 py-3">{t("reconciliation.colExternalOrder")}</th>
                <th className="px-3 py-3">{t("reconciliation.colWegoOrder")}</th>
                <th className="px-3 py-3">{t("reconciliation.colExternalAmount")}</th>
                <th className="px-3 py-3">{t("reconciliation.colWegoAmount")}</th>
                <th className="px-3 py-3">{t("reconciliation.colDifference")}</th>
                <th className="px-3 py-3">{t("reconciliation.colStatus")}</th>
                <th className="px-3 py-3">{t("reconciliation.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {detail.rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-400">
                    {t("reconciliation.tableEmpty")}
                  </td>
                </tr>
              ) : (
                detail.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t border-white/5 text-slate-200 ${ROW_TINT[row.status]}`}
                  >
                    <td className="px-3 py-2.5 font-mono">{row.customerCode ?? "—"}</td>
                    <td className="px-3 py-2.5 font-semibold">{row.customerName ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-400">{row.externalOrderId ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-400">
                      {row.wegoOrderNumber !== null ? row.wegoOrderNumber : "—"}
                    </td>
                    <td className="px-3 py-2.5">{fmtAmount(row.externalAmount)}</td>
                    <td className="px-3 py-2.5">{fmtAmount(row.wegoAmount)}</td>
                    <td
                      className={`px-3 py-2.5 font-bold ${
                        row.difference && Math.abs(row.difference) > 0.01 ? "text-amber-300" : ""
                      }`}
                    >
                      {row.difference !== null ? fmtAmount(row.difference) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[row.status]}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {row.status === RECON_STATUS.MISSING_IN_WEGO ||
                      row.status === RECON_STATUS.AMOUNT_DIFFERENCE ? (
                        <button
                          type="button"
                          onClick={() => setAssignRow(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#c9a227]/40 bg-[#c9a227]/10 px-2.5 py-1 text-xs font-bold text-[#e8d48a] transition hover:bg-[#c9a227]/20"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {t("reconciliation.assign")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {assignRow ? (
        <AssignModal
          row={assignRow}
          country={detail.import.country}
          weekCode={detail.import.weekCode}
          onClose={() => setAssignRow(null)}
          onAssigned={(d) => {
            onChange(d);
            setAssignRow(null);
            showToast({ tone: "success", title: t("reconciliation.assignSuccess") });
          }}
        />
      ) : null}
    </div>
  );
}

function AssignModal({
  row,
  country,
  weekCode,
  onClose,
  onAssigned,
}: {
  row: ReconRowDto;
  country: string;
  weekCode: string;
  onClose: () => void;
  onAssigned: (d: ReconImportDetailDto) => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [q, setQ] = useState(row.customerCode ?? row.customerName ?? "");
  const [results, setResults] = useState<ReconCandidateOrderDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchCandidateOrders({ q, country, weekCode });
        if (active) setResults(r);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [q, country, weekCode]);

  const assign = async (orderId: string) => {
    setSaving(true);
    try {
      const d = await assignReconRow(row.id, orderId);
      onAssigned(d);
    } catch (e) {
      showToast({ tone: "error", title: e instanceof Error ? e.message : "שגיאה" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b1426] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">{t("reconciliation.assignTitle")}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("reconciliation.assignSearch")}
            autoFocus
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 pe-9 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#c9a227]/60"
          />
        </div>

        <div className="max-h-[320px] space-y-1.5 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-400">…</p>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{t("reconciliation.assignEmpty")}</p>
          ) : (
            results.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={saving}
                onClick={() => assign(o.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-right transition hover:border-[#c9a227]/40 hover:bg-white/[0.07] disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{o.customerName}</p>
                  <p className="text-xs text-slate-400">
                    #{o.orderNumber}
                    {o.customerCode ? ` · ${o.customerCode}` : ""}
                    {o.weekCode ? ` · ${o.weekCode}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-[#e8d48a]">{fmtAmount(o.totalAmount)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

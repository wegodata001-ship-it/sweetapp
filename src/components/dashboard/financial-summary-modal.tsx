"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { formatShekel } from "@/lib/format-shekel";
import { periodBounds, shiftAnchor, type VatSourceLine, type VatSummary } from "@/lib/finance/vat-summary";

type TabId = "output" | "input" | "all";

function money(value: string): string {
  return formatShekel(Number(value));
}

function rateLabel(value: string): string {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) return "—";
  return `${Math.round(rate * 1000) / 10}%`;
}

export function FinancialSummaryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale, dir } = useI18n();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<"week" | "month" | "year" | "custom">("month");
  const [anchor, setAnchor] = useState(today);
  const [customFrom, setCustomFrom] = useState(periodBounds("month", today).from);
  const [customTo, setCustomTo] = useState(periodBounds("month", today).to);
  const [tab, setTab] = useState<TabId>("output");
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState<VatSummary | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [copied, setCopied] = useState("");
  const [selectedZ, setSelectedZ] = useState<VatSourceLine | null>(null);
  const zRef = useRef<HTMLElement>(null);
  const incomeRef = useRef<HTMLElement>(null);
  const range = kind === "custom" ? { from: customFrom, to: customTo } : periodBounds(kind, anchor);

  useEffect(() => {
    if (!open) return;
    const q = new URLSearchParams({ from: range.from, to: range.to });
    void fetch(`/api/dashboard/vat-summary?${q.toString()}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((body: { ok?: boolean; data?: VatSummary; needsReview?: boolean }) => {
        if (body.ok && body.data) {
          setSummary(body.data);
          setNeedsReview(body.needsReview === true);
        } else {
          setSummary(null);
        }
      })
      .catch(() => setSummary(null));
  }, [open, range.from, range.to]);

  const dateLocale = locale === "en" ? "en" : locale === "ar" ? "ar" : "he";
  const formatDay = (value: string) => {
    const d = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(dateLocale);
  };
  const label = new Date(`${range.from}T00:00:00.000Z`).toLocaleDateString(dateLocale, {
    month: "long",
    year: "numeric",
    day: kind === "week" || kind === "custom" ? "numeric" : undefined,
  });

  const sources = summary?.sources ?? [];
  const zRows = sources.filter((row) => row.sourceType === "z_report");
  const incomeRows = sources.filter((row) => row.sourceType === "income_document");
  const inputRows = sources.filter((row) => row.sourceType === "manual_receipt" || row.sourceType === "expense_invoice");
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((row) =>
      [row.partyName, row.documentNumber, row.label, row.date, row.documentType, formatDay(row.date)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [sources, query, dateLocale]);

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? "" : current)), 1600);
    } catch {
      setCopied("");
    }
  }

  function copyLine(row: VatSourceLine) {
    const text =
      row.sourceType === "z_report"
        ? [
            `${t("dashboard.redesign.vatColZ")}: ${row.documentNumber}`,
            `${t("dashboard.redesign.vatColDate")}: ${formatDay(row.date)}`,
            `${t("dashboard.redesign.vatColCash")}: ${money(row.cashTaxable)}`,
            `${t("dashboard.redesign.vatColCredit")}: ${money(row.creditTaxable)}`,
            `${t("dashboard.redesign.vatTaxable")}: ${money(row.grossAmount)}`,
            `${t("dashboard.redesign.vatComputed")}: ${money(row.vatAmount)}`,
          ].join("\n")
        : [
            `${t("dashboard.redesign.vatColDocNo")}: ${row.documentNumber}`,
            `${t("dashboard.redesign.vatColDate")}: ${formatDay(row.date)}`,
            `${row.sourceType === "income_document" ? t("dashboard.redesign.vatColCustomer") : t("dashboard.redesign.vatColSupplier")}: ${row.partyName || "—"}`,
            `${t("dashboard.redesign.vatColNet")}: ${money(row.netAmount)}`,
            `${t("dashboard.redesign.vatComputed")}: ${money(row.vatAmount)}`,
            `${t("dashboard.redesign.vatColGross")}: ${money(row.grossAmount)}`,
          ].join("\n");
    void copyText(row.sourceId, text);
  }

  function copyTable(key: string, header: string[], rows: string[][]) {
    const text = [header.join(" | "), ...rows.map((row) => row.join(" | "))].join("\n");
    void copyText(key, text);
  }

  function openDocument(row: VatSourceLine) {
    if (row.sourceType === "manual_receipt") {
      router.push(`/finance/register?tab=manualReceipt&receipt=${encodeURIComponent(row.sourceId)}`);
    } else {
      router.push(`/finance/register?edit=${encodeURIComponent(row.sourceId)}`);
    }
    onClose();
  }

  function duplicateDocument(row: VatSourceLine) {
    router.push(`/finance/register?duplicate=${encodeURIComponent(row.sourceId)}`);
    onClose();
  }

  async function openPdf(row: VatSourceLine, download: boolean) {
    let url = "";
    let fileName = row.attachmentName || `${row.documentNumber}.pdf`;
    if (row.attachmentPath) {
      const q = new URLSearchParams({
        storagePath: row.attachmentPath,
        storageBucket: row.attachmentBucket || "",
        fileName,
        fileType: row.attachmentMime || "",
      });
      const res = await fetch(`/api/source-documents/access?${q.toString()}`, { credentials: "same-origin" });
      const body = (await res.json()) as { ok?: boolean; data?: { url?: string } };
      url = body.data?.url || "";
    } else {
      const res = await fetch(`/api/documents/${encodeURIComponent(row.sourceId)}/pdf`, { credentials: "same-origin" });
      const body = (await res.json()) as { ok?: boolean; pdfUrl?: string };
      url = body.pdfUrl || "";
    }
    if (!url) {
      openDocument(row);
      return;
    }
    if (download) {
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.target = "_blank";
      link.rel = "noopener";
      link.click();
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!open) return null;
  const payableLabel = summary?.payableSide === "credit" ? t("dashboard.redesign.vatCredit") : t("dashboard.redesign.vatEstimated");

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-[#081224]/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div dir={dir} className="relative flex h-full w-full flex-col overflow-hidden bg-white text-[#0f172a] sm:h-[min(900px,90vh)] sm:w-[min(1400px,94vw)] sm:rounded-3xl sm:shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-2xl font-black text-[#081224]">{t("dashboard.redesign.financialSummary")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("dashboard.redesign.vatSubtitle")}</p>
          </div>
          <button type="button" className="rounded-xl px-3 py-1 text-xl font-black text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label={t("dashboard.redesign.vatClose")}>
            ×
          </button>
        </header>

        <div className="shrink-0 border-b border-slate-100 bg-[#f8fafc] px-4 py-3 sm:px-6">
          <div className="flex flex-wrap gap-2">
            {(["week", "month", "year", "custom"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setKind(id)}
                className={`rounded-full px-3 py-1.5 text-sm font-bold ${kind === id ? "bg-[#081224] text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
              >
                {t(id === "week" ? "dashboard.redesign.periodWeek" : id === "month" ? "dashboard.redesign.periodMonth" : id === "year" ? "dashboard.redesign.periodYear" : "dashboard.redesign.periodCustom")}
              </button>
            ))}
          </div>
          {kind === "custom" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-1" />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-1" />
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between text-sm font-bold">
              <button type="button" onClick={() => setAnchor(shiftAnchor(kind, anchor, -1))}>{t("dashboard.redesign.periodPrev")}</button>
              <span>{label}</span>
              <button type="button" onClick={() => setAnchor(shiftAnchor(kind, anchor, 1))}>{t("dashboard.redesign.periodNext")}</button>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">{range.from} — {range.to}. {t("dashboard.redesign.vatDisclaimer")}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
          {needsReview ? <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">{t("dashboard.redesign.vatNeedsReview")}</p> : null}
          {summary ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard title={t("dashboard.redesign.vatOutput")} amount={money(summary.outputVat)} />
                <SummaryCard title={t("dashboard.redesign.vatInput")} amount={money(summary.inputVat)} />
                <SummaryCard title={payableLabel} amount={money(summary.payableVat)} emphasis />
              </div>
              <section className="mt-4 rounded-2xl border border-[#c9a227]/30 bg-[#fffbeb] px-4 py-3 text-sm leading-6">
                <p className="font-black text-[#081224]">{t("dashboard.redesign.vatHow")}</p>
                <p>{t("dashboard.redesign.vatHowOutput")}</p>
                <p>{t("dashboard.redesign.vatHowInput")}</p>
                <p>{t("dashboard.redesign.vatHowPayable")}</p>
              </section>

              <div className="mt-4 flex flex-wrap gap-2">
                {([
                  ["output", "dashboard.redesign.vatTabOutput"],
                  ["input", "dashboard.redesign.vatTabInput"],
                  ["all", "dashboard.redesign.vatTabAll"],
                ] as const).map(([id, key]) => (
                  <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-xl px-3 py-2 text-sm font-black ${tab === id ? "bg-[#c9a227] text-[#081224]" : "bg-slate-100 text-slate-700"}`}>
                    {t(key)}
                  </button>
                ))}
              </div>

              {tab === "output" ? (
                <div className="mt-4 space-y-6">
                  <section className="rounded-2xl border border-slate-200 p-4">
                    <h3 className="font-black">{t("dashboard.redesign.vatSourcesTitle")}</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <SourceCard
                        title={t("dashboard.redesign.vatZSource")}
                        taxable={money(summary.outputBySource.zReports.taxableAmount)}
                        vat={money(summary.outputBySource.zReports.vatAmount)}
                        count={summary.outputBySource.zReports.count}
                        taxableLabel={t("dashboard.redesign.vatTaxable")}
                        vatLabel={t("dashboard.redesign.vatComputed")}
                        countLabel={t("dashboard.redesign.vatDocCount")}
                        action={t("dashboard.redesign.vatShowDetail")}
                        onShow={() => zRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      />
                      <SourceCard
                        title={t("dashboard.redesign.vatIncomeSource")}
                        taxable={money(summary.outputBySource.incomeDocuments.taxableAmount)}
                        vat={money(summary.outputBySource.incomeDocuments.vatAmount)}
                        count={summary.outputBySource.incomeDocuments.count}
                        taxableLabel={t("dashboard.redesign.vatTaxable")}
                        vatLabel={t("dashboard.redesign.vatComputed")}
                        countLabel={t("dashboard.redesign.vatDocCount")}
                        action={t("dashboard.redesign.vatShowDetail")}
                        onShow={() => incomeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      />
                    </div>
                    <p className="mt-3 text-sm font-bold">
                      {money(summary.outputBySource.zReports.vatAmount)} + {money(summary.outputBySource.incomeDocuments.vatAmount)} = {money(summary.outputVat)}
                    </p>
                    <p className="text-sm font-black">{t("dashboard.redesign.vatTotalOutput")}: {money(summary.outputVat)}</p>
                  </section>

                  <section ref={zRef}>
                    <SectionHead
                      title={t("dashboard.redesign.vatZSection")}
                      copyLabel={copied === "z-table" ? t("dashboard.redesign.vatCopied") : t("dashboard.redesign.vatCopyTable")}
                      onCopy={() =>
                        copyTable(
                          "z-table",
                          [t("dashboard.redesign.vatColDate"), t("dashboard.redesign.vatColZ"), t("dashboard.redesign.vatTaxable"), t("dashboard.redesign.vatComputed")],
                          zRows.map((row) => [formatDay(row.date), row.documentNumber, money(row.grossAmount), money(row.vatAmount)]),
                        )
                      }
                    />
                    {zRows.length === 0 ? <Empty text={t("dashboard.redesign.vatEmptyOutput")} /> : (
                      <>
                        <div className="hidden overflow-x-auto md:block">
                          <table className="w-full text-sm">
                            <thead className="text-slate-500">
                              <tr>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColDate")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColZ")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColCash")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColCredit")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColTaxable")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColVat")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColActions")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {zRows.map((row) => (
                                <tr key={row.sourceId} className="border-t border-slate-100">
                                  <td className="px-2 py-2">{formatDay(row.date)}</td>
                                  <td className="px-2 py-2 font-bold">{row.documentNumber}</td>
                                  <td className="px-2 py-2">{money(row.cashTaxable)}</td>
                                  <td className="px-2 py-2">{money(row.creditTaxable)}</td>
                                  <td className="px-2 py-2">{money(row.grossAmount)}</td>
                                  <td className="px-2 py-2 font-black">{money(row.vatAmount)}</td>
                                  <td className="px-2 py-2"><RowActions row={row} copied={copied === row.sourceId} t={t} onDetail={() => setSelectedZ(row)} onCopy={() => copyLine(row)} onOpen={() => openDocument(row)} onPdf={(download) => void openPdf(row, download)} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-2 md:hidden">
                          {zRows.map((row) => (
                            <DocCard key={row.sourceId} title={row.documentNumber} date={formatDay(row.date)} party={t("dashboard.redesign.vatZSource")} total={money(row.grossAmount)} vat={money(row.vatAmount)} vatLabel={t("dashboard.redesign.vatComputed")} actions={<RowActions row={row} copied={copied === row.sourceId} t={t} onDetail={() => setSelectedZ(row)} onCopy={() => copyLine(row)} onOpen={() => openDocument(row)} onPdf={(download) => void openPdf(row, download)} />} />
                          ))}
                        </div>
                      </>
                    )}
                  </section>

                  <section ref={incomeRef}>
                    <SectionHead
                      title={t("dashboard.redesign.vatIncomeSection")}
                      copyLabel={copied === "income-table" ? t("dashboard.redesign.vatCopied") : t("dashboard.redesign.vatCopyTable")}
                      onCopy={() =>
                        copyTable(
                          "income-table",
                          [t("dashboard.redesign.vatColDate"), t("dashboard.redesign.vatColDocNo"), t("dashboard.redesign.vatColCustomer"), t("dashboard.redesign.vatColNet"), t("dashboard.redesign.vatComputed"), t("dashboard.redesign.vatColGross")],
                          incomeRows.map((row) => [formatDay(row.date), row.documentNumber, row.partyName || "—", money(row.netAmount), money(row.vatAmount), money(row.grossAmount)]),
                        )
                      }
                    />
                    {incomeRows.length === 0 ? <Empty text={t("dashboard.redesign.vatEmptyOutput")} /> : (
                      <>
                        <div className="hidden overflow-x-auto md:block">
                          <table className="w-full text-sm">
                            <thead className="text-slate-500">
                              <tr>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColDate")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColDocNo")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColCustomer")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColType")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColNet")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColVat")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColGross")}</th>
                                <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColActions")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {incomeRows.map((row) => (
                                <tr key={row.sourceId} className="border-t border-slate-100">
                                  <td className="px-2 py-2">{formatDay(row.date)}</td>
                                  <td className="px-2 py-2 font-bold">{row.documentNumber}</td>
                                  <td className="px-2 py-2">{row.partyName || "—"}</td>
                                  <td className="px-2 py-2">{row.documentType || "—"}</td>
                                  <td className="px-2 py-2">{money(row.netAmount)}</td>
                                  <td className="px-2 py-2 font-black">{money(row.vatAmount)}</td>
                                  <td className="px-2 py-2">{money(row.grossAmount)}</td>
                                  <td className="px-2 py-2"><RowActions row={row} copied={copied === row.sourceId} t={t} onCopy={() => copyLine(row)} onOpen={() => openDocument(row)} onDuplicate={() => duplicateDocument(row)} onPdf={(download) => void openPdf(row, download)} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-2 md:hidden">
                          {incomeRows.map((row) => (
                            <DocCard key={row.sourceId} title={row.documentNumber} date={formatDay(row.date)} party={row.partyName || "—"} total={money(row.grossAmount)} vat={money(row.vatAmount)} vatLabel={t("dashboard.redesign.vatComputed")} actions={<RowActions row={row} copied={copied === row.sourceId} t={t} onCopy={() => copyLine(row)} onOpen={() => openDocument(row)} onDuplicate={() => duplicateDocument(row)} onPdf={(download) => void openPdf(row, download)} />} />
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                </div>
              ) : null}

              {tab === "input" ? (
                <section className="mt-4">
                  <SectionHead
                    title={t("dashboard.redesign.vatInputSection")}
                    copyLabel={copied === "input-table" ? t("dashboard.redesign.vatCopied") : t("dashboard.redesign.vatCopyTable")}
                    onCopy={() =>
                      copyTable(
                        "input-table",
                        [t("dashboard.redesign.vatColDate"), t("dashboard.redesign.vatColSupplier"), t("dashboard.redesign.vatColDocNo"), t("dashboard.redesign.vatColNet"), t("dashboard.redesign.vatColDeductible")],
                        inputRows.map((row) => [formatDay(row.date), row.partyName || "—", row.documentNumber, money(row.netAmount), row.deductible ? money(row.vatAmount) : t("dashboard.redesign.vatNotDeductible")]),
                      )
                    }
                  />
                  <p className="mb-3 text-sm">
                    <span className="font-bold">{t("dashboard.redesign.vatInput")}: </span>
                    {money(summary.inputVat)}
                    <span className="mx-2 text-slate-400">·</span>
                    <span className="font-bold">{t("dashboard.redesign.vatDocCount")}: </span>
                    {inputRows.filter((row) => row.deductible).length}
                  </p>
                  {inputRows.length === 0 ? <Empty text={t("dashboard.redesign.vatEmptyInput")} /> : (
                    <>
                      <div className="hidden overflow-x-auto md:block">
                        <table className="w-full text-sm">
                          <thead className="text-slate-500">
                            <tr>
                              <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColDate")}</th>
                              <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColSupplier")}</th>
                              <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColDocNo")}</th>
                              <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColType")}</th>
                              <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColNet")}</th>
                              <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColDocVat")}</th>
                              <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColDeductible")}</th>
                              <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColGross")}</th>
                              <th className="px-2 py-2 text-start">{t("dashboard.redesign.vatColActions")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inputRows.map((row) => (
                              <tr key={`${row.sourceType}-${row.sourceId}`} className="border-t border-slate-100">
                                <td className="px-2 py-2">{formatDay(row.date)}</td>
                                <td className="px-2 py-2">{row.partyName || "—"}</td>
                                <td className="px-2 py-2 font-bold">{row.documentNumber}</td>
                                <td className="px-2 py-2">{row.documentType || "—"}</td>
                                <td className="px-2 py-2">{money(row.netAmount)}</td>
                                <td className="px-2 py-2">{money(row.documentVat)}</td>
                                <td className="px-2 py-2 font-black">{row.deductible ? money(row.vatAmount) : t("dashboard.redesign.vatNotDeductible")}</td>
                                <td className="px-2 py-2">{money(row.grossAmount)}</td>
                                <td className="px-2 py-2"><RowActions row={row} copied={copied === row.sourceId} t={t} onCopy={() => copyLine(row)} onOpen={() => openDocument(row)} onPdf={(download) => void openPdf(row, download)} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="space-y-2 md:hidden">
                        {inputRows.map((row) => (
                          <DocCard key={`${row.sourceType}-${row.sourceId}`} title={row.documentNumber} date={formatDay(row.date)} party={row.partyName || "—"} total={money(row.grossAmount)} vat={row.deductible ? money(row.vatAmount) : t("dashboard.redesign.vatNotDeductible")} vatLabel={t("dashboard.redesign.vatColDeductible")} actions={<RowActions row={row} copied={copied === row.sourceId} t={t} onCopy={() => copyLine(row)} onOpen={() => openDocument(row)} onPdf={(download) => void openPdf(row, download)} />} />
                        ))}
                      </div>
                    </>
                  )}
                </section>
              ) : null}

              {tab === "all" ? (
                <section className="mt-4">
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("dashboard.redesign.vatSearch")} className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  {searched.length === 0 ? <Empty text={t("dashboard.redesign.vatEmptySearch")} /> : (
                    <div className="space-y-2">
                      {searched.map((row) => (
                        <DocCard key={`${row.sourceType}-${row.sourceId}`} title={row.documentNumber} date={formatDay(row.date)} party={row.partyName || row.documentType || row.sourceType} total={money(row.grossAmount)} vat={money(row.vatAmount)} vatLabel={t("dashboard.redesign.vatComputed")} actions={<RowActions row={row} copied={copied === row.sourceId} t={t} onDetail={row.sourceType === "z_report" ? () => setSelectedZ(row) : undefined} onCopy={() => copyLine(row)} onOpen={() => openDocument(row)} onDuplicate={row.canDuplicate ? () => duplicateDocument(row) : undefined} onPdf={(download) => void openPdf(row, download)} />} />
                      ))}
                    </div>
                  )}
                </section>
              ) : null}
            </>
          ) : (
            <p className="text-sm font-semibold text-slate-500">{t("dashboard.redesign.financialSummary")}</p>
          )}
        </div>

        {selectedZ ? (
          <div className="absolute inset-0 z-10 flex items-end justify-center bg-[#081224]/40 sm:items-center" role="dialog">
            <div className="max-h-[90%] w-full overflow-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl">
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-black">{selectedZ.documentNumber}</h3>
                <button type="button" className="font-black" onClick={() => setSelectedZ(null)}>×</button>
              </div>
              <p className="mt-1 text-sm text-slate-500">{formatDay(selectedZ.date)}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <Detail label={t("dashboard.redesign.vatColCash")} value={money(selectedZ.cashTaxable)} />
                <Detail label={t("dashboard.redesign.vatColCredit")} value={money(selectedZ.creditTaxable)} />
                <Detail label={t("dashboard.redesign.vatExemptCash")} value={money(selectedZ.cashExempt)} />
                <Detail label={t("dashboard.redesign.vatTaxable")} value={money(selectedZ.grossAmount)} />
                <Detail label={t("dashboard.redesign.vatRate")} value={rateLabel(selectedZ.vatRate)} />
                <Detail label={t("dashboard.redesign.vatComputed")} value={money(selectedZ.vatAmount)} />
              </dl>
              <p className="mt-4 rounded-xl bg-[#fffbeb] px-3 py-2 text-sm font-bold">{t("dashboard.redesign.vatZContribution", { amount: money(selectedZ.vatAmount) })}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="rounded-xl bg-[#081224] px-3 py-2 text-sm font-bold text-white" onClick={() => openDocument(selectedZ)}>{t("dashboard.redesign.vatOpen")}</button>
                {selectedZ.hasPdf || selectedZ.attachmentPath ? (
                  <>
                    <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold" onClick={() => void openPdf(selectedZ, false)}>{t("dashboard.redesign.vatViewPdf")}</button>
                    <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold" onClick={() => void openPdf(selectedZ, true)}>{t("dashboard.redesign.vatDownload")}</button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({ title, amount, emphasis }: { title: string; amount: string; emphasis?: boolean }) {
  return (
    <article className={`rounded-2xl border p-4 ${emphasis ? "border-[#c9a227] bg-[#081224] text-white" : "border-slate-200 bg-white"}`}>
      <p className={`text-sm font-bold ${emphasis ? "text-[#c9a227]" : "text-slate-500"}`}>{title}</p>
      <p className="mt-2 text-2xl font-black">{amount}</p>
    </article>
  );
}

function SourceCard(props: {
  title: string;
  taxable: string;
  vat: string;
  count: number;
  taxableLabel: string;
  vatLabel: string;
  countLabel: string;
  action: string;
  onShow: () => void;
}) {
  return (
    <article className="rounded-2xl bg-slate-50 p-3">
      <p className="font-black">{props.title}</p>
      <p className="mt-2 text-sm"><span className="text-slate-500">{props.taxableLabel}: </span><span className="font-bold">{props.taxable}</span></p>
      <p className="text-sm"><span className="text-slate-500">{props.vatLabel}: </span><span className="font-bold">{props.vat}</span></p>
      <p className="text-sm"><span className="text-slate-500">{props.countLabel}: </span><span className="font-bold">{props.count}</span></p>
      <button type="button" className="mt-2 text-sm font-black text-[#081224] underline decoration-[#c9a227]" onClick={props.onShow}>{props.action}</button>
    </article>
  );
}

function SectionHead({ title, copyLabel, onCopy }: { title: string; copyLabel: string; onCopy: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="font-black">{title}</h3>
      <button type="button" className="rounded-xl border border-slate-200 px-3 py-1 text-sm font-bold" onClick={onCopy}>{copyLabel}</button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">{text}</p>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}

function DocCard({ title, date, party, total, vat, vatLabel, actions }: { title: string; date: string; party: string; total: string; vat: string; vatLabel: string; actions: ReactNode }) {
  return (
    <article className="rounded-2xl border border-slate-200 p-3">
      <p className="font-black">{title}</p>
      <p className="text-sm text-slate-500">{date}</p>
      <p className="text-sm">{party}</p>
      <p className="mt-1 text-sm font-bold">{total}</p>
      <p className="text-sm"><span className="text-slate-500">{vatLabel}: </span><span className="font-black">{vat}</span></p>
      <div className="mt-2">{actions}</div>
    </article>
  );
}

function RowActions({
  row,
  copied,
  t,
  onDetail,
  onCopy,
  onOpen,
  onDuplicate,
  onPdf,
}: {
  row: VatSourceLine;
  copied: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onDetail?: () => void;
  onCopy: () => void;
  onOpen: () => void;
  onDuplicate?: () => void;
  onPdf: (download: boolean) => void;
}) {
  const btn = "rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-[#081224]";
  return (
    <div className="flex flex-wrap gap-1">
      {onDetail ? <button type="button" className={btn} onClick={onDetail}>{t("dashboard.redesign.vatDetail")}</button> : null}
      <button type="button" className={btn} onClick={onOpen}>{t("dashboard.redesign.vatOpen")}</button>
      <button type="button" className={btn} onClick={onCopy}>{copied ? t("dashboard.redesign.vatCopied") : t("dashboard.redesign.vatCopy")}</button>
      {row.canDuplicate && onDuplicate ? <button type="button" className={btn} onClick={onDuplicate}>{t("dashboard.redesign.vatDuplicate")}</button> : null}
      {row.hasPdf || row.attachmentPath ? (
        <>
          <button type="button" className={btn} onClick={() => onPdf(false)}>{t("dashboard.redesign.vatViewPdf")}</button>
          <button type="button" className={btn} onClick={() => onPdf(true)}>{t("dashboard.redesign.vatDownload")}</button>
        </>
      ) : null}
    </div>
  );
}

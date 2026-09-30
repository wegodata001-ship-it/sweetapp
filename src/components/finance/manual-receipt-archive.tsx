"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

type ReceiptRow = {
  id: string;
  documentDate: string;
  documentNumber: string | null;
  supplierName: string;
  documentType: string;
  totalAmount: string;
  attachmentPath: string | null;
  attachmentBucket: string | null;
  attachmentMime: string | null;
  attachmentName: string | null;
};

export function ManualReceiptArchive({ query = "" }: { query?: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ReceiptRow[]>([]);

  useEffect(() => {
    void fetch("/api/finance/manual-receipts")
      .then((res) => res.json())
      .then((body: { ok?: boolean; data?: ReceiptRow[] }) => {
        if (body.ok && body.data) setRows(body.data);
      })
      .catch(() => undefined);
  }, []);

  if (rows.length === 0) return null;
  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter((row) =>
        [row.documentNumber, row.supplierName, row.documentType, row.documentDate, row.totalAmount]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : rows;
  if (visible.length === 0) return null;

  async function openSource(row: ReceiptRow) {
    if (!row.attachmentPath) return;
    const q = new URLSearchParams({
      storagePath: row.attachmentPath,
      storageBucket: row.attachmentBucket || "",
      fileName: row.attachmentName || "receipt",
      fileType: row.attachmentMime || "",
    });
    const res = await fetch(`/api/source-documents/access?${q.toString()}`);
    const body = (await res.json()) as { ok?: boolean; data?: { url?: string } };
    if (body.ok && body.data?.url) window.open(body.data.url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-black text-slate-900">{t("register.manualReceipt.archiveTitle")}</h3>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">{t("register.fields.docDate")}</th>
              <th className="px-3 py-2">{t("register.manualReceipt.docNumber")}</th>
              <th className="px-3 py-2">{t("register.manualReceipt.supplier")}</th>
              <th className="px-3 py-2">{t("register.manualReceipt.docType")}</th>
              <th className="px-3 py-2">{t("register.manualReceipt.total")}</th>
              <th className="px-3 py-2">{t("archive.thStatus")}</th>
              <th className="px-3 py-2">{t("archive.sourceFile")}</th>
              <th className="px-3 py-2">PDF</th>
              <th className="px-3 py-2">{t("archive.thActions")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.documentDate}</td>
                <td className="px-3 py-2 font-semibold">{row.documentNumber || "—"}</td>
                <td className="px-3 py-2">{row.supplierName}</td>
                <td className="px-3 py-2">{row.documentType}</td>
                <td className="px-3 py-2 font-black">{row.totalAmount} ₪</td>
                <td className="px-3 py-2">{t("register.manualReceipt.statusSaved")}</td>
                <td className="px-3 py-2">
                  {row.attachmentPath ? (
                    <button type="button" className="font-bold text-cyan-800" onClick={() => void openSource(row)}>
                      {t("archive.sourceFile")}
                    </button>
                  ) : (
                    <span className="text-slate-400">{t("archive.sourceMissing")}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <a className="font-bold" href={`/api/finance/manual-receipts/${row.id}/pdf`} target="_blank" rel="noreferrer">
                    PDF
                  </a>
                </td>
                <td className="px-3 py-2">
                  <Link className="font-bold" href={`/finance/register?tab=manualReceipt&receipt=${row.id}`}>
                    {t("register.manualReceipt.edit")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {visible.map((row) => (
          <article key={row.id} className="rounded-2xl border border-slate-200 p-3">
            <p className="font-black">{row.documentNumber || "—"}</p>
            <p className="text-xs text-slate-500">{row.documentDate} · {row.supplierName}</p>
            <p className="text-sm font-black">{row.totalAmount} ₪</p>
            <p className="text-xs">{row.documentType} · {t("register.manualReceipt.statusSaved")}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {row.attachmentPath ? (
                <button type="button" className="rounded-xl border border-cyan-300 bg-cyan-50 px-2 py-2 text-xs font-black" onClick={() => void openSource(row)}>
                  {t("archive.sourceFile")}
                </button>
              ) : (
                <span className="rounded-xl border border-slate-200 px-2 py-2 text-center text-[11px] text-slate-400">{t("archive.sourceMissing")}</span>
              )}
              <a className="rounded-xl border border-slate-300 px-2 py-2 text-center text-xs font-black" href={`/api/finance/manual-receipts/${row.id}/pdf`} target="_blank" rel="noreferrer">
                PDF
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

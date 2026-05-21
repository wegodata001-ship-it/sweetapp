"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export default function AdminSystemPage() {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"backup" | "reset" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");

  async function downloadBackup() {
    setBusy("backup");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/system/backup", { credentials: "same-origin" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wego-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(t("admin.system.backupOk"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.errorNetwork"));
    } finally {
      setBusy(null);
    }
  }

  async function runReset() {
    if (confirm !== "RESET_CLIENT") {
      setError(t("admin.system.confirmRequired"));
      return;
    }
    setBusy("reset");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/system/reset", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET_CLIENT" }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: {
          stats?: Record<string, number>;
          openInvoicesBefore?: number;
          openInvoicesAfter?: number;
          message?: string;
        };
      };
      if (!res.ok || !j.ok) {
        throw new Error(j.error || t("admin.system.resetFailed"));
      }
      setMessage(
        `${j.data?.message ?? t("admin.system.resetOk")} — ${t("admin.system.openInvoices")}: ${j.data?.openInvoicesBefore ?? "?"} → ${j.data?.openInvoicesAfter ?? 0}`,
      );
      setConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.errorNetwork"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900">{t("admin.system.title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("admin.system.subtitle")}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-800">{t("admin.system.backupTitle")}</h2>
        <p className="mt-1 text-xs text-slate-500">{t("admin.system.backupHint")}</p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void downloadBackup()}
          className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {busy === "backup" ? t("common.loading") : t("admin.system.backupBtn")}
        </button>
      </div>

      <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-5">
        <h2 className="text-sm font-black text-red-900">{t("admin.system.resetTitle")}</h2>
        <p className="mt-2 text-xs leading-relaxed text-red-800">{t("admin.system.resetHint")}</p>
        <label className="mt-4 block text-xs font-bold text-red-900">
          {t("admin.system.confirmLabel")}
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="RESET_CLIENT"
            className="mt-1 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy !== null || confirm !== "RESET_CLIENT"}
          onClick={() => void runReset()}
          className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {busy === "reset" ? t("common.loading") : t("admin.system.resetBtn")}
        </button>
      </div>

      {message ? <p className="text-sm font-bold text-emerald-800">{message}</p> : null}
      {error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}

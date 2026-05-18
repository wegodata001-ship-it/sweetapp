"use client";

import { Loader2, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type SupplierSuggestion = {
  id: string;
  name: string;
  phone: string | null;
  score: number;
};

type Props = {
  ocrName: string;
  onLinked: (supplier: { id: string; name: string }) => void;
};

export function ScanSupplierPanel({ ocrName, onLinked }: Props) {
  const { t, dir } = useI18n();
  const [createOpen, setCreateOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SupplierSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [formName, setFormName] = useState(ocrName);
  const [formPhone, setFormPhone] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formNotes, setFormNotes] = useState("");

  useEffect(() => {
    setFormName(ocrName);
  }, [ocrName]);

  const loadSuggestions = useCallback(async () => {
    if (!ocrName.trim()) return;
    setLoadingSuggestions(true);
    try {
      const res = await fetch(
        `/api/ocr/supplier-suggestions?q=${encodeURIComponent(ocrName)}`,
        { credentials: "same-origin" },
      );
      const json = (await res.json()) as { ok: boolean; data?: SupplierSuggestion[] };
      if (json.ok && json.data) setSuggestions(json.data);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [ocrName]);

  useEffect(() => {
    if (matchOpen) void loadSuggestions();
  }, [matchOpen, loadSuggestions]);

  const createSupplier = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/procurement/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: formName.trim(),
          phone: formPhone.trim() || null,
          notes: [formContact.trim() && `איש קשר: ${formContact.trim()}`, formNotes.trim()]
            .filter(Boolean)
            .join("\n") || null,
        }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { id: string; name: string }; error?: string };
      if (!json.ok || !json.data) throw new Error(json.error ?? "failed");
      await fetch("/api/ocr/supplier-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ supplierId: json.data.id, ocrName }),
      });
      setCreateOpen(false);
      setToast(t("scan.supplierAddedToast"));
      onLinked({ id: json.data.id, name: json.data.name });
    } catch (e) {
      setToast(e instanceof Error ? e.message : t("scan.errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const linkExisting = async (s: SupplierSuggestion) => {
    setLinking(true);
    try {
      const res = await fetch("/api/ocr/supplier-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ supplierId: s.id, ocrName }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { id: string; name: string }; error?: string };
      if (!json.ok || !json.data) throw new Error(json.error ?? "failed");
      setMatchOpen(false);
      setToast(t("scan.supplierLinkedToast"));
      onLinked({ id: json.data.id, name: json.data.name });
    } catch (e) {
      setToast(e instanceof Error ? e.message : t("scan.errorGeneric"));
    } finally {
      setLinking(false);
    }
  };

  if (!ocrName.trim()) return null;

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-3">
      <p className="text-sm font-black text-amber-950">{t("scan.supplierNotFoundTitle")}</p>
      <p className="mt-1 text-xs font-semibold text-amber-900">
        {t("scan.supplierNotFoundHint", { name: ocrName })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t("scan.addSupplierBtn")}
        </button>
        <button
          type="button"
          onClick={() => setMatchOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-black text-amber-900 hover:bg-amber-100"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          {t("scan.matchSupplierBtn")}
        </button>
      </div>
      {toast ? (
        <p className="mt-2 rounded-lg bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
          ✓ {toast}
        </p>
      ) : null}

      {createOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          dir={dir}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">{t("scan.newSupplierModalTitle")}</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg p-1 hover:bg-slate-100">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="grid gap-3 text-sm">
              <label className="block font-bold text-slate-700">
                {t("scan.supplierForm.name")}
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3"
                />
              </label>
              <label className="block font-bold text-slate-700">
                {t("scan.supplierForm.phone")}
                <input
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3"
                />
              </label>
              <label className="block font-bold text-slate-700">
                {t("scan.supplierForm.contact")}
                <input
                  value={formContact}
                  onChange={(e) => setFormContact(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3"
                />
              </label>
              <label className="block font-bold text-slate-700">
                {t("scan.supplierForm.notes")}
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void createSupplier()}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("scan.supplierForm.save")}
            </button>
          </div>
        </div>
      ) : null}

      {matchOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          dir={dir}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-lg font-black text-slate-900">{t("scan.matchSupplierModalTitle")}</h3>
              <button type="button" onClick={() => setMatchOpen(false)} className="rounded-lg p-1 hover:bg-slate-100">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <p className="px-4 py-2 text-xs font-semibold text-slate-600">
              {t("scan.matchSupplierModalHint", { name: ocrName })}
            </p>
            <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
              {loadingSuggestions ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : suggestions.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">{t("scan.noSupplierMatches")}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-black uppercase text-slate-500">
                      <th className="px-2 py-2 text-start">{t("scan.matchTable.supplier")}</th>
                      <th className="px-2 py-2 text-start">{t("scan.matchTable.phone")}</th>
                      <th className="px-2 py-2 text-start">{t("scan.matchTable.match")}</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {suggestions.map((s) => (
                      <tr key={s.id}>
                        <td className="px-2 py-2 font-bold text-slate-800">{s.name}</td>
                        <td className="px-2 py-2 text-slate-600">{s.phone ?? "—"}</td>
                        <td className="px-2 py-2 tabular-nums font-bold text-amber-800">
                          {Math.round(s.score * 100)}%
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            disabled={linking}
                            onClick={() => void linkExisting(s)}
                            className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-black text-white hover:bg-slate-800"
                          >
                            {t("scan.selectSupplierBtn")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

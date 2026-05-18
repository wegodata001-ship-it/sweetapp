"use client";

import { ArrowRight, MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type Loc = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
};

export default function InventoryLocationsPage() {
  const { t, bcp47 } = useI18n();
  const [rows, setRows] = useState<Loc[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/inventory/locations?all=1", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: Loc[] };
    setRows(j.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createLoc = async () => {
    const name = newName.trim();
    if (!name) {
      setNotice(t("ops.locations.msgEnterName"));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/inventory/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name, description: newDesc.trim() || null }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setNotice(j.error ?? t("ops.locations.msgCreateFailed"));
        return;
      }
      setNewName("");
      setNewDesc("");
      setNotice(t("ops.locations.msgCreated"));
      await load();
    } catch {
      setNotice(t("ops.locations.msgCreateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (r: Loc) => {
    setEditingId(r.id);
    setEditName(r.name);
    setEditDesc(r.description ?? "");
  };

  const saveEdit = async (id: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/inventory/locations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setNotice(j.error ?? t("ops.locations.msgUpdateFailed"));
        return;
      }
      setEditingId(null);
      setNotice(t("ops.locations.msgUpdated"));
      await load();
    } catch {
      setNotice(t("ops.locations.msgUpdateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: Loc) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/inventory/locations/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setNotice(j.error ?? t("ops.locations.msgUpdateFailed"));
        return;
      }
      setNotice(r.isActive ? t("ops.locations.msgDeactivated") : t("ops.locations.msgActivated"));
      await load();
    } catch {
      setNotice(t("ops.locations.msgUpdateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Loc) => {
    if (!window.confirm(t("ops.locations.msgConfirmDelete", { name: r.name }))) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/inventory/locations/${encodeURIComponent(r.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; data?: { deactivated?: boolean }; error?: string };
      if (!res.ok) {
        setNotice(j.error ?? t("ops.locations.msgDeleteFailed"));
        return;
      }
      setNotice(j.data?.deactivated ? t("ops.locations.msgDeactivatedLinked") : t("ops.locations.msgDeleted"));
      await load();
    } catch {
      setNotice(t("ops.locations.msgDeleteFailed"));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";
  const labelClass = "block text-xs font-bold text-slate-600";

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/ops/inventory"
            className="inline-flex items-center gap-1 text-sm font-bold text-luxury-navy-rich hover:underline"
          >
            <ArrowRight className="h-4 w-4 rotate-180" aria-hidden />
            {t("ops.locations.back")}
          </Link>
          <h1 className="erp-page-title mt-2 flex items-center gap-2 text-slate-950">
            <MapPin className="h-7 w-7 text-luxury-gold" aria-hidden />
            {t("ops.locations.pageTitle")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("ops.locations.pageDescription")}
          </p>
        </div>
      </div>

      {notice ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
          {notice}
        </p>
      ) : null}

      <section className="app-panel p-5 md:p-6">
        <h2 className="text-sm font-black text-slate-900">{t("ops.locations.newLocationTitle")}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label>
            <span className={labelClass}>{t("ops.locations.fieldNameRequired")}</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className={inputClass} placeholder={t("ops.locations.fieldNamePlaceholder")} />
          </label>
          <label>
            <span className={labelClass}>{t("ops.locations.fieldDescriptionOptional")}</span>
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className={inputClass} placeholder={t("ops.locations.fieldDescriptionPlaceholder")} />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createLoc()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-luxury-gold px-5 py-3 text-sm font-black text-luxury-charcoal shadow-sm hover:bg-luxury-gold-hover disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("ops.locations.addBtn")}
        </button>
      </section>

      <section className="app-panel overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-black text-slate-800">{t("ops.locations.allTitle")}</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <p className="p-6 text-sm font-semibold text-slate-500">{t("ops.locations.noLocationsYet")}</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className={`flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between ${!r.isActive ? "bg-slate-50/80 opacity-80" : ""}`}>
                {editingId === r.id ? (
                  <div className="grid flex-1 gap-2 md:grid-cols-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
                    <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className={inputClass} placeholder={t("ops.locations.fieldDescription")} />
                  </div>
                ) : (
                  <div>
                    <p className="font-black text-slate-900">{r.name}</p>
                    {r.description ? <p className="mt-0.5 text-xs text-slate-600">{r.description}</p> : null}
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      {r.isActive ? t("ops.locations.active") : t("ops.locations.inactive")} · {t("ops.locations.createdOn", { date: new Date(r.createdAt).toLocaleDateString(bcp47) })}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {editingId === r.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveEdit(r.id)}
                        className="rounded-xl bg-luxury-navy-rich px-4 py-2 text-xs font-black text-white hover:bg-luxury-charcoal disabled:opacity-50"
                      >
                        {t("ops.locations.actionSave")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                      >
                        {t("ops.locations.actionCancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startEdit(r)}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {t("ops.locations.actionEdit")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleActive(r)}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {r.isActive ? t("ops.locations.actionDisable") : t("ops.locations.actionEnable")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(r)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                      >
                        {t("ops.locations.actionDelete")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

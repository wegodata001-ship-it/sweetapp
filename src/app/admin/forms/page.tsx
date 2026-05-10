"use client";

import { ClipboardList, LayoutGrid, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Field = {
  id: string;
  label: string;
};

export default function AdminFormsPage() {
  const [fields, setFields] = useState<Field[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editFieldDraft, setEditFieldDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFields = useCallback(async () => {
    setLoadError(null);
    try {
      const fRes = await fetch("/api/form-fields", { credentials: "same-origin" });
      if (fRes.status === 503) {
        setLoadError("אין חיבור למסד — הגדרו DATABASE_URL");
        return;
      }
      const fj = (await fRes.json()) as { data?: { id: string; label: string }[] };
      if (fj.data) setFields(fj.data.map((r) => ({ id: r.id, label: r.label })));
    } catch {
      setLoadError("טעינה נכשלה");
    }
  }, []);

  useEffect(() => {
    void loadFields();
  }, [loadFields]);

  const addField = async () => {
    if (!newFieldLabel.trim()) return;
    const res = await fetch("/api/form-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newFieldLabel.trim(), sortOrder: fields.length }),
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const j = (await res.json()) as { data?: { id: string; label: string } };
    if (j.data) setFields((prev) => [...prev, { id: j.data!.id, label: j.data!.label }]);
    setNewFieldLabel("");
  };

  const removeField = async (id: string) => {
    await fetch(`/api/form-fields/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (editingFieldId === id) {
      setEditingFieldId(null);
      setEditFieldDraft("");
    }
  };

  const startEditField = (field: Field) => {
    setEditingFieldId(field.id);
    setEditFieldDraft(field.label);
  };

  const saveFieldEdit = async () => {
    if (!editingFieldId || !editFieldDraft.trim()) return;
    await fetch(`/api/form-fields/${encodeURIComponent(editingFieldId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editFieldDraft.trim() }),
      credentials: "same-origin",
    });
    setFields((prev) =>
      prev.map((f) => (f.id === editingFieldId ? { ...f, label: editFieldDraft.trim() } : f)),
    );
    setEditingFieldId(null);
    setEditFieldDraft("");
  };

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="app-panel p-8">
        <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-violet-700">
          <ClipboardList className="h-4 w-4" aria-hidden />
          טפסים דינמיים
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">בונה טפסים</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          ניהול שדות לטפסי ספירת מלאי וביצוע משימות — נפרד ממסך הקצאת משימות.
        </p>
        <Link
          href="/admin/tasks"
          className="mt-4 inline-flex text-sm font-bold text-cyan-700 underline underline-offset-2 hover:text-cyan-900"
        >
          חזרה להקצאת משימות
        </Link>
        {loadError && (
          <p className="mt-4 text-sm font-bold text-amber-800" role="alert">
            {loadError}
          </p>
        )}
      </section>

      <section className="app-panel p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-indigo-600" aria-hidden />
          <h2 className="text-xl font-black text-slate-950">שדות טופס</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">יצירה ועריכה של שדות בעברית.</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={newFieldLabel}
            onChange={(event) => setNewFieldLabel(event.target.value)}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-3 text-right font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25"
            placeholder="שם שדה חדש בעברית"
          />
          <button
            type="button"
            onClick={() => void addField()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-black text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            הוספת שדה
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {fields.map((field) => {
            const isEditing = editingFieldId === field.id;
            return (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                {isEditing ? (
                  <input
                    value={editFieldDraft}
                    onChange={(e) => setEditFieldDraft(e.target.value)}
                    className={`${inputClass} flex-1`}
                  />
                ) : (
                  <span className="flex-1 text-base font-bold text-slate-900">{field.label}</span>
                )}
                <div className="flex flex-wrap gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void saveFieldEdit()}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
                      >
                        שמירה
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFieldId(null);
                          setEditFieldDraft("");
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white"
                      >
                        ביטול
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditField(field)}
                      className="rounded-lg border border-indigo-300 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50"
                    >
                      עריכה
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void removeField(field.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    מחיקה
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

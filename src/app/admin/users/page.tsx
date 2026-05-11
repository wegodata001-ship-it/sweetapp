"use client";

import { useCallback, useEffect, useState } from "react";
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey } from "@/lib/auth/permissions";

type RowUser = {
  id: string;
  fullName: string;
  email: string;
  role: "SUPER_ADMIN" | "EMPLOYEE";
  isActive: boolean;
  permissions: string[];
};

type ModalMode = "create" | "edit" | null;

const emptyForm = {
  fullName: "",
  email: "",
  password: "",
  role: "EMPLOYEE" as "SUPER_ADMIN" | "EMPLOYEE",
  isActive: true,
  permissions: [] as PermissionKey[],
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<RowUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/users", { credentials: "same-origin" });
      if (res.status === 401 || res.status === 403) {
        setLoadError("אין הרשאה לצפות בעמוד זה.");
        return;
      }
      const j = (await res.json()) as { ok?: boolean; data?: RowUser[]; error?: string };
      if (!j.ok || !j.data) {
        setLoadError(j.error || "שגיאת טעינה");
        return;
      }
      setUsers(j.data);
    } catch {
      setLoadError("שגיאת רשת");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setModal("create");
  }

  function openEdit(u: RowUser) {
    setEditingId(u.id);
    setForm({
      fullName: u.fullName,
      email: u.email,
      password: "",
      role: u.role,
      isActive: u.isActive,
      permissions: u.permissions.filter((p): p is PermissionKey =>
        (PERMISSION_KEYS as readonly string[]).includes(p),
      ),
    });
    setModal("edit");
  }

  function togglePermission(key: PermissionKey) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  }

  async function submitModal(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === "create") {
        if (!form.password.trim()) {
          setSaving(false);
          return;
        }
        const res = await fetch("/api/admin/users", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: form.fullName,
            email: form.email,
            password: form.password,
            role: form.role,
            isActive: form.isActive,
            permissions: form.role === "EMPLOYEE" ? form.permissions : [],
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setLoadError(j.error || "שמירה נכשלה");
          setSaving(false);
          return;
        }
      } else if (modal === "edit" && editingId) {
        const body: Record<string, unknown> = {
          fullName: form.fullName,
          email: form.email,
          role: form.role,
          isActive: form.isActive,
        };
        if (form.password.trim()) body.password = form.password;
        if (form.role === "EMPLOYEE") body.permissions = form.permissions;

        const res = await fetch(`/api/admin/users/${editingId}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setLoadError(j.error || "עדכון נכשל");
          setSaving(false);
          return;
        }
      }
      setModal(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(id: string) {
    if (!confirm("למחוק משתמש זה?")) return;
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setLoadError(j.error || "מחיקה נכשלה");
      return;
    }
    await load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-[14px]">
      <section className="app-panel mb-[14px] p-4 md:p-[18px]">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div>
            <p className="text-[12px] font-bold tracking-[0.14em] text-luxury-gold opacity-90">ניהול הרשאות</p>
            <h1 className="erp-page-title mt-1 text-slate-950">משתמשים ועובדים</h1>
            <p className="mt-1 max-w-xl text-[14px] leading-snug text-slate-600 opacity-80">
              יצירה ועריכה של משתמשים, והגדרת הרשאות לפי מסכים. עובד רואה רק מה שמסומן.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCreate()}
            className="erp-btn bg-luxury-gold text-luxury-charcoal shadow-sm hover:bg-luxury-gold-hover"
          >
            + משתמש חדש
          </button>
        </div>

        {loadError ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {loadError}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2.5">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-3 py-2 shadow-sm"
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 md:gap-x-5">
                <p className="truncate font-bold text-slate-950">{u.fullName}</p>
                <p className="truncate text-[14px] text-slate-600">{u.email}</p>
                <span className="inline-flex shrink-0 items-center gap-2 text-[12px] font-semibold text-slate-600">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-slate-300"}`}
                    title={u.isActive ? "פעיל" : "לא פעיל"}
                    aria-hidden
                  />
                  {u.role === "SUPER_ADMIN" ? "ADMIN" : "EMPLOYEE"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(u)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  עריכה
                </button>
                <button
                  type="button"
                  onClick={() => void removeUser(u.id)}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  מחיקה
                </button>
              </div>
            </div>
          ))}
          {users.length === 0 && !loadError ? (
            <p className="text-sm text-slate-500">אין משתמשים בטבלה.</p>
          ) : null}
        </div>
      </section>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="app-panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 shadow-luxury-sm">
            <h2 className="text-lg font-black text-slate-950">
              {modal === "create" ? "משתמש חדש" : "עריכת משתמש"}
            </h2>
            <form onSubmit={(e) => void submitModal(e)} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">שם מלא</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">אימייל</label>
                <input
                  type="email"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  סיסמה {modal === "edit" ? "(ללא שינוי — השאירו ריק)" : ""}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required={modal === "create"}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">סוג משתמש</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.role}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      role: e.target.value as "SUPER_ADMIN" | "EMPLOYEE",
                    }))
                  }
                >
                  <option value="EMPLOYEE">EMPLOYEE</option>
                  <option value="SUPER_ADMIN">SUPER ADMIN</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                משתמש פעיל
              </label>

              {form.role === "EMPLOYEE" ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-3 text-xs font-bold text-slate-600">הרשאות (מסכים)</p>
                  <div className="grid gap-2">
                    {PERMISSION_KEYS.map((key) => (
                      <label key={key} className="flex items-center gap-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(key)}
                          onChange={() => togglePermission(key)}
                        />
                        {PERMISSION_LABELS[key]}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">SUPER ADMIN רואה את כל המערכת.</p>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-luxury-gold px-5 py-2 text-sm font-bold text-luxury-charcoal disabled:opacity-60"
                >
                  {saving ? "שומר…" : "שמירה"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

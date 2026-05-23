"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { PERMISSION_GROUPS, PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permissions";
import { isValidNationalId, normalizeNationalId } from "@/lib/employees/national-id";
import { translatePermission } from "@/lib/i18n/status-keys";

type RowUser = {
  id: string;
  fullName: string;
  email: string;
  nationalId: string | null;
  phone: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";
  isActive: boolean;
  hourlyRate: number;
  permissions: string[];
  mustChangePassword?: boolean;
};

type ModalMode = "create" | "edit" | null;

const DEFAULT_EMPLOYEE_PERMISSIONS: PermissionKey[] = ["employee_clock"];

function toValidPermissions(perms: string[]): PermissionKey[] {
  return perms.filter((p): p is PermissionKey =>
    (PERMISSION_KEYS as readonly string[]).includes(p),
  );
}

function UserPermissionsBadges({
  user,
  t,
}: {
  user: RowUser;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (user.role === "SUPER_ADMIN") return null;
  const keys = toValidPermissions(user.permissions);
  return (
    <div className="w-full border-t border-slate-100 pt-2">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {t("admin.users.list.permissionsLabel")}
      </p>
      {keys.length === 0 ? (
        <p className="text-[12px] font-semibold text-amber-800">{t("admin.users.list.noPermissions")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {keys.map((key) => (
            <span
              key={key}
              className="inline-flex rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-900 ring-1 ring-violet-100"
            >
              {translatePermission(t, key)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyForm = {
  fullName: "",
  email: "",
  nationalId: "",
  phone: "",
  password: "",
  role: "EMPLOYEE" as "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE",
  hourlyRate: 0,
  isActive: true,
  mustChangePassword: true,
  permissions: [] as PermissionKey[],
};

export default function AdminUsersPage() {
  const { t } = useI18n();
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
        setLoadError(t("admin.users.errors.loadForbidden"));
        return;
      }
      const j = (await res.json()) as { ok?: boolean; data?: RowUser[]; error?: string };
      if (!j.ok || !j.data) {
        setLoadError(j.error || t("admin.users.errors.loadFailed"));
        return;
      }
      setUsers(j.data);
    } catch {
      setLoadError(t("common.errorNetwork"));
    }
  }, [t]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      permissions: [...DEFAULT_EMPLOYEE_PERMISSIONS],
    });
    setModal("create");
  }

  function openEdit(userId: string) {
    const u = users.find((x) => x.id === userId);
    if (!u) return;
    setEditingId(u.id);
    setForm({
      fullName: u.fullName,
      email: u.email,
      nationalId: u.nationalId ?? "",
      phone: u.phone ?? "",
      password: "",
      role: u.role,
      hourlyRate: u.hourlyRate ?? 0,
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword ?? false,
      permissions: toValidPermissions(u.permissions),
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
      // ולידציות מקדימות ברורות לפני שליחה
      const nid = normalizeNationalId(form.nationalId);
      if (form.role === "EMPLOYEE" && !nid) {
        setLoadError(t("admin.users.errors.nationalIdRequired"));
        setSaving(false);
        return;
      }
      if (nid && !isValidNationalId(nid)) {
        setLoadError(t("admin.users.errors.nationalIdInvalid"));
        setSaving(false);
        return;
      }

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
            email: form.email || null,
            nationalId: nid || null,
            phone: form.phone?.trim() || null,
            password: form.password,
            role: form.role,
            isActive: form.isActive,
            hourlyRate: form.hourlyRate,
            mustChangePassword: form.mustChangePassword,
            permissions:
              form.role === "EMPLOYEE" || form.role === "ADMIN" ? form.permissions : [],
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string; data?: RowUser };
        if (!res.ok || !j.ok) {
          setLoadError(j.error || t("admin.users.errors.saveFailed"));
          setSaving(false);
          return;
        }
        if (j.data) {
          setUsers((prev) => [j.data!, ...prev]);
        }
      } else if (modal === "edit" && editingId) {
        const body: Record<string, unknown> = {
          fullName: form.fullName,
          email: form.email,
          nationalId: nid || null,
          phone: form.phone?.trim() || null,
          role: form.role,
          isActive: form.isActive,
          mustChangePassword: form.mustChangePassword,
        };
        if (form.password.trim()) body.password = form.password;
        body.hourlyRate = form.hourlyRate;
        if (form.role === "EMPLOYEE" || form.role === "ADMIN") {
          body.permissions = form.permissions;
        }

        const res = await fetch(`/api/admin/users/${editingId}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string; data?: RowUser };
        if (!res.ok || !j.ok) {
          setLoadError(j.error || t("admin.users.errors.updateFailed"));
          setSaving(false);
          return;
        }
        if (j.data) {
          setUsers((prev) => prev.map((u) => (u.id === editingId ? { ...u, ...j.data! } : u)));
        }
      }
      setModal(null);
      setLoadError(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(id: string) {
    if (!confirm(t("admin.users.confirmDelete"))) return;
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setLoadError(j.error || t("admin.users.errors.deleteFailed"));
      return;
    }
    await load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-[14px]">
      <section className="app-panel mb-[14px] p-4 md:p-[18px]">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div>
            <p className="text-[12px] font-bold tracking-[0.14em] text-luxury-gold opacity-90">{t("admin.users.kicker")}</p>
            <h1 className="erp-page-title mt-1 text-slate-950">{t("admin.users.title")}</h1>
            <p className="mt-1 max-w-xl text-[14px] leading-snug text-slate-600 opacity-80">
              {t("admin.users.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCreate()}
            className="erp-btn bg-luxury-gold text-luxury-charcoal shadow-sm hover:bg-luxury-gold-hover"
          >
            {t("admin.users.addNew")}
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
              className="flex min-h-[72px] flex-col gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 md:gap-x-5">
                <p className="truncate font-bold text-slate-950">{u.fullName}</p>
                {u.nationalId ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-black tabular-nums text-slate-700"
                    title={t("admin.users.fields.nationalId")}
                  >
                    {t("admin.users.list.nationalIdLabel")} {u.nationalId}
                  </span>
                ) : null}
                {!u.email.endsWith("@employees.local") ? (
                  <p className="truncate text-[14px] text-slate-600">{u.email}</p>
                ) : null}
                {u.phone ? (
                  <p className="truncate text-[12px] font-bold text-slate-500" dir="ltr">
                    📞 {u.phone}
                  </p>
                ) : null}
                <span className="inline-flex shrink-0 items-center gap-2 text-[12px] font-semibold text-slate-600">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-slate-300"}`}
                    title={u.isActive ? t("admin.users.list.active") : t("admin.users.list.inactive")}
                    aria-hidden
                  />
                  {t(`roles.${u.role}`)}
                </span>
                {u.mustChangePassword ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">
                    🔐 {t("admin.users.list.mustChangeBadge")}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(u.id)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  {t("admin.users.list.edit")}
                </button>
                <button
                  type="button"
                  onClick={() => void removeUser(u.id)}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  {t("admin.users.list.delete")}
                </button>
              </div>
              </div>
              <UserPermissionsBadges user={u} t={t} />
            </div>
          ))}
          {users.length === 0 && !loadError ? (
            <p className="text-sm text-slate-500">{t("admin.users.list.noUsers")}</p>
          ) : null}
        </div>
      </section>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="app-panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 shadow-luxury-sm">
            <h2 className="text-lg font-black text-slate-950">
              {modal === "create" ? t("admin.users.modalCreateTitle") : t("admin.users.modalEditTitle")}
            </h2>
            <form onSubmit={(e) => void submitModal(e)} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">{t("admin.users.fields.fullName")} *</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  {t("admin.users.fields.nationalId")} {form.role === "EMPLOYEE" ? "*" : ""}
                  <span className="ms-2 text-[11px] font-semibold text-slate-500">
                    {t("admin.users.fields.nationalIdHint")}
                  </span>
                </label>
                <input
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="123456789"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold tabular-nums"
                  value={form.nationalId}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      nationalId: normalizeNationalId(e.target.value),
                    }))
                  }
                  required={form.role === "EMPLOYEE"}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">{t("admin.users.fields.phone")}</label>
                <input
                  type="tel"
                  dir="ltr"
                  placeholder="050-0000000"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold tabular-nums"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  {t("admin.users.fields.email")} {form.role !== "EMPLOYEE" ? "*" : t("admin.users.fields.emailOptional")}
                </label>
                <input
                  type="email"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required={form.role !== "EMPLOYEE"}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  {t("admin.users.fields.password")} {modal === "edit" ? t("admin.users.fields.passwordResetHint") : "*"}
                </label>
                <input
                  type="text"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required={modal === "create"}
                />
                <label className="mt-2 flex items-center gap-2 text-[12px] font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.mustChangePassword}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, mustChangePassword: e.target.checked }))
                    }
                  />
                  {t("admin.users.fields.mustChange")}
                </label>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">{t("admin.users.fields.role")}</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.role}
                  onChange={(e) => {
                    const role = e.target.value as "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";
                    setForm((f) => {
                      const next = { ...f, role };
                      if (
                        modal === "create" &&
                        role === "EMPLOYEE" &&
                        next.permissions.length === 0
                      ) {
                        next.permissions = [...DEFAULT_EMPLOYEE_PERMISSIONS];
                      }
                      return next;
                    });
                  }}
                >
                  <option value="EMPLOYEE">{t("roles.EMPLOYEE")}</option>
                  <option value="ADMIN">{t("roles.ADMIN")}</option>
                  <option value="SUPER_ADMIN">{t("roles.SUPER_ADMIN")}</option>
                </select>
              </div>
              {(form.role === "EMPLOYEE" || form.role === "ADMIN") && (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">{t("admin.users.fields.hourlyRate")}</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={form.hourlyRate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, hourlyRate: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                {t("admin.users.fields.isActive")}
              </label>

              {form.role === "EMPLOYEE" || form.role === "ADMIN" ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-600">{t("permissions.title")}</p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      {t("admin.users.modalPermissionsSelected", { count: form.permissions.length })}
                    </p>
                  </div>
                  {form.permissions.length > 0 ? (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {form.permissions.map((key) => (
                        <span
                          key={key}
                          className="inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-violet-900 ring-1 ring-violet-200"
                        >
                          {translatePermission(t, key)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="space-y-4">
                    {PERMISSION_GROUPS.map((group) => (
                      <div
                        key={group.groupKey}
                        className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm"
                      >
                        <p className="mb-2.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
                          {t(group.groupKey)}
                        </p>
                        <div className="grid gap-2.5">
                          {group.keys.map((key) => {
                            const on = form.permissions.includes(key);
                            return (
                              <label
                                key={key}
                                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 transition ${
                                  on ? "bg-violet-50 ring-1 ring-violet-200" : "hover:bg-slate-50"
                                }`}
                              >
                                <span className="text-sm font-semibold text-slate-800">
                                  {translatePermission(t, key)}
                                </span>
                                <span
                                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${
                                    on ? "bg-violet-600" : "bg-slate-200"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={on}
                                    onChange={() => togglePermission(key)}
                                  />
                                  <span
                                    className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${
                                      on ? "end-0.5" : "start-0.5"
                                    }`}
                                  />
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">{t("permissions.superAdminAll")}</p>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-luxury-gold px-5 py-2 text-sm font-bold text-luxury-charcoal disabled:opacity-60"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

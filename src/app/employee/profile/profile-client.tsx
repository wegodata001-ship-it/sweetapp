"use client";

import { IdCard, KeyRound, LogOut, Mail, Phone, ShieldCheck, User2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";

/**
 * Minimal employee profile screen.
 *
 * Today this is intentionally read-only — the user can see who they are
 * logged in as and which permissions they have, and sign out. Password
 * changes flow through the same `/api/me/password` endpoint that the
 * rest of the app uses (no inline form here yet to keep the surface tiny).
 */
export function EmployeeProfileClient() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [emailPrefs, setEmailPrefs] = useState({
    emailMode: "important" as "important" | "critical_only" | "daily_digest" | "muted",
    emailQuietHours: true,
    emailNotifyAll: true,
    emailNotifyTasks: true,
    emailNotifyLate: true,
    emailNotifyUpdates: true,
  });
  const [prefsLoading, setPrefsLoading] = useState(true);

  const loadEmailPrefs = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const res = await fetch("/api/me/notification-preferences", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; data?: typeof emailPrefs };
      if (j.ok && j.data) setEmailPrefs(j.data);
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmailPrefs();
  }, [loadEmailPrefs]);

  async function saveEmailPrefs(next: typeof emailPrefs) {
    setEmailPrefs(next);
    const res = await fetch("/api/me/notification-preferences", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const j = (await res.json()) as { ok?: boolean };
    if (res.ok && j.ok) {
      showToast({ tone: "success", title: t("common.saved") });
    } else {
      showToast({ tone: "error", title: t("common.error") });
      void loadEmailPrefs();
    }
  }

  function setEmailMode(mode: typeof emailPrefs.emailMode) {
    void saveEmailPrefs({
      ...emailPrefs,
      emailMode: mode,
      emailNotifyAll: mode !== "muted",
    });
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function notifyChangePassword() {
    showToast({
      tone: "info",
      title: t("employee.profile.changePasswordSoon"),
    });
  }

  return (
    <div dir={dir} className="mx-auto max-w-2xl space-y-5 p-3 md:p-6">
      <header className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
        <p className="flex items-center gap-2 text-xs font-bold tracking-wider text-blue-600">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          {t("employee.profile.kicker")}
        </p>
        <h1 className="mt-1 text-2xl font-black text-slate-950 md:text-3xl">
          {t("employee.profile.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("employee.profile.subtitle")}</p>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
        <ul className="divide-y divide-slate-100">
          <Row icon={<User2 className="h-4 w-4" aria-hidden />} label={t("employee.profile.fullName")} value={user?.fullName ?? "—"} />
          <Row icon={<Mail className="h-4 w-4" aria-hidden />} label={t("employee.profile.email")} value={user?.email ?? "—"} />
          <Row icon={<IdCard className="h-4 w-4" aria-hidden />} label={t("employee.profile.nationalId")} value={user?.nationalId ?? "—"} />
          <Row icon={<Phone className="h-4 w-4" aria-hidden />} label={t("employee.profile.phone")} value={user?.phone ?? "—"} />
          <Row icon={<ShieldCheck className="h-4 w-4" aria-hidden />} label={t("employee.profile.role")} value={t(`employee.profile.role_${user?.role ?? "EMPLOYEE"}`)} />
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
        <h2 className="text-sm font-black text-slate-900">התראות במייל</h2>
        <p className="mt-1 text-xs text-slate-500">רק התראות חשובות — לא כל מה שמופיע בפעמון</p>
        {prefsLoading ? (
          <p className="mt-3 text-sm text-slate-400">טוען…</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(
              [
                ["important", "קבל מיילים חשובים"],
                ["critical_only", "קבל רק קריטיים"],
                ["daily_digest", "קבל סיכום יומי (batch)"],
                ["muted", "השתק מיילים"],
              ] as const
            ).map(([mode, label]) => (
              <li key={mode}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
                  <input
                    type="radio"
                    name="emailMode"
                    checked={emailPrefs.emailMode === mode}
                    onChange={() => setEmailMode(mode)}
                    className="h-4 w-4 border-slate-300"
                  />
                  <span className="text-sm font-semibold text-slate-800">{label}</span>
                </label>
              </li>
            ))}
            <li>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={emailPrefs.emailQuietHours}
                  disabled={emailPrefs.emailMode === "muted"}
                  onChange={(e) =>
                    void saveEmailPrefs({ ...emailPrefs, emailQuietHours: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-sm font-semibold text-slate-800">
                  שעות שקט (23:00–07:00, מלבד קריטי)
                </span>
              </label>
            </li>
          </ul>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={notifyChangePassword}
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <KeyRound className="h-4 w-4" aria-hidden />
          {t("employee.profile.changePassword")}
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-black text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {t("employee.profile.signOut")}
        </button>
      </section>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center justify-between py-3">
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </span>
      <span className="truncate text-sm font-black text-slate-900">{value}</span>
    </li>
  );
}

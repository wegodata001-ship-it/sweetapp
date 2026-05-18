"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type Dash = {
  date: string;
  activeNow: { userId: string; name: string; clockIn: string }[];
  lateToday: { userId: string; name: string; lateMinutes: number }[];
  overtimeToday: { userId: string; name: string; minutes: number }[];
  openTasksCount: number;
  noClockIn: { userId: string; name: string; startTime: string; endTime: string }[];
  workedLast7Days: { userId: string; name: string; minutes: number }[];
};

type ShiftRow = {
  id: string;
  userId: string;
  user: { id: string; fullName: string; email: string };
  workDate: string;
  startTime: string;
  endTime: string;
  branch: string | null;
  notes: string | null;
  status: string;
};

type AttRow = {
  id: string;
  userId: string;
  user: { id: string; fullName: string; hourlyRate: number };
  workDate: string;
  clockIn: string;
  clockOut: string | null;
  workedMinutes: number | null;
  lateMinutes: number;
  overtimeMinutes: number;
  isLate: boolean;
  hasOvertime: boolean;
};

type Assignee = { id: string; fullName: string; email: string };

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export default function AdminStaffPage() {
  const { t, bcp47 } = useI18n();
  const [dash, setDash] = useState<Dash | null>(null);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [attendance, setAttendance] = useState<AttRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"dash" | "shifts" | "att">("dash");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const weekFrom = useMemo(() => addDaysYmd(today, -6), [today]);

  const [shiftForm, setShiftForm] = useState({
    userId: "",
    workDate: today,
    startTime: "08:00",
    endTime: "16:00",
    branch: "",
    notes: "",
  });

  const [editAtt, setEditAtt] = useState<AttRow | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");

  const loadDash = useCallback(async () => {
    const res = await fetch("/api/staff/dashboard", { credentials: "same-origin", cache: "no-store" });
    const j = (await res.json()) as { ok?: boolean; data?: Dash; error?: string };
    if (!res.ok || !j.ok) {
      setErr(j.error || t("admin.staff.errors.loadDash"));
      return;
    }
    setDash(j.data ?? null);
    setErr(null);
  }, [t]);

  const loadShifts = useCallback(async () => {
    const q = new URLSearchParams({ from: weekFrom, to: today });
    const res = await fetch(`/api/staff/shifts?${q}`, { credentials: "same-origin", cache: "no-store" });
    const j = (await res.json()) as { ok?: boolean; data?: ShiftRow[] };
    if (j.ok && j.data) setShifts(j.data);
  }, [weekFrom, today]);

  const loadAtt = useCallback(async () => {
    const q = new URLSearchParams({ from: weekFrom, to: today });
    const res = await fetch(`/api/staff/attendance?${q}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const j = (await res.json()) as { ok?: boolean; data?: AttRow[] };
    if (j.ok && j.data) setAttendance(j.data);
  }, [weekFrom, today]);

  useEffect(() => {
    void loadDash();
    void fetch("/api/employees?forTasks=1", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; data?: Assignee[] }) => {
        if (j.ok && j.data) setAssignees(j.data);
      });
  }, [loadDash]);

  useEffect(() => {
    if (tab === "shifts") void loadShifts();
    if (tab === "att") void loadAtt();
  }, [tab, loadShifts, loadAtt]);

  useEffect(() => {
    const t = setInterval(() => void loadDash(), 30_000);
    return () => clearInterval(t);
  }, [loadDash]);

  async function addShift(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/staff/shifts", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: shiftForm.userId,
        workDate: shiftForm.workDate,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        branch: shiftForm.branch || null,
        notes: shiftForm.notes || null,
      }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErr(j.error || t("admin.staff.errors.saveShift"));
      return;
    }
    void loadShifts();
    void loadDash();
  }

  async function deleteShift(id: string) {
    if (!confirm(t("admin.staff.shiftList.confirmDelete"))) return;
    await fetch(`/api/staff/shifts/${id}`, { method: "DELETE", credentials: "same-origin" });
    void loadShifts();
  }

  function openEditAtt(a: AttRow) {
    setEditAtt(a);
    setEditClockIn(a.clockIn.slice(0, 16));
    setEditClockOut(a.clockOut ? a.clockOut.slice(0, 16) : "");
  }

  async function saveEditAtt(e: React.FormEvent) {
    e.preventDefault();
    if (!editAtt) return;
    const body: { clockIn: string; clockOut?: string | null } = {
      clockIn: new Date(editClockIn).toISOString(),
    };
    body.clockOut = editClockOut.trim() ? new Date(editClockOut).toISOString() : null;
    const res = await fetch(`/api/staff/attendance/${editAtt.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErr(j.error || t("admin.staff.errors.updateFailed"));
      return;
    }
    setEditAtt(null);
    void loadAtt();
    void loadDash();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="app-panel p-4 md:p-6">
        <p className="text-[12px] font-bold tracking-[0.14em] text-luxury-gold opacity-90">{t("admin.staff.kicker")}</p>
        <h1 className="erp-page-title mt-1 text-slate-950">{t("admin.staff.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          {t("admin.staff.subtitle")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["dash", t("admin.staff.tabDash")],
              ["shifts", t("admin.staff.tabShifts")],
              ["att", t("admin.staff.tabAtt")],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                tab === k
                  ? "bg-luxury-navy-rich text-luxury-gold"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {err ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>
      ) : null}

      {tab === "dash" && !dash ? (
        <p className="text-sm font-semibold text-slate-500">{t("admin.staff.loadingDash")}</p>
      ) : null}

      {tab === "dash" && dash ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="app-panel border-l-4 border-emerald-500 p-4">
            <p className="text-xs font-bold text-slate-500">{t("admin.staff.cards.activeNow")}</p>
            <p className="mt-2 text-2xl font-black text-emerald-700">{dash.activeNow.length}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {dash.activeNow.map((x) => (
                <li key={x.userId}>{x.name}</li>
              ))}
            </ul>
          </div>
          <div className="app-panel border-l-4 border-red-500 p-4">
            <p className="text-xs font-bold text-slate-500">{t("admin.staff.cards.lateToday")}</p>
            <p className="mt-2 text-2xl font-black text-red-700">{dash.lateToday.length}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {dash.lateToday.map((x) => (
                <li key={x.userId}>
                  {x.name} — {x.lateMinutes} {t("admin.staff.cards.minutesShort")}
                </li>
              ))}
            </ul>
          </div>
          <div className="app-panel border-l-4 border-amber-500 p-4">
            <p className="text-xs font-bold text-slate-500">{t("admin.staff.cards.overtimeToday")}</p>
            <p className="mt-2 text-2xl font-black text-amber-800">{dash.overtimeToday.length}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {dash.overtimeToday.map((x) => (
                <li key={x.userId}>
                  {x.name} — {x.minutes} {t("admin.staff.cards.minutesShort")}
                </li>
              ))}
            </ul>
          </div>
          <div className="app-panel border-l-4 border-slate-400 p-4">
            <p className="text-xs font-bold text-slate-500">{t("admin.staff.cards.noClockIn")}</p>
            <p className="mt-2 text-2xl font-black text-slate-700">{dash.noClockIn.length}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {dash.noClockIn.map((x) => (
                <li key={x.userId}>
                  {x.name} ({x.startTime}–{x.endTime})
                </li>
              ))}
            </ul>
          </div>
          <div className="app-panel p-4 md:col-span-2">
            <p className="text-xs font-bold text-slate-500">{t("admin.staff.cards.openTasks")}</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{dash.openTasksCount}</p>
          </div>
          <div className="app-panel p-4 md:col-span-2 lg:col-span-3">
            <p className="text-xs font-bold text-slate-500">{t("admin.staff.cards.workedLast7")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {dash.workedLast7Days.map((w) => (
                <span
                  key={w.userId}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-800"
                >
                  {w.name}: {w.minutes} {t("admin.staff.cards.minutesShort")}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "shifts" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="app-panel p-4">
            <h2 className="text-sm font-black text-slate-900">{t("admin.staff.addShift")}</h2>
            <form className="mt-3 space-y-3" onSubmit={(e) => void addShift(e)}>
              <div>
                <label className="text-xs font-bold text-slate-600">{t("admin.staff.shiftFields.user")}</label>
                <select
                  required
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={shiftForm.userId}
                  onChange={(e) => setShiftForm((f) => ({ ...f, userId: e.target.value }))}
                >
                  <option value="">{t("admin.staff.shiftFields.selectUser")}</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">{t("admin.staff.shiftFields.date")}</label>
                <input
                  type="date"
                  required
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={shiftForm.workDate}
                  onChange={(e) => setShiftForm((f) => ({ ...f, workDate: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-600">{t("admin.staff.shiftFields.start")}</label>
                  <input
                    type="time"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={shiftForm.startTime}
                    onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">{t("admin.staff.shiftFields.end")}</label>
                  <input
                    type="time"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={shiftForm.endTime}
                    onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">{t("admin.staff.shiftFields.branch")}</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={shiftForm.branch}
                  onChange={(e) => setShiftForm((f) => ({ ...f, branch: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">{t("admin.staff.shiftFields.notes")}</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={shiftForm.notes}
                  onChange={(e) => setShiftForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-full bg-luxury-gold py-2 text-sm font-black text-luxury-charcoal"
              >
                {t("admin.staff.shiftFields.submit")}
              </button>
            </form>
          </section>
          <section className="app-panel overflow-x-auto p-4">
            <h2 className="text-sm font-black text-slate-900">{t("admin.staff.shiftList.title", { from: weekFrom, to: today })}</h2>
            <table className="mt-3 w-full min-w-[520px] text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2">{t("admin.staff.shiftList.thUser")}</th>
                  <th className="py-2">{t("admin.staff.shiftList.thDate")}</th>
                  <th className="py-2">{t("admin.staff.shiftList.thHours")}</th>
                  <th className="py-2">{t("admin.staff.shiftList.thBranch")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 font-semibold">{s.user.fullName}</td>
                    <td className="py-2">{s.workDate}</td>
                    <td className="py-2">
                      {s.startTime}–{s.endTime}
                    </td>
                    <td className="py-2 text-slate-600">{s.branch ?? "—"}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="text-xs font-bold text-red-600 underline"
                        onClick={() => void deleteShift(s.id)}
                      >
                        {t("admin.staff.shiftList.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}

      {tab === "att" ? (
        <section className="app-panel overflow-x-auto p-4">
          <h2 className="text-sm font-black text-slate-900">{t("admin.staff.attList.title", { from: weekFrom, to: today })}</h2>
          <table className="mt-3 w-full min-w-[640px] text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2">{t("admin.staff.attList.thUser")}</th>
                <th className="py-2">{t("admin.staff.attList.thDate")}</th>
                <th className="py-2">{t("admin.staff.attList.thIn")}</th>
                <th className="py-2">{t("admin.staff.attList.thOut")}</th>
                <th className="py-2">{t("admin.staff.attList.thMinutes")}</th>
                <th className="py-2">{t("admin.staff.attList.thLate")}</th>
                <th className="py-2">{t("admin.staff.attList.thOver")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {attendance.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="py-2 font-semibold">{a.user.fullName}</td>
                  <td className="py-2">{a.workDate}</td>
                  <td className="py-2">{new Date(a.clockIn).toLocaleTimeString(bcp47, { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-2">
                    {a.clockOut
                      ? new Date(a.clockOut).toLocaleTimeString(bcp47, { hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </td>
                  <td className="py-2">{a.workedMinutes ?? "—"}</td>
                  <td className="py-2">
                    {a.isLate ? <span className="font-bold text-red-600">{a.lateMinutes}</span> : "—"}
                  </td>
                  <td className="py-2">
                    {a.hasOvertime ? (
                      <span className="font-bold text-amber-700">{a.overtimeMinutes}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      className="text-xs font-bold text-luxury-gold underline"
                      onClick={() => openEditAtt(a)}
                    >
                      {t("admin.staff.attList.edit")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {editAtt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            className="app-panel w-full max-w-md space-y-3 p-6"
            onSubmit={(e) => void saveEditAtt(e)}
          >
            <h3 className="font-black text-slate-900">{t("admin.staff.attList.editTitle", { name: editAtt.user.fullName })}</h3>
            <div>
              <label className="text-xs font-bold text-slate-600">{t("admin.staff.attList.in")}</label>
              <input
                type="datetime-local"
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editClockIn}
                onChange={(e) => setEditClockIn(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">{t("admin.staff.attList.out")}</label>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editClockOut}
                onChange={(e) => setEditClockOut(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold"
                onClick={() => setEditAtt(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="rounded-full bg-luxury-gold px-4 py-2 text-sm font-black text-luxury-charcoal"
              >
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

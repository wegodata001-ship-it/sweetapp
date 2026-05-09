"use client";

import { useMemo, useState } from "react";

type AttendanceStatus = "ACTIVE" | "COMPLETED";

type AttendanceLog = {
  id: string;
  employee_id: string;
  date: string;
  clock_in_time: string | null;
  clock_in_location: { lat: number; lng: number } | null;
  clock_out_time: string | null;
  clock_out_location: { lat: number; lng: number } | null;
  note: string | null;
  status: AttendanceStatus;
};

const MOCK_EMPLOYEE_ID = "4b8f8d06-5d72-4b1d-8fd2-1f58f6f4d001";

function formatTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function TimeAttendancePage() {
  const [note, setNote] = useState("");
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"IN" | "OUT" | null>(null);

  const today = useMemo(() => todayISODate(), []);
  const todayLogs = useMemo(
    () => logs.filter((log) => log.date === today),
    [logs, today],
  );

  function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        (error) =>
          reject(
            new Error(error.message || "Unable to retrieve location right now."),
          ),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    });
  }

  async function handleClockIn() {
    try {
      setPendingAction("IN");
      setFeedback(null);

      const activeShift = todayLogs.find((item) => item.status === "ACTIVE");
      if (activeShift) {
        setFeedback("An active shift already exists for today.");
        return;
      }

      const location = await getCurrentLocation();
      const now = new Date().toISOString();

      const newLog: AttendanceLog = {
        id: crypto.randomUUID(),
        employee_id: MOCK_EMPLOYEE_ID,
        date: today,
        clock_in_time: now,
        clock_in_location: location,
        clock_out_time: null,
        clock_out_location: null,
        note: note.trim() || null,
        status: "ACTIVE",
      };

      setLogs((prev) => [newLog, ...prev]);
      setNote("");
      setFeedback("Clock in saved successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Clock in failed.";
      setFeedback(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleClockOut() {
    try {
      setPendingAction("OUT");
      setFeedback(null);

      const activeShift = todayLogs.find((item) => item.status === "ACTIVE");
      if (!activeShift) {
        setFeedback("No active shift found to clock out.");
        return;
      }

      const location = await getCurrentLocation();
      const now = new Date().toISOString();

      setLogs((prev) =>
        prev.map((item) =>
          item.id === activeShift.id
            ? {
                ...item,
                clock_out_time: now,
                clock_out_location: location,
                note: note.trim() || item.note,
                status: "COMPLETED",
              }
            : item,
        ),
      );

      setNote("");
      setFeedback("Clock out saved successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Clock out failed.";
      setFeedback(message);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-5 sm:py-8">
      <section className="app-panel p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
          Operations / Attendance
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
          Time Attendance
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Employee ID: <span className="font-semibold">{MOCK_EMPLOYEE_ID}</span>
        </p>
        <p className="text-sm text-slate-500">
          Date: <span className="font-semibold">{today}</span>
        </p>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            onClick={handleClockIn}
            disabled={pendingAction !== null}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
          >
            {pendingAction === "IN"
              ? "Saving..."
              : "Clock In (כניסה משמרת)"}
          </button>

          <button
            type="button"
            onClick={handleClockOut}
            disabled={pendingAction !== null}
            className="w-full rounded-2xl bg-rose-600 px-4 py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
          >
            {pendingAction === "OUT" ? "Saving..." : "Clock Out (יציאה)"}
          </button>
        </div>

        <label
          htmlFor="attendance-note"
          className="mt-5 block text-sm font-semibold text-slate-700"
        >
          Note (optional)
        </label>
        <textarea
          id="attendance-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a comment before clocking in/out"
          className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none ring-indigo-200 focus:ring-2"
        />

        {feedback ? (
          <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {feedback}
          </p>
        ) : null}
      </section>

      <section className="mt-4 app-panel p-4 sm:p-6">
        <h2 className="text-lg font-extrabold text-slate-900">Today&apos;s Log</h2>
        {todayLogs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No attendance records yet for today.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {todayLogs.map((entry) => (
              <li
                key={entry.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">
                    Status: {entry.status}
                  </p>
                  <p className="text-xs text-slate-500">{entry.date}</p>
                </div>

                <p className="mt-2 text-sm text-slate-700">
                  Clock In:{" "}
                  <span className="font-semibold">
                    {formatTime(entry.clock_in_time)}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  In Location:{" "}
                  {entry.clock_in_location
                    ? `${entry.clock_in_location.lat.toFixed(6)}, ${entry.clock_in_location.lng.toFixed(6)}`
                    : "-"}
                </p>

                <p className="mt-2 text-sm text-slate-700">
                  Clock Out:{" "}
                  <span className="font-semibold">
                    {formatTime(entry.clock_out_time)}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  Out Location:{" "}
                  {entry.clock_out_location
                    ? `${entry.clock_out_location.lat.toFixed(6)}, ${entry.clock_out_location.lng.toFixed(6)}`
                    : "-"}
                </p>

                {entry.note ? (
                  <p className="mt-2 text-xs text-slate-600">
                    Note: <span className="font-medium">{entry.note}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

"use client";

import { ClipboardList, Timer, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";

const MOCK_TASK_TITLE = "ספירת מלאי מהירה — מדף חלב וביצים לפני תחילת משמרת";

function formatMmSs(totalMs: number): string {
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = minutes >= 100 ? String(minutes) : String(minutes).padStart(2, "0");
  return `${mm}:${String(seconds).padStart(2, "0")}`;
}

export default function WorkerPortalPage() {
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [notes, setNotes] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const liveElapsedMs =
    running && startedAt !== null ? elapsedMs + (now - startedAt) : elapsedMs;

  const toggleTimer = () => {
    if (!running) {
      setRunning(true);
      setStartedAt(Date.now());
      return;
    }
    if (startedAt !== null) {
      setElapsedMs((prev) => prev + (Date.now() - startedAt));
    }
    setRunning(false);
    setStartedAt(null);
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-emerald-700">
          <ClipboardList className="h-4 w-4" aria-hidden />
          פורטל עובד אישי
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">משימה למשמרת</h1>
        <p className="mt-2 text-sm text-slate-600">
          תצוגה פשוטה לעובד בלבד — ללא נתונים פיננסיים. לחצו להפעלה ולסיום; המונה מתעדכן בזמן אמת.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black leading-7 text-slate-950">{MOCK_TASK_TITLE}</h2>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <Timer className="h-8 w-8 text-emerald-600" aria-hidden />
            <div>
              <p className="text-xs font-bold text-slate-500">זמן מצטבר</p>
              <p className="text-3xl font-black tabular-nums text-slate-950">{formatMmSs(liveElapsedMs)}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleTimer}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-black text-white shadow-lg transition sm:flex-none min-w-[160px] ${
              running ? "bg-slate-900 hover:bg-slate-800 shadow-slate-200" : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
            }`}
          >
            {running ? (
              <>
                <Square className="h-5 w-5 fill-current" aria-hidden />
                סיום
              </>
            ) : (
              <>
                <Play className="h-5 w-5 fill-current" aria-hidden />
                התחל
              </>
            )}
          </button>
        </div>

        <label className="mt-6 block text-sm font-bold text-slate-700">
          הערות עובד
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 bg-white p-4 text-right text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            placeholder="תיעוד בעיות במדף, חוסרים, או הערות למנהל משמרת..."
          />
        </label>
      </section>
    </div>
  );
}

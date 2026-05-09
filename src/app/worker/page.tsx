"use client";

import { useEffect, useMemo, useState } from "react";

type TaskState = {
  id: number;
  title: string;
  running: boolean;
  startedAt: number | null;
  elapsedMs: number;
  notes: string;
};

const initialTasks: TaskState[] = [
  { id: 1, title: "בדיקת מלאי מדפי ייצור", running: false, startedAt: null, elapsedMs: 0, notes: "" },
  { id: 2, title: "הכנת מגשים למשלוח בוקר", running: false, startedAt: null, elapsedMs: 0, notes: "" },
];

function formatDuration(totalMs: number): string {
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export default function WorkerPortalPage() {
  const [now, setNow] = useState(() => Date.now());
  const [tasks, setTasks] = useState<TaskState[]>(initialTasks);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const computedTasks = useMemo(
    () =>
      tasks.map((task) => {
        const liveElapsed =
          task.running && task.startedAt ? task.elapsedMs + (now - task.startedAt) : task.elapsedMs;
        return { ...task, liveElapsed };
      }),
    [tasks, now],
  );

  const startTask = (taskId: number) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId && !task.running ? { ...task, running: true, startedAt: Date.now() } : task,
      ),
    );
  };

  const finishTask = (taskId: number) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId || !task.running || !task.startedAt) return task;
        const elapsedMs = task.elapsedMs + (Date.now() - task.startedAt);
        return { ...task, running: false, startedAt: null, elapsedMs };
      }),
    );
  };

  const updateNotes = (taskId: number, notes: string) => {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, notes } : task)));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-bold tracking-[0.12em] text-emerald-700">פורטל עובד אישי</p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">המשימות שלי למשמרת</h1>
        <p className="mt-2 text-sm text-slate-600">
          פורטל ייעודי לעובדים בלבד. מוצגות משימות פעילות עם טיימר חי ושדה הערות.
        </p>
      </section>

      {computedTasks.map((task) => (
        <section key={task.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900">{task.title}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                זמן מצטבר: <span className="font-black text-slate-900">{formatDuration(task.liveElapsed)}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => startTask(task.id)}
                disabled={task.running}
                className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                התחל
              </button>
              <button
                type="button"
                onClick={() => finishTask(task.id)}
                disabled={!task.running}
                className="rounded-xl bg-slate-800 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                סיום
              </button>
            </div>
          </div>
          <textarea
            value={task.notes}
            onChange={(event) => updateNotes(task.id, event.target.value)}
            className="mt-4 min-h-24 w-full rounded-xl border border-slate-300 p-3"
            placeholder="הערות עובד..."
          />
        </section>
      ))}
    </div>
  );
}

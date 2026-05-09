"use client";

import {
  ClipboardList,
  LayoutGrid,
  Plus,
  Trash2,
  UserRound,
  Clock3,
  Send,
} from "lucide-react";
import { useState } from "react";

type Field = {
  id: number;
  label: string;
};

type AssignedTask = {
  id: number;
  workerName: string;
  description: string;
  targetTime: string;
};

export default function AdminTasksPage() {
  const [fields, setFields] = useState<Field[]>([
    { id: 1, label: "שם פריט מלאי" },
    { id: 2, label: "כמות במדף לפני ספירה" },
    { id: 3, label: "טמפרטורת מקרר (אופציונלי)" },
  ]);
  const [nextFieldId, setNextFieldId] = useState(4);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [editFieldDraft, setEditFieldDraft] = useState("");

  const [workerName, setWorkerName] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [nextTaskId, setNextTaskId] = useState(4);
  const [tasks, setTasks] = useState<AssignedTask[]>([
    {
      id: 1,
      workerName: "דנה — אריזה",
      description: "הכנת מארזי בוקר למשלוח עד 09:30",
      targetTime: "09:30",
    },
    {
      id: 2,
      workerName: "אלי — ייצור",
      description: "בדיקת תוקף מדף חלב וביצים לפני פתיחה",
      targetTime: "08:15",
    },
    {
      id: 3,
      workerName: "נועה — משמרת לילה",
      description: "סידור מדף חומרי ניקוי לאחר ניקוי כללי",
      targetTime: "23:00",
    },
  ]);

  const addField = () => {
    if (!newFieldLabel.trim()) return;
    setFields((prev) => [...prev, { id: nextFieldId, label: newFieldLabel.trim() }]);
    setNextFieldId((prev) => prev + 1);
    setNewFieldLabel("");
  };

  const removeField = (id: number) => {
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

  const saveFieldEdit = () => {
    if (!editingFieldId || !editFieldDraft.trim()) return;
    setFields((prev) =>
      prev.map((f) => (f.id === editingFieldId ? { ...f, label: editFieldDraft.trim() } : f)),
    );
    setEditingFieldId(null);
    setEditFieldDraft("");
  };

  const assignTask = () => {
    if (!workerName.trim() || !taskDescription.trim() || !targetTime.trim()) return;
    setTasks((prev) => [
      {
        id: nextTaskId,
        workerName: workerName.trim(),
        description: taskDescription.trim(),
        targetTime: targetTime.trim(),
      },
      ...prev,
    ]);
    setNextTaskId((prev) => prev + 1);
    setWorkerName("");
    setTaskDescription("");
    setTargetTime("");
  };

  const removeTask = (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

  const labelClass = "block text-sm font-bold text-slate-700";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="app-panel p-8">
        <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-violet-700">
          <ClipboardList className="h-4 w-4" aria-hidden />
          ניהול משימות וטפסים
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">ממשק אדמין לעובדים</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          הקצאת משימות עם יעד זמן, לוח משימות פעיל, ובונה טפסים דינמי לשדות מלאי ומשימות יומיות.
        </p>
      </section>

      <section className="app-panel p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Send className="h-5 w-5 text-violet-600" aria-hidden />
          <h2 className="text-xl font-black text-slate-950">הקצאת משימה לעובד</h2>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <label className={labelClass}>
            <span className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-slate-500" aria-hidden />
              שם עובד
            </span>
            <input
              type="text"
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
              className={inputClass}
              placeholder="למשל: רינת — קירור"
            />
          </label>
          <label className={`md:col-span-2 ${labelClass}`}>
            תיאור משימה
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              className={`${inputClass} min-h-[92px]`}
              placeholder="מה צריך לבצע, כולל מיקום במפעל ופרטים טכניים"
            />
          </label>
          <label className={labelClass}>
            <span className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-slate-500" aria-hidden />
              שעת יעד
            </span>
            <input type="time" value={targetTime} onChange={(e) => setTargetTime(e.target.value)} className={inputClass} />
          </label>
          <div className="flex items-end md:col-span-2">
            <button
              type="button"
              onClick={assignTask}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-luxury-gold px-5 py-3 text-sm font-black text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover md:w-auto"
            >
              <Plus className="h-4 w-4" aria-hidden />
              הקצאת משימה
            </button>
          </div>
        </div>
      </section>

      <section className="app-panel p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-indigo-600" aria-hidden />
          <h2 className="text-xl font-black text-slate-950">לוח משימות פעילות</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">כרטיסיות דמו + משימות שהוקצו בסשן הנוכחי.</p>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {tasks.map((task) => (
            <article key={task.id} className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-500">עובד</p>
                  <p className="mt-1 text-lg font-black text-slate-950">{task.workerName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeTask(task.id)}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                  aria-label="הסרת משימה"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-4 text-sm font-semibold leading-6 text-slate-700">{task.description}</p>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-white bg-white px-3 py-2 text-sm font-black text-slate-900">
                <Clock3 className="h-4 w-4 text-indigo-600" aria-hidden />
                יעד: {task.targetTime}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="app-panel p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-indigo-600" aria-hidden />
          <h2 className="text-xl font-black text-slate-950">בונה טפסים (Form Builder)</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          יצירה ועריכה של שדות לטפסי ספירת מלאי וביצוע משימות בפועל.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={newFieldLabel}
            onChange={(event) => setNewFieldLabel(event.target.value)}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-3 text-right font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25"
            placeholder="שם שדה חדש בעברית"
          />
          <button
            type="button"
            onClick={addField}
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
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-right font-bold text-slate-900"
                  />
                ) : (
                  <span className="flex-1 text-base font-bold text-slate-900">{field.label}</span>
                )}
                <div className="flex flex-wrap gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={saveFieldEdit}
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
                    onClick={() => removeField(field.id)}
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

"use client";

import { useState } from "react";

type Field = {
  id: number;
  label: string;
};

export default function AdminTasksPage() {
  const [fields, setFields] = useState<Field[]>([
    { id: 1, label: "שם פריט מלאי" },
    { id: 2, label: "כמות התחלת משמרת" },
  ]);
  const [nextId, setNextId] = useState(3);
  const [newFieldLabel, setNewFieldLabel] = useState("");

  const addField = () => {
    if (!newFieldLabel.trim()) return;
    setFields((prev) => [...prev, { id: nextId, label: newFieldLabel.trim() }]);
    setNextId((prev) => prev + 1);
    setNewFieldLabel("");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-bold tracking-[0.12em] text-violet-700">
          ניהול משימות וטפסים
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">ממשק אדמין לעובדים</h1>
        <p className="mt-2 text-sm text-slate-600">
          שיוך משימות לעובדים ובניית טפסים דינמית עבור מלאי ומשימות תפעוליות.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">שיוך משימות לעובדים</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select className="rounded-xl border border-slate-300 px-3 py-2">
            <option>בחירת עובד</option>
            <option>עובד ייצור א</option>
            <option>עובד אריזה ב</option>
          </select>
          <input className="rounded-xl border border-slate-300 px-3 py-2" placeholder="תיאור משימה" />
          <button className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800">
            הקצאת משימה
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">Form Builder</h2>
        <p className="mt-1 text-sm text-slate-600">
          יצירה ועריכה דינמית של שדות טופס עבור בדיקות מלאי ומשימות.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={newFieldLabel}
            onChange={(event) => setNewFieldLabel(event.target.value)}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
            placeholder="שם שדה חדש"
          />
          <button
            type="button"
            onClick={addField}
            className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700"
          >
            הוספת שדה
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {fields.map((field) => (
            <div
              key={field.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <span className="font-semibold text-slate-800">{field.label}</span>
              <button className="text-sm font-bold text-indigo-700">עריכה</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

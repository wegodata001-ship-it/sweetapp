"use client";

import { useState } from "react";

const tabs = [
  { id: "income", label: "הכנסות רגילות" },
  { id: "zreport", label: "דוח Z קופה" },
  { id: "events", label: "אירועים ופיקדונות" },
  { id: "expenses", label: "רישום הוצאות" },
] as const;

export default function FinanceRegisterPage() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("income");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-bold tracking-[0.12em] text-cyan-700">רישום כספי</p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">ניהול מסמכים ורישומים</h1>

        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === "income" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">הכנסות רגילות</h2>
          <p className="mt-2 text-sm text-slate-600">
            רישום חשבונית/קבלה מלאה, כולל פרטי לקוח, סכום, אמצעי תשלום ושיוך מסמך.
          </p>
        </section>
      )}

      {activeTab === "zreport" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">דוח Z קופה</h2>
          <p className="mt-2 text-sm text-slate-600">
            רישום דוח יומי מסכם מהקופה ללא שורות פריטים, עם סיכומי חיוב לפי אמצעי תשלום.
          </p>
        </section>
      )}

      {activeTab === "events" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">אירועים ופיקדונות</h2>
          <p className="mt-2 text-sm text-slate-600">
            הזמנות מיוחדות, סכומי פיקדון מגשים, תאריכי החזרה ותמחור קינוחים.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="שם האירוע" />
            <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="סכום פיקדון מגשים" />
            <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="תאריך החזרת מגשים" />
            <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="תמחור קינוחים" />
          </div>
        </section>
      )}

      {activeTab === "expenses" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">רישום הוצאות</h2>
              <p className="mt-2 text-sm text-slate-600">
                קליטת הוצאות לפי ספק, קטגוריה ותיעוד מסמך לצורך התאמות כרטסת ותזרים.
              </p>
            </div>
            <button
              type="button"
              className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700"
            >
              שליחת הזמנה לספק
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

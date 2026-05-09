"use client";

import { AlertTriangle, ClipboardCheck, Package } from "lucide-react";
import { useMemo, useState } from "react";
import { parseNum } from "@/lib/format-shekel";

type ShelfItem = {
  id: string;
  name: string;
  expected: number;
};

const SHELF_ITEMS: ShelfItem[] = [
  { id: "flour", name: "קמח לבן שק 25 ק״ג — מדף א", expected: 42 },
  { id: "sugar", name: "סוכר דמררה — מדף ב", expected: 28 },
  { id: "cream", name: "שמנת מתוקה 38% — מקרר מדף ג", expected: 96 },
  { id: "trays", name: "מגשים ריקים — מדף אריזות", expected: 320 },
  { id: "boxes", name: "קופסאות קרטון למארזים — מדף ד", expected: 540 },
  { id: "labels", name: "מדבקות לוגו — מדף אטום", expected: 12000 },
];

export default function InventoryPage() {
  const [actualById, setActualById] = useState<Record<string, string>>({});

  const rows = useMemo(
    () =>
      SHELF_ITEMS.map((item) => {
        const raw = actualById[item.id] ?? "";
        const actual = raw === "" ? null : parseNum(raw);
        const diff = actual === null ? null : actual - item.expected;
        return { ...item, raw, actual, diff };
      }),
    [actualById],
  );

  return (
    <div className="mx-auto max-w-7xl app-panel p-8">
      <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-indigo-700">
        <Package className="h-4 w-4" aria-hidden />
        ספירת מלאי
      </p>
      <h1 className="mt-3 text-3xl font-black text-slate-950">ספירת מלאי מדפים — משמרת בוקר</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        השווי מערכת מוצג בעמודה &quot;צפי במערכת&quot;. הזינו ספירה בפועל — ההפרש מחושב מיד.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[820px] w-full divide-y divide-slate-200 text-right text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-600">שם פריט</th>
              <th className="px-4 py-3 font-bold text-slate-600">צפי במערכת</th>
              <th className="px-4 py-3 font-bold text-slate-600">ספירה בפועל</th>
              <th className="px-4 py-3 font-bold text-slate-900">הפרש</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                <td className="px-4 py-3 font-bold text-slate-800">{row.expected.toLocaleString("he-IL")}</td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={row.raw}
                    onChange={(e) =>
                      setActualById((prev) => ({
                        ...prev,
                        [row.id]: e.target.value,
                      }))
                    }
                    className="w-36 rounded-xl border border-slate-300 bg-white px-3 py-2 text-right font-bold text-slate-900 outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25"
                    placeholder="הזן כמות"
                  />
                </td>
                <td className="px-4 py-3">
                  {row.diff === null ? (
                    <span className="text-sm font-semibold text-slate-400">—</span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-black ${
                        row.diff === 0
                          ? "bg-emerald-50 text-emerald-800"
                          : row.diff > 0
                            ? "bg-sky-50 text-sky-900"
                            : "bg-amber-50 text-amber-900"
                      }`}
                    >
                      {row.diff < 0 && <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />}
                      {row.diff > 0 ? "+" : ""}
                      {row.diff.toLocaleString("he-IL")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-luxury-gold px-5 py-3 font-bold text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover"
      >
        <ClipboardCheck className="h-4 w-4" aria-hidden />
        שמירת ספירת משמרת
      </button>
    </div>
  );
}

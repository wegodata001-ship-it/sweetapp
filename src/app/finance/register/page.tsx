"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchFinanceDocumentById,
  insertFinanceDocument,
  updateFinanceDocument,
} from "@/lib/finance/db";
import {
  emptyIncomeExpensePayload,
  emptyZReportPayload,
  type IncomeExpensePayload,
  type ZReportPayload,
} from "@/lib/finance/document-payload";
import { IncomeExpenseFields } from "@/app/finance/register/income-expense-fields";
import { formatShekel, parseNum } from "@/lib/format-shekel";

type TabId = "income" | "zreport" | "expenses";

const tabs: { id: TabId; label: string }[] = [
  { id: "income", label: "מסמכי הכנסה ואירועים" },
  { id: "zreport", label: "דוח Z" },
  { id: "expenses", label: "רישום הוצאות" },
];

function FinanceRegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [activeTab, setActiveTab] = useState<TabId>("income");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<"income" | "expense" | "zreport" | null>(null);

  const [incomeForm, setIncomeForm] = useState<IncomeExpensePayload>(() => emptyIncomeExpensePayload("income"));
  const [expenseForm, setExpenseForm] = useState<IncomeExpensePayload>(() => emptyIncomeExpensePayload("expense"));

  const [zDate, setZDate] = useState("");
  const [zNumber, setZNumber] = useState("");
  const [cashTaxable, setCashTaxable] = useState("");
  const [cashExempt, setCashExempt] = useState("");
  const [creditTaxable, setCreditTaxable] = useState("");
  const [creditExempt, setCreditExempt] = useState("");
  const [transfers, setTransfers] = useState("");

  const fixIncomeExpense = useCallback((p: IncomeExpensePayload): IncomeExpensePayload => {
    return {
      ...p,
      kind: p.kind,
      lines: p.lines.map((l) => ({
        ...l,
        vatMode: l.vatMode === "before_vat" || l.vatMode === "exempt" ? l.vatMode : "includes_vat",
      })),
    };
  }, []);

  useEffect(() => {
    if (!editId) {
      queueMicrotask(() => {
        setEditingDocId(null);
        setEditingKind(null);
      });
      return;
    }

    let cancelled = false;

    void (async () => {
      const row = await fetchFinanceDocumentById(editId);
      if (cancelled || !row) return;

      setEditingDocId(row.id);

      const raw = row.payload;
      if (raw?.kind === "zreport") {
        setEditingKind("zreport");
        const z = raw;
        setZDate(z.zDate);
        setZNumber(z.zNumber);
        setCashTaxable(z.cashTaxable ? String(z.cashTaxable) : "");
        setCashExempt(z.cashExempt ? String(z.cashExempt) : "");
        setCreditTaxable(z.creditTaxable ? String(z.creditTaxable) : "");
        setCreditExempt(z.creditExempt ? String(z.creditExempt) : "");
        setTransfers(z.transfers ? String(z.transfers) : "");
        setActiveTab("zreport");
        return;
      }

      if (raw?.kind === "income") {
        setEditingKind("income");
        setIncomeForm(fixIncomeExpense({ ...raw, kind: "income" }));
        setActiveTab("income");
        return;
      }

      if (raw?.kind === "expense") {
        setEditingKind("expense");
        setExpenseForm(fixIncomeExpense({ ...raw, kind: "expense" }));
        setActiveTab("expenses");
        return;
      }

      if (row.category === "דוח Z") {
        setEditingKind("zreport");
        setActiveTab("zreport");
        return;
      }
      if (row.category === "הוצאה") {
        setEditingKind("expense");
        setActiveTab("expenses");
        return;
      }
      if (row.category === "הכנסה") {
        setEditingKind("income");
        setActiveTab("income");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editId, fixIncomeExpense]);

  const zGrandTotal = useMemo(() => {
    return (
      parseNum(cashTaxable) +
      parseNum(cashExempt) +
      parseNum(creditTaxable) +
      parseNum(creditExempt) +
      parseNum(transfers)
    );
  }, [cashTaxable, cashExempt, creditTaxable, creditExempt, transfers]);

  const [archiveFeedback, setArchiveFeedback] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const clearEditMode = useCallback(() => {
    setEditingDocId(null);
    setEditingKind(null);
    router.replace("/finance/register");
  }, [router]);

  const buildZPayload = useCallback((): ZReportPayload => {
    return {
      kind: "zreport",
      zDate,
      zNumber,
      cashTaxable: parseNum(cashTaxable),
      cashExempt: parseNum(cashExempt),
      creditTaxable: parseNum(creditTaxable),
      creditExempt: parseNum(creditExempt),
      transfers: parseNum(transfers),
    };
  }, [cashTaxable, cashExempt, creditTaxable, creditExempt, transfers, zDate, zNumber]);

  const publishIncomeDoc = async () => {
    setPublishing(true);
    setArchiveFeedback(null);
    try {
      const payload: IncomeExpensePayload = { ...incomeForm, kind: "income" };
      const title = `${incomeForm.documentType}${incomeForm.counterpartyName ? ` — ${incomeForm.counterpartyName}` : ""}`;

      if (editingDocId) {
        if (editingKind !== "income") {
          setArchiveFeedback("עריכה פעילה למסמך אחר — עברו לטאב המתאים או בטלו עריכה.");
          return;
        }
        if (editingDocId.startsWith("demo-arch")) {
          setArchiveFeedback("מצב דמו: עריכה מוצגת בלבד — חיבור ל-Supabase נדרש לשמירה.");
          return;
        }
        const res = await updateFinanceDocument(editingDocId, {
          title,
          category: "הכנסה",
          doc_date: incomeForm.docDate || null,
          payload,
        });
        setArchiveFeedback(res.ok ? "המסמך עודכן בהצלחה." : res.error ?? "שגיאה בעדכון");
        if (res.ok) clearEditMode();
        return;
      }

      const res = await insertFinanceDocument({
        title,
        category: "הכנסה",
        docDate: incomeForm.docDate || null,
        payload,
      });
      setArchiveFeedback(res.ok ? "המסמך נשמר במערכת." : res.error ?? "שגיאה בשמירה");
    } catch (e) {
      setArchiveFeedback(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setPublishing(false);
    }
  };

  const publishZDoc = async () => {
    setPublishing(true);
    setArchiveFeedback(null);
    try {
      const payload = buildZPayload();
      const title = `דוח Z${zNumber ? ` ${zNumber}` : ""}`;

      if (editingDocId) {
        if (editingKind !== "zreport") {
          setArchiveFeedback("עריכה פעילה למסמך אחר — עברו לטאב המתאים או בטלו עריכה.");
          return;
        }
        if (editingDocId.startsWith("demo-arch")) {
          setArchiveFeedback("מצב דמו: עריכה מוצגת בלבד — חיבור ל-Supabase נדרש לשמירה.");
          return;
        }
        const res = await updateFinanceDocument(editingDocId, {
          title,
          category: "דוח Z",
          doc_date: zDate || null,
          payload,
        });
        setArchiveFeedback(res.ok ? "דוח Z עודכן בהצלחה." : res.error ?? "שגיאה בעדכון");
        if (res.ok) clearEditMode();
        return;
      }

      const res = await insertFinanceDocument({
        title,
        category: "דוח Z",
        docDate: zDate || null,
        payload,
      });
      setArchiveFeedback(res.ok ? "דוח Z נשמר במערכת." : res.error ?? "שגיאה בשמירה");
    } catch (e) {
      setArchiveFeedback(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setPublishing(false);
    }
  };

  const publishExpenseDoc = async () => {
    setPublishing(true);
    setArchiveFeedback(null);
    try {
      const payload: IncomeExpensePayload = { ...expenseForm, kind: "expense" };
      const title = `${expenseForm.documentType}${expenseForm.counterpartyName ? ` — ${expenseForm.counterpartyName}` : ""}`;

      if (editingDocId) {
        if (editingKind !== "expense") {
          setArchiveFeedback("עריכה פעילה למסמך אחר — עברו לטאב המתאים או בטלו עריכה.");
          return;
        }
        if (editingDocId.startsWith("demo-arch")) {
          setArchiveFeedback("מצב דמו: עריכה מוצגת בלבד — חיבור ל-Supabase נדרש לשמירה.");
          return;
        }
        const res = await updateFinanceDocument(editingDocId, {
          title,
          category: "הוצאה",
          doc_date: expenseForm.docDate || null,
          payload,
        });
        setArchiveFeedback(res.ok ? "המסמך עודכן בהצלחה." : res.error ?? "שגיאה בעדכון");
        if (res.ok) clearEditMode();
        return;
      }

      const res = await insertFinanceDocument({
        title,
        category: "הוצאה",
        docDate: expenseForm.docDate || null,
        payload,
      });
      setArchiveFeedback(res.ok ? "המסמך נשמר במערכת." : res.error ?? "שגיאה בשמירה");
    } catch (e) {
      setArchiveFeedback(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setPublishing(false);
    }
  };

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right text-slate-900 shadow-sm outline-none transition focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

  const labelClass = "block text-sm font-bold text-slate-700";

  const resetIncome = () => {
    setIncomeForm(emptyIncomeExpensePayload("income"));
  };

  const resetExpense = () => {
    setExpenseForm(emptyIncomeExpensePayload("expense"));
  };

  const resetZ = () => {
    const z = emptyZReportPayload();
    setZDate(z.zDate);
    setZNumber(z.zNumber);
    setCashTaxable("");
    setCashExempt("");
    setCreditTaxable("");
    setCreditExempt("");
    setTransfers("");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="app-panel p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-cyan-700">
              <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
              רישום כספי
            </p>
            <h1 className="mt-3 text-3xl font-black text-slate-950">ניהול מסמכים ורישומים</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              רישום מסמכים נשמר כרשומות במערכת; פירוט תשלומים בדוח Z ושורות פריט עם מע״מ.
            </p>
          </div>
        </div>

        {editingDocId && (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-900" role="status">
            עריכת מסמך שמור — פרסום יעדכן את הרשומה במסד הנתונים.
            <button type="button" onClick={clearEditMode} className="me-4 mt-2 block text-xs underline sm:mt-0 sm:inline sm:me-0">
              ביטול עריכה
            </button>
          </div>
        )}

        {archiveFeedback && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${
              archiveFeedback.includes("שגיאה") || archiveFeedback.includes("לא מוגדר") || archiveFeedback.includes("נדרש")
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
            role="status"
          >
            {archiveFeedback}
          </div>
        )}

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
                  isActive
                    ? "border-luxury-gold bg-luxury-gold text-luxury-charcoal shadow-md"
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
        <>
          <IncomeExpenseFields
            heading="מסמכי הכנסה ואירועים"
            intro="רישום חשבוניות ומסמכים מסחריים; בלקוח אירועים יוצגו שדות פיקדון ומגשים."
            value={incomeForm}
            onChange={(next) => setIncomeForm(next.kind === "income" ? next : { ...next, kind: "income" })}
          />

          <div className="flex flex-wrap gap-3 px-1">
            <button
              type="button"
              onClick={resetIncome}
              className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-800 hover:bg-slate-50"
            >
              איפוס טופס
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={() => void publishIncomeDoc()}
              className="rounded-xl bg-cyan-600 px-5 py-3 font-bold text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              {publishing ? "שומר…" : editingDocId ? "עדכון מסמך" : "פרסום מסמך"}
            </button>
          </div>
        </>
      )}

      {activeTab === "zreport" && (
        <section className="app-panel p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-5 w-5 text-cyan-600" aria-hidden />
            <h2 className="text-xl font-black text-slate-950">דוח Z קופה</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">פירוט סיכומי תשלום יומי; הסכום הכולל מחושב אוטומטית.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              תאריך
              <input type="date" value={zDate} onChange={(e) => setZDate(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              מספר דוח Z
              <input
                type="text"
                value={zNumber}
                onChange={(e) => setZNumber(e.target.value)}
                className={inputClass}
                placeholder="לדוגמה: Z‏-‏1042"
              />
            </label>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelClass}>
              מזומן חייב
              <input
                type="number"
                min={0}
                step="0.01"
                value={cashTaxable}
                onChange={(e) => setCashTaxable(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              מזומן פטור
              <input
                type="number"
                min={0}
                step="0.01"
                value={cashExempt}
                onChange={(e) => setCashExempt(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              אשראי חייב
              <input
                type="number"
                min={0}
                step="0.01"
                value={creditTaxable}
                onChange={(e) => setCreditTaxable(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              אשראי פטור
              <input
                type="number"
                min={0}
                step="0.01"
                value={creditExempt}
                onChange={(e) => setCreditExempt(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={`sm:col-span-2 lg:col-span-1 ${labelClass}`}>
              העברות בנק
              <input
                type="number"
                min={0}
                step="0.01"
                value={transfers}
                onChange={(e) => setTransfers(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-black text-emerald-900">סה״כ דוח Z</span>
              <span className="text-3xl font-black text-slate-950">{formatShekel(zGrandTotal)}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={resetZ} className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-800 hover:bg-slate-50">
              איפוס טופס
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={() => void publishZDoc()}
              className="rounded-xl bg-luxury-gold px-5 py-3 font-bold text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover disabled:opacity-50"
            >
              {publishing ? "שומר…" : editingDocId ? "עדכון דוח Z" : "שמירת דוח Z"}
            </button>
          </div>
        </section>
      )}

      {activeTab === "expenses" && (
        <>
          <IncomeExpenseFields
            heading="רישום הוצאות"
            headingClass="text-slate-950"
            iconClass="text-rose-600"
            intro="מבנה זהה לטופס ההכנסה — רישום הוצאות עם אותם שדות ומע״מ לפי שורה."
            value={expenseForm}
            onChange={(next) => setExpenseForm(next.kind === "expense" ? next : { ...next, kind: "expense" })}
          />

          <div className="flex flex-wrap gap-3 px-1">
            <button
              type="button"
              onClick={resetExpense}
              className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-800 hover:bg-slate-50"
            >
              איפוס טופס
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={() => void publishExpenseDoc()}
              className="rounded-xl bg-luxury-gold px-5 py-3 font-bold text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover disabled:opacity-50"
            >
              {publishing ? "שומר…" : editingDocId ? "עדכון מסמך" : "פרסום מסמך"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function FinanceRegisterPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl p-12 text-center text-sm font-semibold text-slate-500">טוען…</div>}>
      <FinanceRegisterPageInner />
    </Suspense>
  );
}

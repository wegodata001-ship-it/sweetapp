"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchFinanceDocumentById,
  insertFinanceDocument,
  updateFinanceDocument,
} from "@/lib/finance/db";
import {
  emptyIncomeExpensePayload,
  emptyZReportPayload,
  incomeExpenseGrandTotal,
  PAYMENT_METHOD_LABELS,
  PAYMENT_INSTRUMENT_OPTIONS,
  newPaymentId,
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
  const paymentDocumentId = searchParams.get("paymentDocumentId");
  const paymentCustomerId = searchParams.get("paymentCustomerId");

  const [activeTab, setActiveTab] = useState<TabId>("income");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<"income" | "expense" | "zreport" | null>(null);
  const [paymentDoc, setPaymentDoc] = useState<Awaited<ReturnType<typeof fetchFinanceDocumentById>>>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_INSTRUMENT_OPTIONS[0]);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<{ id: string; name: string } | null>(null);

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
      paymentPaidAmount: p.paymentPaidAmount ?? "",
      paymentInstrument: p.paymentInstrument ?? PAYMENT_INSTRUMENT_OPTIONS[0],
      paymentNotes: p.paymentNotes ?? "",
      payments:
        p.payments?.length > 0
          ? p.payments
          : [
              {
                id: newPaymentId(),
                instrument: p.paymentInstrument ?? PAYMENT_INSTRUMENT_OPTIONS[0],
                amount: p.paymentPaidAmount ?? "",
                notes: p.paymentNotes ?? "",
              },
            ],
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

  useEffect(() => {
    if (!paymentDocumentId) {
      queueMicrotask(() => {
        setPaymentDoc(null);
        setPaymentAmount("");
        setPaymentNotes("");
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      const row = await fetchFinanceDocumentById(paymentDocumentId);
      if (cancelled) return;
      setPaymentDoc(row);
      setPaymentAmount(row?.remaining_amount && row.remaining_amount > 0 ? String(row.remaining_amount) : "");
      setPaymentMethod(PAYMENT_INSTRUMENT_OPTIONS[0]);
      setPaymentNotes("");
      setActiveTab("income");
    })();

    return () => {
      cancelled = true;
    };
  }, [paymentDocumentId]);

  useEffect(() => {
    if (!paymentCustomerId) {
      queueMicrotask(() => {
        setPaymentCustomer(null);
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/customers/${encodeURIComponent(paymentCustomerId)}`, { credentials: "same-origin" });
      try {
        const j = (await res.json()) as { ok?: boolean; data?: { id: string; name: string } };
        if (cancelled || !j.ok || !j.data) return;
        setPaymentCustomer({ id: j.data.id, name: j.data.name });
        setPaymentAmount("");
        setPaymentMethod(PAYMENT_INSTRUMENT_OPTIONS[0]);
        setPaymentNotes("");
        setActiveTab("income");
      } catch {
        if (!cancelled) setPaymentCustomer(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paymentCustomerId]);

  const zGrandTotal = useMemo(() => {
    return (
      parseNum(cashTaxable) +
      parseNum(cashExempt) +
      parseNum(creditTaxable) +
      parseNum(creditExempt) +
      parseNum(transfers)
    );
  }, [cashTaxable, cashExempt, creditTaxable, creditExempt, transfers]);

  const [archiveFeedback, setArchiveFeedback] = useState<ReactNode>(null);

  const feedbackIsError = (node: ReactNode) =>
    typeof node === "string" &&
    (node.includes("שגיאה") ||
      node.includes("לא מוגדר") ||
      node.includes("נדרש") ||
      node.includes("לא יכול"));
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

  const triggerPdfForDocument = async (documentId: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/pdfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; pdfUrl?: string };
      if (j.ok && j.pdfUrl && /^https?:\/\//.test(j.pdfUrl)) return j.pdfUrl;
      return null;
    } catch {
      return null;
    }
  };

  const publishIncomeDoc = async () => {
    setPublishing(true);
    setArchiveFeedback(null);
    try {
      const docTotal = incomeExpenseGrandTotal(incomeForm);
      const paidVal = incomeForm.payments.reduce((sum, p) => sum + parseNum(p.amount), 0);
      if (paidVal > docTotal + 1e-6) {
        setArchiveFeedback("סכום התשלום לא יכול לעלות על סה״כ המסמך.");
        return;
      }

      const payload: IncomeExpensePayload = { ...incomeForm, kind: "income" };
      const title = `${incomeForm.documentType}${incomeForm.counterpartyName ? ` — ${incomeForm.counterpartyName}` : ""}`;

      if (editingDocId) {
        if (editingKind !== "income") {
          setArchiveFeedback("עריכה פעילה למסמך אחר — עברו לטאב המתאים או בטלו עריכה.");
          return;
        }
        const res = await updateFinanceDocument(editingDocId, {
          title,
          category: "הכנסה",
          doc_date: incomeForm.docDate || null,
          payload,
        });
        if (!res.ok) {
          setArchiveFeedback(res.error ?? "שגיאה בעדכון");
          return;
        }
        const pdfUrl = await triggerPdfForDocument(editingDocId);
        setArchiveFeedback(
          pdfUrl ? (
            <>
              המסמך עודכן בהצלחה.{" "}
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="underline">
                הפק PDF / הורדה
              </a>
            </>
          ) : (
            "המסמך עודכן בהצלחה."
          ),
        );
        clearEditMode();
        return;
      }

      const res = await insertFinanceDocument({
        title,
        category: "הכנסה",
        docDate: incomeForm.docDate || null,
        payload,
      });
      if (!res.ok || !res.id) {
        setArchiveFeedback(res.error ?? "שגיאה בשמירה");
        return;
      }
      const pdfUrl = await triggerPdfForDocument(res.id);
      setArchiveFeedback(
        pdfUrl ? (
          <>
            המסמך נשמר במערכת.{" "}
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="underline">
              הפק PDF / הורדה
            </a>
          </>
        ) : (
          "המסמך נשמר במערכת."
        ),
      );
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

  const submitCustomerOnlyPayment = async () => {
    if (!paymentCustomer) {
      setArchiveFeedback("לא ניתן לקלוט תשלום.");
      return;
    }

    const amount = parseNum(paymentAmount);
    if (amount <= 0) {
      setArchiveFeedback("נא להזין סכום תשלום חיובי.");
      return;
    }

    setSavingPayment(true);
    setArchiveFeedback(null);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: paymentCustomer.id,
          amount,
          paymentMethod,
          notes: paymentNotes.trim() || null,
        }),
        credentials: "same-origin",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setArchiveFeedback(json.error ?? "שגיאה בקליטת תשלום");
        return;
      }
      setPaymentAmount("");
      setPaymentNotes("");
      setArchiveFeedback("התשלום נקלט ועודכן בתזרים ובכרטסת.");
    } catch (e) {
      setArchiveFeedback(e instanceof Error ? e.message : "שגיאה בקליטת תשלום");
    } finally {
      setSavingPayment(false);
    }
  };

  const submitDocumentPayment = async () => {
    if (!paymentDoc?.customer_id) {
      setArchiveFeedback("לא ניתן לקלוט תשלום ללא לקוח מקושר למסמך.");
      return;
    }

    const amount = parseNum(paymentAmount);
    if (amount <= 0) {
      setArchiveFeedback("נא להזין סכום תשלום חיובי.");
      return;
    }

    if (amount > paymentDoc.remaining_amount + 1e-6) {
      setArchiveFeedback("סכום התשלום לא יכול לעלות על היתרה הפתוחה.");
      return;
    }

    setSavingPayment(true);
    setArchiveFeedback(null);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: paymentDoc.customer_id,
          documentId: paymentDoc.id,
          amount,
          paymentMethod,
          notes: paymentNotes.trim() || null,
        }),
        credentials: "same-origin",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setArchiveFeedback(json.error ?? "שגיאה בקליטת תשלום");
        return;
      }

      const updated = await fetchFinanceDocumentById(paymentDoc.id);
      setPaymentDoc(updated);
      setPaymentAmount(updated?.remaining_amount && updated.remaining_amount > 0 ? String(updated.remaining_amount) : "");
      setPaymentNotes("");
      setArchiveFeedback("התשלום נקלט ועודכן במסמך, בתזרים ובכרטסת.");
    } catch (e) {
      setArchiveFeedback(e instanceof Error ? e.message : "שגיאה בקליטת תשלום");
    } finally {
      setSavingPayment(false);
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

        {archiveFeedback != null && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${
              feedbackIsError(archiveFeedback)
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
            role="status"
          >
            {archiveFeedback}
          </div>
        )}

        {paymentCustomerId && paymentCustomer && (
          <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-bold text-cyan-950">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black text-cyan-800">קליטת תשלום ללקוח</p>
                <p className="mt-1 text-slate-900">{paymentCustomer.name}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[620px]">
                <label className="text-xs font-bold text-slate-700">
                  אמצעי תשלום
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    className="mt-1 block w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25"
                  >
                    {PAYMENT_INSTRUMENT_OPTIONS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  סכום
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    className="mt-1 block w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  הערה
                  <input
                    type="text"
                    value={paymentNotes}
                    onChange={(event) => setPaymentNotes(event.target.value)}
                    className="mt-1 block w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={savingPayment}
                onClick={() => void submitCustomerOnlyPayment()}
                className="rounded-xl bg-cyan-600 px-5 py-3 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {savingPayment ? "שומר…" : "קליטת תשלום"}
              </button>
            </div>
          </div>
        )}

        {paymentDocumentId && paymentDoc && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black text-amber-800">קליטת תשלום למסמך פתוח</p>
                <p className="mt-1 text-slate-900">
                  {paymentDoc.title} · {paymentDoc.customer_name ?? "לקוח"} · יתרה פתוחה{" "}
                  <span className="font-black">{formatShekel(paymentDoc.remaining_amount)}</span>
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[620px]">
                <label className="text-xs font-bold text-slate-700">
                  אמצעי תשלום
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    className="mt-1 block w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25"
                  >
                    {PAYMENT_INSTRUMENT_OPTIONS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  סכום
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    className="mt-1 block w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  הערה
                  <input
                    type="text"
                    value={paymentNotes}
                    onChange={(event) => setPaymentNotes(event.target.value)}
                    className="mt-1 block w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={savingPayment || paymentDoc.remaining_amount <= 0}
                onClick={() => void submitDocumentPayment()}
                className="rounded-xl bg-cyan-600 px-5 py-3 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {paymentDoc.remaining_amount <= 0 ? "שולם מלא" : savingPayment ? "שומר…" : "קליטת תשלום"}
              </button>
            </div>
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

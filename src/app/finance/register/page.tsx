"use client";

import { CheckCircle2, FileSpreadsheet, FileText, Loader2, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import {
  fetchFinanceDocumentById,
  insertFinanceDocument,
  updateFinanceDocument,
} from "@/lib/finance/db";
import {
  emptyIncomeExpensePayload,
  emptyZReportPayload,
  incomeExpenseGrandTotal,
  incomeExpenseTotalToPay,
  PAYMENT_METHOD_LABELS,
  PAYMENT_INSTRUMENT_OPTIONS,
  newPaymentId,
  paymentLinesTotal,
  type IncomeExpensePayload,
  type ZReportPayload,
} from "@/lib/finance/document-payload";
import { IncomeExpenseFields } from "@/app/finance/register/income-expense-fields";
import { formatShekel, parseNum } from "@/lib/format-shekel";

type TabId = "income" | "zreport" | "expenses";
type ModalTone = "income" | "expense" | "neutral" | "error";
type OperationModalState = {
  type: "success" | "error";
  tone: ModalTone;
  title: string;
  description: string;
  documentId?: string;
  amount?: number;
  date?: string;
  viewUrl?: string;
  nextTab?: TabId;
};

const tabs: { id: TabId; label: string }[] = [
  { id: "income", label: "מסמכי הכנסה ואירועים" },
  { id: "zreport", label: "דוח Z" },
  { id: "expenses", label: "רישום הוצאות" },
];

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function freshIncomeExpensePayload(kind: "income" | "expense"): IncomeExpensePayload {
  return { ...emptyIncomeExpensePayload(kind), docDate: todayInputValue() };
}

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

  const [incomeForm, setIncomeForm] = useState<IncomeExpensePayload>(() => freshIncomeExpensePayload("income"));
  const [expenseForm, setExpenseForm] = useState<IncomeExpensePayload>(() => freshIncomeExpensePayload("expense"));
  const [operationModal, setOperationModal] = useState<OperationModalState | null>(null);
  const [docPdfPreview, setDocPdfPreview] = useState<{ url: string; title: string } | null>(null);
  const [openingDocPdf, setOpeningDocPdf] = useState(false);

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

  const validatePaymentMethodsTotal = (payload: IncomeExpensePayload): string | null => {
    const docTotal = incomeExpenseTotalToPay(payload);
    const totalPaid = paymentLinesTotal(payload);
    if (totalPaid < -1e-6) {
      return "סכום תשלום לא יכול להיות שלילי.";
    }
    if (totalPaid > docTotal + 1e-6) {
      return "סכום אמצעי התשלום לא יכול לעלות על סה״כ המסמך.";
    }
    return null;
  };

  const showErrorModal = (description: string, tone: ModalTone = "error") => {
    setArchiveFeedback(null);
    setOperationModal({
      type: "error",
      tone,
      title: "המסמך לא נשמר",
      description: description || "נסה שוב.",
    });
  };

  const focusCounterparty = (kind: "income" | "expense") => {
    window.setTimeout(() => {
      document.getElementById(`${kind}-counterparty-name`)?.focus();
    }, 80);
  };

  const resetFormForNewDocument = (tab: TabId = "income") => {
    setEditingDocId(null);
    setEditingKind(null);
    setPaymentDoc(null);
    setPaymentCustomer(null);
    setPaymentAmount("");
    setPaymentMethod(PAYMENT_INSTRUMENT_OPTIONS[0]);
    setPaymentNotes("");
    setArchiveFeedback(null);
    setIncomeForm(freshIncomeExpensePayload("income"));
    setExpenseForm(freshIncomeExpensePayload("expense"));
    setActiveTab(tab);
    router.replace("/finance/register");
    if (tab === "income") focusCounterparty("income");
    if (tab === "expenses") focusCounterparty("expense");
  };

  const showSuccessModal = (params: {
    tone: Exclude<ModalTone, "error">;
    title: string;
    description: string;
    documentId?: string;
    amount?: number;
    date?: string;
    viewUrl?: string;
    nextTab?: TabId;
  }) => {
    setArchiveFeedback(null);
    setOperationModal({ type: "success", ...params });
  };

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

  const triggerPdfForDocument = async (documentId: string): Promise<{ ok: boolean; pdfUrl?: string; error?: string }> => {
    try {
      const res = await fetch("/api/pdfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; pdfUrl?: string; error?: string };
      if (!res.ok || !j.ok) return { ok: false, error: j.error ?? "יצירת PDF נכשלה" };
      return {
        ok: true,
        pdfUrl: j.pdfUrl && /^https?:\/\//.test(j.pdfUrl) ? j.pdfUrl : undefined,
      };
    } catch {
      return { ok: false, error: "יצירת PDF נכשלה" };
    }
  };

  const triggerPdfForPayment = async (paymentId: string): Promise<{ ok: boolean; pdfUrl?: string; error?: string }> => {
    try {
      const res = await fetch("/api/pdfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; pdfUrl?: string; error?: string };
      if (!res.ok || !j.ok) return { ok: false, error: j.error ?? "יצירת PDF נכשלה" };
      return {
        ok: true,
        pdfUrl: j.pdfUrl && /^https?:\/\//.test(j.pdfUrl) ? j.pdfUrl : undefined,
      };
    } catch {
      return { ok: false, error: "יצירת PDF נכשלה" };
    }
  };

  const openOrCreateDocumentPdf = async (documentId: string) => {
    setOpeningDocPdf(true);
    try {
      const latest = await fetch(`/api/reports/latest?relatedId=${encodeURIComponent(documentId)}`, {
        credentials: "same-origin",
      });
      const lj = (await latest.json()) as { data?: { publicUrl: string; fileName: string } | null };
      if (lj.data?.publicUrl) {
        setDocPdfPreview({ url: lj.data.publicUrl, title: lj.data.fileName });
        return;
      }
      const gen = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ entity: "document", relatedId: documentId }),
      });
      const gj = (await gen.json()) as { publicUrl?: string; pdfUrl?: string; ok?: boolean; error?: string };
      const url = gj.publicUrl ?? gj.pdfUrl;
      if (url) setDocPdfPreview({ url, title: `doc-${documentId.slice(0, 8)}.pdf` });
      else showErrorModal(gj.error ?? "יצירת PDF נכשלה", "neutral");
    } finally {
      setOpeningDocPdf(false);
    }
  };

  const publishIncomeDoc = async () => {
    setPublishing(true);
    setArchiveFeedback(null);
    try {
      const paymentError = validatePaymentMethodsTotal(incomeForm);
      if (paymentError) {
        showErrorModal(paymentError, "income");
        return;
      }

      const payload: IncomeExpensePayload = {
        ...incomeForm,
        kind: "income",
        includeDeposit: incomeForm.clientMode === "event" && incomeForm.includeDeposit,
        paymentMethods: incomeForm.payments,
      };
      const title = `${incomeForm.documentType}${incomeForm.counterpartyName ? ` — ${incomeForm.counterpartyName}` : ""}`;

      if (editingDocId) {
        if (editingKind !== "income") {
          showErrorModal("עריכה פעילה למסמך אחר — עברו לטאב המתאים או בטלו עריכה.", "income");
          return;
        }
        const res = await updateFinanceDocument(editingDocId, {
          title,
          category: "הכנסה",
          doc_date: incomeForm.docDate || null,
          payload,
        });
        if (!res.ok) {
          showErrorModal(res.error ?? "שגיאה בעדכון", "income");
          return;
        }
        const pdf = await triggerPdfForDocument(editingDocId);
        if (!pdf.ok) {
          showErrorModal(pdf.error ?? "המסמך נשמר, אבל יצירת PDF נכשלה.", "income");
          return;
        }
        showSuccessModal({
          tone: "income",
          title: "ההכנסה נשמרה בהצלחה",
          description: "המסמך נשמר במערכת ונכנס לתזרים המזומנים.",
          documentId: editingDocId,
          amount: incomeExpenseTotalToPay(payload),
          date: payload.docDate || todayInputValue(),
          viewUrl: pdf.pdfUrl,
          nextTab: "income",
        });
        resetFormForNewDocument("income");
        return;
      }

      const res = await insertFinanceDocument({
        title,
        category: "הכנסה",
        docDate: incomeForm.docDate || null,
        payload,
      });
      if (!res.ok || !res.id) {
        showErrorModal(res.error ?? "שגיאה בשמירה", "income");
        return;
      }
      const pdf = await triggerPdfForDocument(res.id);
      if (!pdf.ok) {
        showErrorModal(pdf.error ?? "המסמך נשמר, אבל יצירת PDF נכשלה.", "income");
        return;
      }
      showSuccessModal({
        tone: "income",
        title: "ההכנסה נשמרה בהצלחה",
        description: "המסמך נשמר במערכת ונכנס לתזרים המזומנים.",
        documentId: res.id,
        amount: incomeExpenseTotalToPay(payload),
        date: payload.docDate || todayInputValue(),
        viewUrl: pdf.pdfUrl,
        nextTab: "income",
      });
      resetFormForNewDocument("income");
    } catch (e) {
      showErrorModal(e instanceof Error ? e.message : "שגיאה בשמירה", "income");
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
          showErrorModal("עריכה פעילה למסמך אחר — עברו לטאב המתאים או בטלו עריכה.", "neutral");
          return;
        }
        const res = await updateFinanceDocument(editingDocId, {
          title,
          category: "דוח Z",
          doc_date: zDate || null,
          payload,
        });
        if (!res.ok) {
          showErrorModal(res.error ?? "שגיאה בעדכון", "neutral");
          return;
        }
        const pdf = await triggerPdfForDocument(editingDocId);
        if (!pdf.ok) {
          showErrorModal(pdf.error ?? "דוח Z נשמר, אבל יצירת PDF נכשלה.", "neutral");
          return;
        }
        showSuccessModal({
          tone: "neutral",
          title: "דוח Z נשמר בהצלחה",
          description: "המסמך נשמר במערכת ונכנס לתזרים המזומנים.",
          documentId: editingDocId,
          amount: zGrandTotal,
          date: zDate || todayInputValue(),
          viewUrl: pdf.pdfUrl,
          nextTab: "zreport",
        });
        resetZ();
        clearEditMode();
        return;
      }

      const res = await insertFinanceDocument({
        title,
        category: "דוח Z",
        docDate: zDate || null,
        payload,
      });
      if (!res.ok || !res.id) {
        showErrorModal(res.error ?? "שגיאה בשמירה", "neutral");
        return;
      }
      const pdf = await triggerPdfForDocument(res.id);
      if (!pdf.ok) {
        showErrorModal(pdf.error ?? "דוח Z נשמר, אבל יצירת PDF נכשלה.", "neutral");
        return;
      }
      showSuccessModal({
        tone: "neutral",
        title: "דוח Z נשמר בהצלחה",
        description: "המסמך נשמר במערכת ונכנס לתזרים המזומנים.",
        documentId: res.id,
        amount: zGrandTotal,
        date: zDate || todayInputValue(),
        viewUrl: pdf.pdfUrl,
        nextTab: "zreport",
      });
      resetZ();
    } catch (e) {
      showErrorModal(e instanceof Error ? e.message : "שגיאה בשמירה", "neutral");
    } finally {
      setPublishing(false);
    }
  };

  const publishExpenseDoc = async () => {
    setPublishing(true);
    setArchiveFeedback(null);
    try {
      const paymentError = validatePaymentMethodsTotal(expenseForm);
      if (paymentError) {
        showErrorModal(paymentError, "expense");
        return;
      }

      const payload: IncomeExpensePayload = {
        ...expenseForm,
        kind: "expense",
        includeDeposit: false,
        depositAmount: "",
        depositNote: "",
        paymentMethods: expenseForm.payments,
      };
      const title = `${expenseForm.documentType}${expenseForm.counterpartyName ? ` — ${expenseForm.counterpartyName}` : ""}`;

      if (editingDocId) {
        if (editingKind !== "expense") {
          showErrorModal("עריכה פעילה למסמך אחר — עברו לטאב המתאים או בטלו עריכה.", "expense");
          return;
        }
        const res = await updateFinanceDocument(editingDocId, {
          title,
          category: "הוצאה",
          doc_date: expenseForm.docDate || null,
          payload,
        });
        if (!res.ok) {
          showErrorModal(res.error ?? "שגיאה בעדכון", "expense");
          return;
        }
        const pdf = await triggerPdfForDocument(editingDocId);
        if (!pdf.ok) {
          showErrorModal(pdf.error ?? "המסמך נשמר, אבל יצירת PDF נכשלה.", "expense");
          return;
        }
        showSuccessModal({
          tone: "expense",
          title: "ההוצאה נשמרה בהצלחה",
          description: "המסמך נשמר במערכת ונכנס לתזרים המזומנים.",
          documentId: editingDocId,
          amount: incomeExpenseTotalToPay(payload),
          date: payload.docDate || todayInputValue(),
          viewUrl: pdf.pdfUrl,
          nextTab: "expenses",
        });
        resetFormForNewDocument("expenses");
        return;
      }

      const res = await insertFinanceDocument({
        title,
        category: "הוצאה",
        docDate: expenseForm.docDate || null,
        payload,
      });
      if (!res.ok || !res.id) {
        showErrorModal(res.error ?? "שגיאה בשמירה", "expense");
        return;
      }
      const pdf = await triggerPdfForDocument(res.id);
      if (!pdf.ok) {
        showErrorModal(pdf.error ?? "המסמך נשמר, אבל יצירת PDF נכשלה.", "expense");
        return;
      }
      showSuccessModal({
        tone: "expense",
        title: "ההוצאה נשמרה בהצלחה",
        description: "המסמך נשמר במערכת ונכנס לתזרים המזומנים.",
        documentId: res.id,
        amount: incomeExpenseTotalToPay(payload),
        date: payload.docDate || todayInputValue(),
        viewUrl: pdf.pdfUrl,
        nextTab: "expenses",
      });
      resetFormForNewDocument("expenses");
    } catch (e) {
      showErrorModal(e instanceof Error ? e.message : "שגיאה בשמירה", "expense");
    } finally {
      setPublishing(false);
    }
  };

  const submitCustomerOnlyPayment = async () => {
    if (!paymentCustomer) {
      showErrorModal("לא ניתן לקלוט תשלום.", "neutral");
      return;
    }

    const amount = parseNum(paymentAmount);
    if (amount <= 0) {
      showErrorModal("נא להזין סכום תשלום חיובי.", "neutral");
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
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: { id: string } };
      if (!json.ok || !json.data?.id) {
        showErrorModal(json.error ?? "שגיאה בקליטת תשלום", "neutral");
        return;
      }
      const pdf = await triggerPdfForPayment(json.data.id);
      if (!pdf.ok) {
        showErrorModal(pdf.error ?? "התשלום נקלט, אבל יצירת PDF נכשלה.", "neutral");
        return;
      }
      setPaymentAmount("");
      setPaymentNotes("");
      setPaymentMethod(PAYMENT_INSTRUMENT_OPTIONS[0]);
      showSuccessModal({
        tone: "neutral",
        title: "התשלום נשמר בהצלחה",
        description: "התשלום נקלט ועודכן בתזרים ובכרטסת.",
        documentId: json.data.id,
        amount,
        date: todayInputValue(),
        viewUrl: pdf.pdfUrl,
        nextTab: "income",
      });
    } catch (e) {
      showErrorModal(e instanceof Error ? e.message : "שגיאה בקליטת תשלום", "neutral");
    } finally {
      setSavingPayment(false);
    }
  };

  const submitDocumentPayment = async () => {
    if (!paymentDoc?.customer_id) {
      showErrorModal("לא ניתן לקלוט תשלום ללא לקוח מקושר למסמך.", "neutral");
      return;
    }

    const amount = parseNum(paymentAmount);
    if (amount <= 0) {
      showErrorModal("נא להזין סכום תשלום חיובי.", "neutral");
      return;
    }

    if (amount > paymentDoc.remaining_amount + 1e-6) {
      showErrorModal("סכום התשלום לא יכול לעלות על היתרה הפתוחה.", "neutral");
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
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: { id: string } };
      if (!json.ok || !json.data?.id) {
        showErrorModal(json.error ?? "שגיאה בקליטת תשלום", "neutral");
        return;
      }
      const pdf = await triggerPdfForPayment(json.data.id);
      if (!pdf.ok) {
        showErrorModal(pdf.error ?? "התשלום נקלט, אבל יצירת PDF נכשלה.", "neutral");
        return;
      }

      const updated = await fetchFinanceDocumentById(paymentDoc.id);
      setPaymentDoc(updated);
      setPaymentAmount(updated?.remaining_amount && updated.remaining_amount > 0 ? String(updated.remaining_amount) : "");
      setPaymentNotes("");
      setPaymentMethod(PAYMENT_INSTRUMENT_OPTIONS[0]);
      showSuccessModal({
        tone: "neutral",
        title: "התשלום נשמר בהצלחה",
        description: "התשלום נקלט ועודכן במסמך, בתזרים ובכרטסת.",
        documentId: json.data.id,
        amount,
        date: todayInputValue(),
        viewUrl: pdf.pdfUrl,
        nextTab: "income",
      });
    } catch (e) {
      showErrorModal(e instanceof Error ? e.message : "שגיאה בקליטת תשלום", "neutral");
    } finally {
      setSavingPayment(false);
    }
  };

  const inputClass =
    "mt-1 block h-11 min-h-[44px] w-full rounded-[16px] border border-slate-300 bg-white px-3 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

  const labelClass = "block text-[13px] font-bold text-slate-700";

  const btnPrimary =
    "inline-flex h-[42px] items-center justify-center rounded-[16px] px-[18px] text-sm font-bold transition disabled:opacity-50";

  const paymentFieldClass =
    "mt-1 block h-11 min-h-[44px] w-full rounded-[16px] border bg-white px-3 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

  const resetIncome = () => {
    setIncomeForm(freshIncomeExpensePayload("income"));
    focusCounterparty("income");
  };

  const resetExpense = () => {
    setExpenseForm(freshIncomeExpensePayload("expense"));
    focusCounterparty("expense");
  };

  const resetZ = () => {
    const z = emptyZReportPayload();
    setZDate(todayInputValue() || z.zDate);
    setZNumber(z.zNumber);
    setCashTaxable("");
    setCashExempt("");
    setCreditTaxable("");
    setCreditExempt("");
    setTransfers("");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-[14px]">
      <section className="app-panel mb-[14px] min-h-0 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[13px] font-bold tracking-[0.1em] text-cyan-700 opacity-90">
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden />
              רישום כספי
            </p>
            <h1 className="mt-2 text-[38px] font-black leading-tight tracking-tight text-slate-950">
              ניהול מסמכים ורישומים
            </h1>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-snug text-slate-600 opacity-75">
              רישום מסמכים נשמר כרשומות במערכת; פירוט תשלומים בדוח Z ושורות פריט עם מע״מ.
            </p>
          </div>
        </div>

        {editingDocId && (
          <div className="mt-3 rounded-[16px] border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-[13px] font-bold text-indigo-900" role="status">
            עריכת מסמך שמור — פרסום יעדכן את הרשומה במסד הנתונים.
            <button type="button" onClick={clearEditMode} className="me-4 mt-2 block text-xs underline sm:mt-0 sm:inline sm:me-0">
              ביטול עריכה
            </button>
          </div>
        )}

        {archiveFeedback != null && (
          <div
            className={`mt-3 rounded-[16px] border px-3 py-2.5 text-[13px] font-bold ${
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
          <div className="mt-3 rounded-[16px] border border-cyan-200 bg-cyan-50 px-3 py-3 text-[13px] font-bold text-cyan-950">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[13px] font-black text-cyan-800">קליטת תשלום ללקוח</p>
                <p className="mt-0.5 text-[15px] text-slate-900">{paymentCustomer.name}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
                <label className={labelClass}>
                  אמצעי תשלום
                  <select
                    disabled={savingPayment}
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    className={`${paymentFieldClass} border-cyan-200`}
                  >
                    {PAYMENT_INSTRUMENT_OPTIONS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  סכום
                  <input
                    disabled={savingPayment}
                    type="number"
                    min={0}
                    step="0.01"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    className={`${paymentFieldClass} border-cyan-200`}
                  />
                </label>
                <label className={labelClass}>
                  הערה
                  <input
                    disabled={savingPayment}
                    type="text"
                    value={paymentNotes}
                    onChange={(event) => setPaymentNotes(event.target.value)}
                    className={`${paymentFieldClass} border-cyan-200`}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={savingPayment}
                onClick={() => void submitCustomerOnlyPayment()}
                className={`${btnPrimary} shrink-0 bg-cyan-600 text-white hover:bg-cyan-700`}
              >
                {savingPayment ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    שומר…
                  </span>
                ) : (
                  "קליטת תשלום"
                )}
              </button>
            </div>
          </div>
        )}

        {paymentDocumentId && paymentDoc && (
          <div className="mt-3 rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] font-bold text-amber-900">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-[13px] font-black text-amber-800">קליטת תשלום למסמך פתוח</p>
                <p className="mt-0.5 text-[15px] text-slate-900">
                  {paymentDoc.title} · {paymentDoc.customer_name ?? "לקוח"} · יתרה פתוחה{" "}
                  <span className="font-black">{formatShekel(paymentDoc.remaining_amount)}</span>
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
                <label className={labelClass}>
                  אמצעי תשלום
                  <select
                    disabled={savingPayment}
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    className={`${paymentFieldClass} border-amber-200`}
                  >
                    {PAYMENT_INSTRUMENT_OPTIONS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  סכום
                  <input
                    disabled={savingPayment}
                    type="number"
                    min={0}
                    step="0.01"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    className={`${paymentFieldClass} border-amber-200`}
                  />
                </label>
                <label className={labelClass}>
                  הערה
                  <input
                    disabled={savingPayment}
                    type="text"
                    value={paymentNotes}
                    onChange={(event) => setPaymentNotes(event.target.value)}
                    className={`${paymentFieldClass} border-amber-200`}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={savingPayment || paymentDoc.remaining_amount <= 0}
                onClick={() => void submitDocumentPayment()}
                className={`${btnPrimary} shrink-0 bg-cyan-600 text-white hover:bg-cyan-700`}
              >
                {paymentDoc.remaining_amount <= 0 ? (
                  "שולם מלא"
                ) : savingPayment ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    שומר…
                  </span>
                ) : (
                  "קליטת תשלום"
                )}
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-[52px] rounded-2xl border px-[22px] text-[15px] font-bold transition ${
                  isActive
                    ? "border-luxury-gold bg-luxury-gold text-luxury-charcoal shadow-sm"
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
            disabled={publishing}
            counterpartyInputId="income-counterparty-name"
          />

          <div className="flex flex-wrap gap-3 px-0">
            {editingDocId && editingKind === "income" ? (
              <button
                type="button"
                disabled={publishing || openingDocPdf}
                onClick={() => {
                  if (editingDocId) void openOrCreateDocumentPdf(editingDocId);
                }}
                className={`${btnPrimary} gap-2 border border-indigo-200 bg-indigo-50 text-indigo-950 hover:bg-indigo-100`}
              >
                {openingDocPdf ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                הפק PDF
              </button>
            ) : null}
            <button
              type="button"
              onClick={resetIncome}
              disabled={publishing}
              className={`${btnPrimary} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
            >
              איפוס טופס
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={() => void publishIncomeDoc()}
              className={`${btnPrimary} bg-cyan-600 text-white hover:bg-cyan-700`}
            >
              {publishing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  שומר…
                </span>
              ) : editingDocId ? (
                "עדכון מסמך"
              ) : (
                "פרסום מסמך"
              )}
            </button>
          </div>
        </>
      )}

      {activeTab === "zreport" && (
        <section className="app-panel mb-[14px] p-[18px]">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-cyan-600" aria-hidden />
            <h2 className="text-[22px] font-extrabold text-slate-950">דוח Z קופה</h2>
          </div>
          <p className="mt-1 text-[13px] text-slate-600 opacity-70">פירוט סיכומי תשלום יומי; הסכום הכולל מחושב אוטומטית.</p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
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

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

          <div className="mt-3 rounded-[16px] border border-emerald-200 bg-emerald-50/70 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] font-black text-emerald-900">סה״כ דוח Z</span>
              <span className="text-[28px] font-black tabular-nums text-slate-950">{formatShekel(zGrandTotal)}</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-3">
            {editingDocId && editingKind === "zreport" ? (
              <button
                type="button"
                disabled={publishing || openingDocPdf}
                onClick={() => {
                  if (editingDocId) void openOrCreateDocumentPdf(editingDocId);
                }}
                className={`${btnPrimary} gap-2 border border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100`}
              >
                {openingDocPdf ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                הפק דוח PDF
              </button>
            ) : null}
            <button
              type="button"
              onClick={resetZ}
              disabled={publishing}
              className={`${btnPrimary} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
            >
              איפוס טופס
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={() => void publishZDoc()}
              className={`${btnPrimary} bg-luxury-gold text-luxury-charcoal shadow-sm hover:bg-luxury-gold-hover`}
            >
              {publishing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  שומר…
                </span>
              ) : editingDocId ? (
                "עדכון דוח Z"
              ) : (
                "שמירת דוח Z"
              )}
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
            disabled={publishing}
            counterpartyInputId="expense-counterparty-name"
          />

          <div className="flex flex-wrap gap-3 px-0">
            {editingDocId && editingKind === "expense" ? (
              <button
                type="button"
                disabled={publishing || openingDocPdf}
                onClick={() => {
                  if (editingDocId) void openOrCreateDocumentPdf(editingDocId);
                }}
                className={`${btnPrimary} gap-2 border border-indigo-200 bg-indigo-50 text-indigo-950 hover:bg-indigo-100`}
              >
                {openingDocPdf ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                הפק PDF
              </button>
            ) : null}
            <button
              type="button"
              onClick={resetExpense}
              disabled={publishing}
              className={`${btnPrimary} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
            >
              איפוס טופס
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={() => void publishExpenseDoc()}
              className={`${btnPrimary} bg-luxury-gold text-luxury-charcoal shadow-sm hover:bg-luxury-gold-hover`}
            >
              {publishing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  שומר…
                </span>
              ) : editingDocId ? (
                "עדכון מסמך"
              ) : (
                "פרסום מסמך"
              )}
            </button>
          </div>
        </>
      )}

      {operationModal ? (
        <OperationResultModal
          state={operationModal}
          onClose={() => setOperationModal(null)}
          onNewDocument={() => {
            const nextTab = operationModal.nextTab ?? "income";
            setOperationModal(null);
            resetFormForNewDocument(nextTab);
          }}
        />
      ) : null}

      <PdfPreviewModal
        open={Boolean(docPdfPreview?.url)}
        url={docPdfPreview?.url ?? ""}
        title={docPdfPreview?.title ?? ""}
        onClose={() => setDocPdfPreview(null)}
      />
    </div>
  );
}

function OperationResultModal({
  state,
  onClose,
  onNewDocument,
}: {
  state: OperationModalState;
  onClose: () => void;
  onNewDocument: () => void;
}) {
  const isSuccess = state.type === "success";
  const tone =
    state.tone === "expense"
      ? {
          ring: "ring-rose-200",
          iconBg: "bg-rose-50",
          iconText: "text-rose-600",
          primary: "bg-rose-600 text-white hover:bg-rose-700",
        }
      : state.tone === "income"
        ? {
            ring: "ring-emerald-200",
            iconBg: "bg-emerald-50",
            iconText: "text-emerald-600",
            primary: "bg-emerald-600 text-white hover:bg-emerald-700",
          }
        : isSuccess
          ? {
              ring: "ring-emerald-200",
              iconBg: "bg-emerald-50",
              iconText: "text-emerald-600",
              primary: "bg-luxury-gold text-luxury-charcoal hover:bg-luxury-gold-hover",
            }
          : {
              ring: "ring-rose-200",
              iconBg: "bg-rose-50",
              iconText: "text-rose-600",
              primary: "bg-rose-600 text-white hover:bg-rose-700",
            };

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className={`w-full max-w-md scale-100 rounded-3xl bg-white p-6 text-center shadow-2xl ring-1 ${tone.ring} animate-in fade-in zoom-in duration-200`}>
        <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${tone.iconBg}`}>
          {isSuccess ? (
            <CheckCircle2 className={`h-12 w-12 ${tone.iconText} animate-bounce`} aria-hidden />
          ) : (
            <XCircle className={`h-12 w-12 ${tone.iconText}`} aria-hidden />
          )}
        </div>
        <h2 className="mt-5 text-2xl font-black text-slate-950">{state.title}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{state.description}</p>

        {isSuccess ? (
          <dl className="mt-5 grid grid-cols-1 gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-right text-sm">
            {state.documentId ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="font-bold text-slate-500">מספר מסמך</dt>
                <dd className="font-black text-slate-900">{state.documentId.slice(-8)}</dd>
              </div>
            ) : null}
            {state.amount !== undefined ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="font-bold text-slate-500">סכום</dt>
                <dd className="font-black text-slate-900">{formatShekel(state.amount)}</dd>
              </div>
            ) : null}
            {state.date ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="font-bold text-slate-500">תאריך</dt>
                <dd className="font-black text-slate-900">{state.date}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={isSuccess ? onNewDocument : onClose}
            className={`rounded-xl px-5 py-3 text-sm font-black shadow-sm transition ${tone.primary}`}
          >
            {isSuccess ? "הזמנה חדשה" : "נסה שוב"}
          </button>
          {isSuccess ? (
            <a
              href={state.viewUrl ?? "/finance/archive"}
              target={state.viewUrl ? "_blank" : undefined}
              rel={state.viewUrl ? "noopener noreferrer" : undefined}
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              צפייה במסמך
            </a>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              סגירה
            </button>
          )}
        </div>
      </div>
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

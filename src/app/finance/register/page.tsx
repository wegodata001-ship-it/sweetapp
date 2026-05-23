"use client";

import { CheckCircle2, FileSpreadsheet, FileText, Loader2, ScanLine, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import {
  ExpenseScanDialog,
  type ScannedDocumentDto,
} from "@/components/expense-scan-dialog";
import {
  fetchFinanceDocumentById,
  insertFinanceDocument,
  updateFinanceDocument,
} from "@/lib/finance/db";
import { normalizeExpenseType } from "@/lib/finance/expense-types";
import {
  emptyIncomeExpensePayload,
  emptyZReportPayload,
  incomeExpenseTotalToPay,
  isWorkerExpensePayload,
  normalizeWorkerExpensePayload,
  workerPayAmountNum,
  newLineId,
  PAYMENT_METHOD_LABELS,
  PAYMENT_INSTRUMENT_OPTIONS,
  newPaymentId,
  paymentLinesTotal,
  type FinanceLineItemPayload,
  type IncomeExpensePayload,
  type ZReportPayload,
} from "@/lib/finance/document-payload";
import { IncomeExpenseFields } from "@/app/finance/register/income-expense-fields";
import { useToast } from "@/components/toast-provider";
import { useI18n } from "@/components/i18n-provider";
import {
  enqueueDocumentPdf,
  enqueuePaymentPdf,
  pollDocumentPdf,
  pollPaymentPdf,
  type PdfQueueStatus,
} from "@/lib/finance/register-pdf-queue";
import { REGISTER_LABEL_KEYS as LK } from "@/lib/i18n/register-label-keys";
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
  pdfStatus?: PdfQueueStatus;
  nextTab?: TabId;
};

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function freshIncomeExpensePayload(kind: "income" | "expense"): IncomeExpensePayload {
  return { ...emptyIncomeExpensePayload(kind), docDate: todayInputValue() };
}

function FinanceRegisterPageInner() {
  const { t, bcp47, locale } = useI18n();
  const { showToast } = useToast();
  void bcp47;
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const paymentDocumentId = searchParams.get("paymentDocumentId");
  const paymentCustomerId = searchParams.get("paymentCustomerId");
  const tabParam = searchParams.get("tab");
  const scanParam = searchParams.get("scan");

  const tabs = useMemo(
    () =>
      [
        { id: "income" as const, label: t(LK.tabEvent) },
        { id: "zreport" as const, label: t(LK.tabZreport) },
        { id: "expenses" as const, label: t(LK.tabExpenses) },
      ],
    [t, locale],
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.log("[register labels]", locale, {
      title: t(LK.title),
      tabEvent: t(LK.tabEvent),
      clientGeneral: t(LK.clientGeneral),
      clientEvent: t(LK.clientEvent),
      expenseHeading: t(LK.expenseHeading),
    });
  }, [locale, t]);

  const [activeTab, setActiveTab] = useState<TabId>("income");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<"income" | "expense" | "zreport" | null>(null);
  const [paymentDoc, setPaymentDoc] = useState<Awaited<ReturnType<typeof fetchFinanceDocumentById>>>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_INSTRUMENT_OPTIONS[0]);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<{ id: string; name: string } | null>(null);

  // שדות צ'ק (מוצגים רק כש־paymentMethod === "CHECK")
  const [checkNumber, setCheckNumber] = useState("");
  const [checkBankName, setCheckBankName] = useState("");
  const [checkBranch, setCheckBranch] = useState("");
  const [checkDueDate, setCheckDueDate] = useState("");
  const resetCheckFields = () => {
    setCheckNumber("");
    setCheckBankName("");
    setCheckBranch("");
    setCheckDueDate("");
  };
  const buildCheckPayload = () => {
    if (paymentMethod !== "CHECK") return undefined;
    return {
      checkNumber: checkNumber.trim(),
      bankName: checkBankName.trim(),
      branch: checkBranch.trim() || null,
      dueDate: checkDueDate,
      notes: paymentNotes.trim() || null,
    };
  };
  const validateCheckFields = (): string | null => {
    if (paymentMethod !== "CHECK") return null;
    if (!checkNumber.trim()) return t("register.validations.checkNumberRequired");
    if (!checkBankName.trim()) return t("register.validations.checkBankRequired");
    if (!checkDueDate) return t("register.validations.checkDueDateRequired");
    return null;
  };

  const [incomeForm, setIncomeForm] = useState<IncomeExpensePayload>(() => freshIncomeExpensePayload("income"));
  const [expenseForm, setExpenseForm] = useState<IncomeExpensePayload>(() => freshIncomeExpensePayload("expense"));
  const [operationModal, setOperationModal] = useState<OperationModalState | null>(null);
  const [docPdfPreview, setDocPdfPreview] = useState<{ url: string; title: string } | null>(null);
  const [openingDocPdf, setOpeningDocPdf] = useState(false);
  const [scanDialogOpen, setScanDialogOpen] = useState(scanParam === "1");

  useEffect(() => {
    if (tabParam === "expenses") {
      setActiveTab("expenses");
    }
  }, [tabParam]);

  const applyScannedDocument = useCallback((doc: ScannedDocumentDto) => {
    const fallbackId = () => newLineId();
    const lines: FinanceLineItemPayload[] =
      doc.items.length > 0
        ? doc.items.map((it) => ({
            id: fallbackId(),
            itemName: it.name || it.rawName || "",
            quantity: String(it.quantity || 1),
            price: String(it.unitPrice || 0),
            supplierProductId: it.supplierProductId ?? null,
            vatMode: "includes_vat",
            priceFlag:
              it.priceFlagKey && it.priceFlagKey !== null
                ? {
                    regularPrice: it.regularPrice ?? null,
                    samples: it.regularPriceSamples ?? 0,
                    flag: it.priceFlagKey,
                  }
                : null,
          }))
        : [
            {
              id: fallbackId(),
              itemName: "",
              quantity: "1",
              price: doc.total ? String(doc.total) : "",
              vatMode: "includes_vat",
            },
          ];
    setExpenseForm((prev) => ({
      ...prev,
      supplierId: doc.supplierId ?? prev.supplierId ?? null,
      counterpartyName: doc.supplierName || doc.supplierRawName || prev.counterpartyName,
      docDate: doc.date || prev.docDate,
      documentType: doc.documentType || prev.documentType,
      lines,
      receiptFileUrl: doc.receiptFileUrl ?? prev.receiptFileUrl ?? null,
      receiptFileName: doc.receiptFileName ?? prev.receiptFileName ?? null,
    }));
    setActiveTab("expenses");
  }, []);

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
      ...(p.kind === "expense" ? { expenseType: normalizeExpenseType(p.expenseType) } : {}),
      supplierId: p.supplierId ?? null,
      employeeId: p.employeeId ?? null,
      employeePayType: p.employeePayType ?? "salary",
      employeePayAmount: p.employeePayAmount ?? p.lines[0]?.price ?? "",
      employeePayNotes: p.employeePayNotes ?? p.lines[0]?.lineNote ?? "",
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
        supplierProductId: l.supplierProductId ?? null,
        lineNote: l.lineNote ?? "",
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
    queueMicrotask(() => {
      setPaymentDoc(null);
      setPaymentAmount("");
      setPaymentNotes("");
    });
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
    queueMicrotask(() => {
      setPaymentCustomer(null);
      setPaymentAmount("");
      setPaymentNotes("");
    });
    void (async () => {
      const res = await fetch(`/api/customers/${encodeURIComponent(paymentCustomerId)}`, { credentials: "same-origin", cache: "no-store" });
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
      return t("register.validations.paymentNegative");
    }
    if (totalPaid > docTotal + 1e-6) {
      return t("register.validations.paymentExceedsTotal");
    }
    for (const line of payload.payments ?? []) {
      if (line.instrument !== "CHECK") continue;
      const c = line.check;
      if (!c) return t("register.check.missingFields");
      if (!c.checkNumber.trim() || !c.bankName.trim() || !c.dueDate.trim()) {
        return t("register.check.missingFields");
      }
    }
    return null;
  };

  const showErrorModal = (description: string, tone: ModalTone = "error") => {
    setArchiveFeedback(null);
    setOperationModal({
      type: "error",
      tone,
      title: t("register.modal.docNotSaved"),
      description: description || t("register.modal.tryAgain"),
    });
  };

  const focusCounterparty = (kind: "income" | "expense") => {
    window.setTimeout(() => {
      document.getElementById(`${kind}-counterparty-name`)?.focus();
    }, 80);
  };

  const resetFormForNewDocument = (tab: TabId = "income", opts?: { keepRoute?: boolean }) => {
    const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
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
    if (!opts?.keepRoute) {
      router.replace("/finance/register");
    }
    try {
      localStorage.removeItem("wego-register-expense-draft");
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    }
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
    pdfStatus?: PdfQueueStatus;
    nextTab?: TabId;
  }) => {
    setArchiveFeedback(null);
    setOperationModal({ type: "success", ...params });
  };

  /** שמירה הושלמה — PDF ברקע, toast מיידי */
  const finishDocumentSaveWithBackgroundPdf = (
    documentId: string,
    modal: {
      tone: Exclude<ModalTone, "error">;
      title: string;
      description: string;
      amount?: number;
      date?: string;
      nextTab?: TabId;
    },
  ) => {
    showToast({
      tone: "success",
      title: "המסמך נשמר בהצלחה",
      description: "מייצר PDF ברקע…",
      durationMs: 4500,
    });
    showSuccessModal({ ...modal, documentId, pdfStatus: "processing" });
    enqueueDocumentPdf(documentId);
    pollDocumentPdf(documentId, (u) => {
      setOperationModal((prev) =>
        prev?.documentId === documentId && prev.type === "success"
          ? { ...prev, pdfStatus: u.status, viewUrl: u.pdfUrl ?? prev.viewUrl }
          : prev,
      );
    });
  };

  const finishPaymentSaveWithBackgroundPdf = (
    paymentId: string,
    modal: {
      tone: Exclude<ModalTone, "error">;
      title: string;
      description: string;
      amount?: number;
      date?: string;
      nextTab?: TabId;
    },
  ) => {
    showToast({
      tone: "success",
      title: "התשלום נשמר בהצלחה",
      durationMs: 4000,
    });
    showSuccessModal({ ...modal, documentId: paymentId, pdfStatus: "processing" });
    enqueuePaymentPdf(paymentId);
    pollPaymentPdf(paymentId, (u) => {
      setOperationModal((prev) =>
        prev?.documentId === paymentId && prev.type === "success"
          ? { ...prev, pdfStatus: u.status, viewUrl: u.pdfUrl ?? prev.viewUrl }
          : prev,
      );
    });
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

  const openOrCreateDocumentPdf = (documentId: string) => {
    setOpeningDocPdf(true);
    void (async () => {
      try {
        const latest = await fetch(`/api/reports/latest?relatedId=${encodeURIComponent(documentId)}`, {
          credentials: "same-origin",
        });
        const lj = (await latest.json()) as { data?: { publicUrl: string; fileName: string } | null };
        if (lj.data?.publicUrl) {
          setDocPdfPreview({ url: lj.data.publicUrl, title: lj.data.fileName });
          setOpeningDocPdf(false);
          return;
        }
        enqueueDocumentPdf(documentId);
        pollDocumentPdf(documentId, (u) => {
          if (u.status === "ready" && u.pdfUrl) {
            setDocPdfPreview({ url: u.pdfUrl, title: `doc-${documentId.slice(0, 8)}.pdf` });
            setOpeningDocPdf(false);
          } else if (u.status === "failed") {
            showErrorModal(t("register.errors.pdfFailed"), "neutral");
            setOpeningDocPdf(false);
          }
        });
      } catch {
        showErrorModal(t("register.errors.pdfFailed"), "neutral");
        setOpeningDocPdf(false);
      }
    })();
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
          showErrorModal(t("register.modal.editConflict"), "income");
          return;
        }
        const res = await updateFinanceDocument(editingDocId, {
          title,
          category: "הכנסה",
          doc_date: incomeForm.docDate || null,
          payload,
        });
        if (!res.ok) {
          showErrorModal(res.error ?? t("register.errors.updateFailed"), "income");
          return;
        }
        finishDocumentSaveWithBackgroundPdf(editingDocId, {
          tone: "income",
          title: t("register.modal.incomeSaved"),
          description: t("register.modal.docSavedToCashflow"),
          amount: incomeExpenseTotalToPay(payload),
          date: payload.docDate || todayInputValue(),
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
        showErrorModal(res.error ?? t("register.errors.saveFailed"), "income");
        return;
      }
      finishDocumentSaveWithBackgroundPdf(res.id, {
        tone: "income",
        title: t("register.modal.incomeSaved"),
        description: t("register.modal.docSavedToCashflow"),
        amount: incomeExpenseTotalToPay(payload),
        date: payload.docDate || todayInputValue(),
        nextTab: "income",
      });
      resetFormForNewDocument("income");
    } catch (e) {
      showErrorModal(e instanceof Error ? e.message : t("register.errors.saveFailed"), "income");
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
          showErrorModal(t("register.modal.editConflict"), "neutral");
          return;
        }
        const res = await updateFinanceDocument(editingDocId, {
          title,
          category: "דוח Z",
          doc_date: zDate || null,
          payload,
        });
        if (!res.ok) {
          showErrorModal(res.error ?? t("register.errors.updateFailed"), "neutral");
          return;
        }
        finishDocumentSaveWithBackgroundPdf(editingDocId, {
          tone: "neutral",
          title: t("register.modal.zSaved"),
          description: t("register.modal.docSavedToCashflow"),
          amount: zGrandTotal,
          date: zDate || todayInputValue(),
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
        showErrorModal(res.error ?? t("register.errors.saveFailed"), "neutral");
        return;
      }
      finishDocumentSaveWithBackgroundPdf(res.id, {
        tone: "neutral",
        title: t("register.modal.zSaved"),
        description: t("register.modal.docSavedToCashflow"),
        amount: zGrandTotal,
        date: zDate || todayInputValue(),
        nextTab: "zreport",
      });
      resetZ();
    } catch (e) {
      showErrorModal(e instanceof Error ? e.message : t("register.errors.saveFailed"), "neutral");
    } finally {
      setPublishing(false);
    }
  };

  const publishExpenseDoc = async () => {
    setPublishing(true);
    setArchiveFeedback(null);
    try {
      const prepared = normalizeWorkerExpensePayload({
        ...expenseForm,
        kind: "expense",
      });
      if (isWorkerExpensePayload(prepared)) {
        if (!prepared.employeeId?.trim()) {
          showErrorModal(t("register.employeePay.validationEmployee"), "expense");
          return;
        }
        if (workerPayAmountNum(prepared) < 1e-6) {
          showErrorModal(t("register.employeePay.validationAmount"), "expense");
          return;
        }
      }

      const paymentError = validatePaymentMethodsTotal(prepared);
      if (paymentError) {
        showErrorModal(paymentError, "expense");
        return;
      }

      const payload: IncomeExpensePayload = {
        ...prepared,
        includeDeposit: false,
        depositAmount: "",
        depositNote: "",
        paymentMethods: prepared.payments,
      };
      const title = `${payload.documentType}${payload.counterpartyName ? ` — ${payload.counterpartyName}` : ""}`;

      if (editingDocId) {
        if (editingKind !== "expense") {
          showErrorModal(t("register.modal.editConflict"), "expense");
          return;
        }
        const res = await updateFinanceDocument(editingDocId, {
          title,
          category: "הוצאה",
          doc_date: payload.docDate || null,
          payload,
        });
        if (!res.ok) {
          showErrorModal(res.error ?? t("register.errors.updateFailed"), "expense");
          return;
        }
        finishDocumentSaveWithBackgroundPdf(editingDocId, {
          tone: "expense",
          title: t("register.modal.expenseSaved"),
          description: t("register.modal.docSavedToCashflow"),
          amount: incomeExpenseTotalToPay(payload),
          date: payload.docDate || todayInputValue(),
          nextTab: "expenses",
        });
        resetFormForNewDocument("expenses");
        return;
      }

      const res = await insertFinanceDocument({
        title,
        category: "הוצאה",
        docDate: payload.docDate || null,
        payload,
      });
      if (!res.ok || !res.id) {
        showErrorModal(res.error ?? t("register.errors.saveFailed"), "expense");
        return;
      }
      finishDocumentSaveWithBackgroundPdf(res.id, {
        tone: "expense",
        title: t("register.modal.expenseSaved"),
        description: t("register.modal.docSavedToCashflow"),
        amount: incomeExpenseTotalToPay(payload),
        date: payload.docDate || todayInputValue(),
        nextTab: "expenses",
      });
      resetFormForNewDocument("expenses", { keepRoute: true });
    } catch (e) {
      showErrorModal(e instanceof Error ? e.message : t("register.errors.saveFailed"), "expense");
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "expenses" || editingDocId) return;
    const tmr = window.setTimeout(() => {
      try {
        localStorage.setItem("wego-register-expense-draft", JSON.stringify(expenseForm));
      } catch {
        /* ignore */
      }
    }, 400);
    return () => window.clearTimeout(tmr);
  }, [expenseForm, activeTab, editingDocId]);

  useEffect(() => {
    if (editId) return;
    try {
      const raw = localStorage.getItem("wego-register-expense-draft");
      if (!raw) return;
      const parsed = JSON.parse(raw) as IncomeExpensePayload;
      if (parsed?.kind === "expense") {
        setExpenseForm(fixIncomeExpense(parsed));
      }
    } catch {
      /* ignore */
    }
  }, [editId, fixIncomeExpense]);

  const submitCustomerOnlyPayment = async () => {
    if (!paymentCustomer) {
      showErrorModal(t("register.validations.cannotAcceptPayment"), "neutral");
      return;
    }

    const amount = parseNum(paymentAmount);
    if (amount <= 0) {
      showErrorModal(t("register.validations.paymentAmountPositive"), "neutral");
      return;
    }
    const checkErr = validateCheckFields();
    if (checkErr) {
      showErrorModal(checkErr, "neutral");
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
          check: buildCheckPayload(),
        }),
        credentials: "same-origin",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: { id: string } };
      if (!json.ok || !json.data?.id) {
        showErrorModal(json.error ?? t("register.errors.paymentFailed"), "neutral");
        return;
      }
      setPaymentAmount("");
      setPaymentNotes("");
      setPaymentMethod(PAYMENT_INSTRUMENT_OPTIONS[0]);
      resetCheckFields();
      finishPaymentSaveWithBackgroundPdf(json.data.id, {
        tone: "neutral",
        title: t("register.modal.paymentSaved"),
        description: t("register.modal.paymentSavedDescription"),
        amount,
        date: todayInputValue(),
        nextTab: "income",
      });
    } catch (e) {
      showErrorModal(e instanceof Error ? e.message : t("register.errors.paymentFailed"), "neutral");
    } finally {
      setSavingPayment(false);
    }
  };

  const submitDocumentPayment = async () => {
    if (!paymentDoc?.customer_id) {
      showErrorModal(t("register.validations.paymentNeedsCustomer"), "neutral");
      return;
    }

    const amount = parseNum(paymentAmount);
    if (amount <= 0) {
      showErrorModal(t("register.validations.paymentAmountPositive"), "neutral");
      return;
    }

    if (amount > paymentDoc.remaining_amount + 1e-6) {
      showErrorModal(t("register.validations.paymentExceedsRemaining"), "neutral");
      return;
    }
    const checkErr = validateCheckFields();
    if (checkErr) {
      showErrorModal(checkErr, "neutral");
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
          check: buildCheckPayload(),
        }),
        credentials: "same-origin",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: { id: string } };
      if (!json.ok || !json.data?.id) {
        showErrorModal(json.error ?? t("register.errors.paymentFailed"), "neutral");
        return;
      }
      const updated = await fetchFinanceDocumentById(paymentDoc.id);
      setPaymentDoc(updated);
      setPaymentAmount(updated?.remaining_amount && updated.remaining_amount > 0 ? String(updated.remaining_amount) : "");
      setPaymentNotes("");
      setPaymentMethod(PAYMENT_INSTRUMENT_OPTIONS[0]);
      resetCheckFields();
      finishPaymentSaveWithBackgroundPdf(json.data.id, {
        tone: "neutral",
        title: t("register.modal.paymentSaved"),
        description: t("register.modal.paymentSavedDocDescription"),
        amount,
        date: todayInputValue(),
        nextTab: "income",
      });
    } catch (e) {
      showErrorModal(e instanceof Error ? e.message : t("register.errors.paymentFailed"), "neutral");
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
              {t(LK.title)}
            </p>
            <h1 className="mt-2 text-[38px] font-black leading-tight tracking-tight text-slate-950">
              {t(LK.heading)}
            </h1>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-snug text-slate-600 opacity-75">
              {t("register.intro")}
            </p>
          </div>
        </div>

        {editingDocId && (
          <div className="mt-3 rounded-[16px] border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-[13px] font-bold text-indigo-900" role="status">
            {t("register.editBanner")}
            <button type="button" onClick={clearEditMode} className="me-4 mt-2 block text-xs underline sm:mt-0 sm:inline sm:me-0">
              {t("register.cancelEdit")}
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
                <p className="text-[13px] font-black text-cyan-800">{t("register.payment.customerPaymentTitle")}</p>
                <p className="mt-0.5 text-[15px] text-slate-900">{paymentCustomer.name}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
                <label className={labelClass}>
                  {t("register.fields.paymentMethod")}
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
                  {t("common.amount")}
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
                  {t("register.payment.note")}
                  <input
                    disabled={savingPayment}
                    type="text"
                    value={paymentNotes}
                    onChange={(event) => setPaymentNotes(event.target.value)}
                    className={`${paymentFieldClass} border-cyan-200`}
                  />
                </label>
              </div>
              {paymentMethod === "CHECK" && (
                <div className="mt-2 grid w-full gap-2 rounded-[14px] border border-cyan-300 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className={labelClass}>
                    {t("register.fields.checkNumber")}
                    <input
                      disabled={savingPayment}
                      type="text"
                      value={checkNumber}
                      onChange={(event) => setCheckNumber(event.target.value)}
                      className={`${paymentFieldClass} border-cyan-300`}
                      placeholder="000000"
                    />
                  </label>
                  <label className={labelClass}>
                    {t("register.payment.bank")}
                    <input
                      disabled={savingPayment}
                      type="text"
                      value={checkBankName}
                      onChange={(event) => setCheckBankName(event.target.value)}
                      className={`${paymentFieldClass} border-cyan-300`}
                      placeholder={t("register.payment.bankPlaceholder")}
                    />
                  </label>
                  <label className={labelClass}>
                    {t("register.fields.checkBranch")}
                    <input
                      disabled={savingPayment}
                      type="text"
                      value={checkBranch}
                      onChange={(event) => setCheckBranch(event.target.value)}
                      className={`${paymentFieldClass} border-cyan-300`}
                      placeholder="000"
                    />
                  </label>
                  <label className={labelClass}>
                    {t("register.fields.dueDate")}
                    <input
                      disabled={savingPayment}
                      type="date"
                      value={checkDueDate}
                      onChange={(event) => setCheckDueDate(event.target.value)}
                      className={`${paymentFieldClass} border-cyan-300`}
                    />
                  </label>
                </div>
              )}
              <button
                type="button"
                disabled={savingPayment}
                onClick={() => void submitCustomerOnlyPayment()}
                className={`${btnPrimary} shrink-0 bg-cyan-600 text-white hover:bg-cyan-700`}
              >
                {savingPayment ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {t("common.saving")}
                  </span>
                ) : (
                  t("register.payment.submit")
                )}
              </button>
            </div>
          </div>
        )}

        {paymentDocumentId && paymentDoc && (
          <div className="mt-3 rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] font-bold text-amber-900">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-[13px] font-black text-amber-800">{t("register.payment.docPaymentTitle")}</p>
                <p className="mt-0.5 text-[15px] text-slate-900">
                  {paymentDoc.title} · {paymentDoc.customer_name ?? t("register.fields.customer")} · {t("register.payment.remainingBalance")}{" "}
                  <span className="font-black">{formatShekel(paymentDoc.remaining_amount)}</span>
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
                <label className={labelClass}>
                  {t("register.fields.paymentMethod")}
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
                  {t("common.amount")}
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
                  {t("register.payment.note")}
                  <input
                    disabled={savingPayment}
                    type="text"
                    value={paymentNotes}
                    onChange={(event) => setPaymentNotes(event.target.value)}
                    className={`${paymentFieldClass} border-amber-200`}
                  />
                </label>
              </div>
              {paymentMethod === "CHECK" && (
                <div className="mt-2 grid w-full gap-2 rounded-[14px] border border-amber-300 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className={labelClass}>
                    {t("register.fields.checkNumber")}
                    <input
                      disabled={savingPayment}
                      type="text"
                      value={checkNumber}
                      onChange={(event) => setCheckNumber(event.target.value)}
                      className={`${paymentFieldClass} border-amber-300`}
                      placeholder="000000"
                    />
                  </label>
                  <label className={labelClass}>
                    {t("register.payment.bank")}
                    <input
                      disabled={savingPayment}
                      type="text"
                      value={checkBankName}
                      onChange={(event) => setCheckBankName(event.target.value)}
                      className={`${paymentFieldClass} border-amber-300`}
                      placeholder={t("register.payment.bankPlaceholder")}
                    />
                  </label>
                  <label className={labelClass}>
                    {t("register.fields.checkBranch")}
                    <input
                      disabled={savingPayment}
                      type="text"
                      value={checkBranch}
                      onChange={(event) => setCheckBranch(event.target.value)}
                      className={`${paymentFieldClass} border-amber-300`}
                      placeholder="000"
                    />
                  </label>
                  <label className={labelClass}>
                    {t("register.fields.dueDate")}
                    <input
                      disabled={savingPayment}
                      type="date"
                      value={checkDueDate}
                      onChange={(event) => setCheckDueDate(event.target.value)}
                      className={`${paymentFieldClass} border-amber-300`}
                    />
                  </label>
                </div>
              )}
              <button
                type="button"
                disabled={savingPayment || paymentDoc.remaining_amount <= 0}
                onClick={() => void submitDocumentPayment()}
                className={`${btnPrimary} shrink-0 bg-cyan-600 text-white hover:bg-cyan-700`}
              >
                {paymentDoc.remaining_amount <= 0 ? (
                  t("register.payment.fullyPaid")
                ) : savingPayment ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {t("common.saving")}
                  </span>
                ) : (
                  t("register.payment.submit")
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
                className={`finance-register-tab h-[52px] rounded-2xl border px-[22px] text-[15px] font-bold transition ${
                  locale === "ar" ? "text-[13px] leading-snug px-3 sm:px-4" : ""
                } ${
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
            heading={t(LK.tabEvent)}
            intro={t(LK.incomeIntro)}
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
                {t("register.actions.generatePdf")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={resetIncome}
              disabled={publishing}
              className={`${btnPrimary} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
            >
              {t("register.actions.resetForm")}
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
                  {t("common.saving")}
                </span>
              ) : editingDocId ? (
                t("register.actions.updateDoc")
              ) : (
                t("register.actions.publishDoc")
              )}
            </button>
          </div>
        </>
      )}

      {activeTab === "zreport" && (
        <section className="app-panel mb-[14px] p-[18px]">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-cyan-600" aria-hidden />
            <h2 className="text-[22px] font-extrabold text-slate-950">{t("register.zreport.title")}</h2>
          </div>
          <p className="mt-1 text-[13px] text-slate-600 opacity-70">{t("register.zreport.intro")}</p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className={labelClass}>
              {t("common.date")}
              <input type="date" value={zDate} onChange={(e) => setZDate(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              {t("register.zreport.numberLabel")}
              <input
                type="text"
                value={zNumber}
                onChange={(e) => setZNumber(e.target.value)}
                className={inputClass}
                placeholder={t("register.zreport.numberPlaceholder")}
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelClass}>
              {t("register.zreport.cashTaxable")}
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
              {t("register.zreport.cashExempt")}
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
              {t("register.zreport.creditTaxable")}
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
              {t("register.zreport.creditExempt")}
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
              {t("register.zreport.transfers")}
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
              <span className="text-[13px] font-black text-emerald-900">{t("register.zreport.grandTotal")}</span>
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
                {t("register.actions.generateReportPdf")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={resetZ}
              disabled={publishing}
              className={`${btnPrimary} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
            >
              {t("register.actions.resetForm")}
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
                  {t("common.saving")}
                </span>
              ) : editingDocId ? (
                t("register.actions.updateZ")
              ) : (
                t("register.actions.saveZ")
              )}
            </button>
          </div>
        </section>
      )}

      {activeTab === "expenses" && (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2 px-0">
            <button
              type="button"
              onClick={() => setScanDialogOpen(true)}
              disabled={publishing}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-800 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ScanLine className="h-4 w-4" aria-hidden />
              {t("scan.invoiceButton")}
            </button>
          </div>
          {expenseForm.receiptFileUrl ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <span className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4" aria-hidden />
                <span className="font-bold">
                  {expenseForm.receiptFileName || t("scan.attachedReceipt")}
                </span>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={expenseForm.receiptFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                >
                  {t("scan.viewReceipt")}
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setExpenseForm((prev) => ({
                      ...prev,
                      receiptFileUrl: null,
                      receiptFileName: null,
                    }))
                  }
                  className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"
                >
                  {t("scan.removeReceipt")}
                </button>
              </div>
            </div>
          ) : null}
          <IncomeExpenseFields
            heading={t(LK.expenseHeading)}
            headingClass="text-slate-950"
            iconClass="text-rose-600"
            intro={t(LK.expenseIntro)}
            value={expenseForm}
            onChange={(next) => setExpenseForm(next.kind === "expense" ? next : { ...next, kind: "expense" })}
            disabled={publishing}
            counterpartyInputId="expense-counterparty-name"
            onWorkerPaySubmit={() => void publishExpenseDoc()}
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
                {t("register.actions.generatePdf")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={resetExpense}
              disabled={publishing}
              className={`${btnPrimary} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
            >
              {t("register.actions.resetForm")}
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
                  {t("common.saving")}
                </span>
              ) : editingDocId ? (
                t("register.actions.updateDoc")
              ) : (
                t("register.actions.publishDoc")
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

      <ExpenseScanDialog
        open={scanDialogOpen}
        onClose={() => setScanDialogOpen(false)}
        onApply={applyScannedDocument}
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
  const { t } = useI18n();
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

        {isSuccess && state.pdfStatus ? (
          <p className="mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
            {state.pdfStatus === "processing" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                PDF בהכנה…
              </>
            ) : state.pdfStatus === "ready" ? (
              <span className="text-emerald-700">PDF מוכן</span>
            ) : (
              <span className="text-amber-800">PDF — נסו שוב מהארכיון</span>
            )}
          </p>
        ) : null}

        {isSuccess ? (
          <dl className="mt-5 grid grid-cols-1 gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-right text-sm">
            {state.documentId ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="font-bold text-slate-500">{t("register.modal.docNumberLabel")}</dt>
                <dd className="font-black text-slate-900">{state.documentId.slice(-8)}</dd>
              </div>
            ) : null}
            {state.amount !== undefined ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="font-bold text-slate-500">{t("common.amount")}</dt>
                <dd className="font-black text-slate-900">{formatShekel(state.amount)}</dd>
              </div>
            ) : null}
            {state.date ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="font-bold text-slate-500">{t("common.date")}</dt>
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
            {isSuccess ? t("register.modal.newOrder") : t("register.modal.tryAgainShort")}
          </button>
          {isSuccess ? (
            state.viewUrl ? (
              <a
                href={state.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                {t("register.modal.viewDoc")}
              </a>
            ) : (
              <span className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-black text-slate-400">
                {state.pdfStatus === "processing" ? "PDF בהכנה…" : t("register.modal.viewDoc")}
              </span>
            )
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              {t("common.close")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RegisterLoadingFallback() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-7xl p-12 text-center text-sm font-semibold text-slate-500">
      {t("common.loading")}
    </div>
  );
}

export default function FinanceRegisterPage() {
  return (
    <Suspense fallback={<RegisterLoadingFallback />}>
      <FinanceRegisterPageInner />
    </Suspense>
  );
}

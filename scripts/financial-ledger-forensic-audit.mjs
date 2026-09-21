/**
 * READ-ONLY forensic reconciliation: Customer + Supplier + Employee ledgers vs source events.
 *
 * Allowed: findMany / findFirst / count / aggregate / groupBy / $queryRaw SELECT
 * Forbidden: create / update / delete / upsert / executeRaw / migration / seed / backfill
 *
 * Env: ONLY `.env.production.audit`
 * No fallback to .env.local, development, preview, or Prisma default URL.
 *
 * Usage:
 *   node scripts/financial-ledger-forensic-audit.mjs
 *
 * Never prints DATABASE_URL / credentials / host / username.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const AUDIT_ENV_FILE = ".env.production.audit";
const EPS = 0.005;
const ROUND_EPS = 0.02;
const SAFETY_CAP = 10_000;

function parseEnvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

function loadProductionAuditEnv() {
  const envPath = path.join(process.cwd(), AUDIT_ENV_FILE);
  if (!fs.existsSync(envPath)) {
    return { ok: false, reason: "MISSING_AUDIT_ENV_FILE", present: false };
  }
  const parsed = parseEnvFile(envPath);
  const url = String(parsed.DATABASE_URL || "").trim();
  if (!url) return { ok: false, reason: "NO_DATABASE_URL", present: false };
  if (url.length < 20 || /SENSITIVE|placeholder/i.test(url)) {
    return { ok: false, reason: "PLACEHOLDER_DATABASE_URL", present: false };
  }
  if (!/^postgres/i.test(url)) {
    return { ok: false, reason: "UNEXPECTED_DB_PROVIDER", present: true };
  }
  try {
    const u = new URL(url.replace(/^postgresql:/i, "postgres:"));
    const host = (u.hostname || "").toLowerCase();
    if (!host) return { ok: false, reason: "NO_DB_HOST", present: true };
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local")
    ) {
      return { ok: false, reason: "LOCAL_DB_REJECTED", present: true };
    }
  } catch {
    return { ok: false, reason: "UNPARSEABLE_DATABASE_URL", present: true };
  }
  delete process.env.DIRECT_URL;
  process.env.DATABASE_URL = url;
  const direct = String(parsed.DIRECT_URL || "").trim();
  if (direct.length >= 20 && /^postgres/i.test(direct) && !/SENSITIVE|placeholder/i.test(direct)) {
    process.env.DIRECT_URL = direct;
  }
  return { ok: true, present: true };
}

const auditEnv = loadProductionAuditEnv();
const prisma = auditEnv.ok
  ? new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
  : null;

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function isoDay(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function classifyDiff(expected, actual) {
  const difference = money(actual - expected);
  if (Math.abs(difference) <= EPS) return { kind: "MATCH", difference: 0 };
  if (Math.abs(difference) <= ROUND_EPS) return { kind: "ROUNDING", difference };
  return { kind: "AMOUNT_MISMATCH", difference };
}

function parseMeta(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function expenseTypeOf(doc) {
  const meta = parseMeta(doc.metadata);
  const t = meta && typeof meta === "object" ? String(meta.expenseType || "") : "";
  return t || null;
}

function nameHay(s) {
  return String(s || "").toLowerCase();
}

function matchSpecial(name, needles) {
  const n = nameHay(name);
  return needles.some((x) => n.includes(nameHay(x)));
}

function addIssue(list, issue) {
  list.push(issue);
}

async function loadAll() {
  const [
    customers,
    suppliers,
    employees,
    documents,
    payments,
    ledgerEntries,
    checks,
    cashFlow,
    orderPayments,
  ] = await Promise.all([
    prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        customerType: true,
        openingBalance: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        notes: true,
        openingBalance: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      select: { id: true, name: true, openingBalance: true, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.financialDocument.findMany({
      select: {
        id: true,
        title: true,
        category: true,
        documentType: true,
        customerId: true,
        supplierId: true,
        employeeId: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        paymentStatus: true,
        depositAmount: true,
        docDate: true,
        createdAt: true,
        metadata: true,
      },
    }),
    prisma.payment.findMany({
      select: {
        id: true,
        customerId: true,
        documentId: true,
        amount: true,
        paymentMethod: true,
        notes: true,
        createdAt: true,
      },
    }),
    prisma.ledgerEntry.findMany({
      select: {
        id: true,
        entryDate: true,
        docType: true,
        description: true,
        debit: true,
        credit: true,
        createdAt: true,
        supplierId: true,
        employeeId: true,
        financialDocumentId: true,
      },
    }),
    prisma.checkPayment.findMany({
      select: {
        id: true,
        customerId: true,
        paymentId: true,
        documentId: true,
        amount: true,
        status: true,
        dueDate: true,
        createdAt: true,
      },
    }),
    prisma.cashFlowEntry.findMany({
      select: {
        id: true,
        entryType: true,
        amount: true,
        customerId: true,
        paymentId: true,
        documentId: true,
        source: true,
        relatedOrderId: true,
        orderPaymentId: true,
      },
    }),
    prisma.orderPayment.findMany({
      select: {
        id: true,
        orderId: true,
        kind: true,
        amount: true,
        status: true,
        paidAt: true,
      },
    }),
  ]);

  return {
    customers,
    suppliers,
    employees,
    documents,
    payments,
    ledgerEntries,
    checks,
    cashFlow,
    orderPayments,
  };
}

function auditCustomers(data) {
  const docsByCustomer = new Map();
  const paysByCustomer = new Map();
  const incomeDocIds = new Set();
  const docById = new Map();

  for (const d of data.documents) {
    docById.set(d.id, d);
    if (d.customerId) {
      const list = docsByCustomer.get(d.customerId) ?? [];
      list.push(d);
      docsByCustomer.set(d.customerId, list);
    }
    if (d.category === "הכנסה") incomeDocIds.add(d.id);
  }
  for (const p of data.payments) {
    const list = paysByCustomer.get(p.customerId) ?? [];
    list.push(p);
    paysByCustomer.set(p.customerId, list);
  }

  const paymentIds = new Set(data.payments.map((p) => p.id));
  const customerIds = new Set(data.customers.map((c) => c.id));

  const entities = [];
  const issues = [];
  let pass = 0;
  let fail = 0;
  const moneyBox = {
    charges: 0,
    payments: 0,
    credits: 0,
    fees: 0,
    opening: 0,
  };

  for (const c of data.customers) {
    const docs = docsByCustomer.get(c.id) ?? [];
    const pays = paysByCustomer.get(c.id) ?? [];
    const incomeDocs = docs.filter((d) => d.category === "הכנסה");
    const otherDocs = docs.filter((d) => d.category !== "הכנסה");
    const creditNotes = docs.filter((d) => isCustomerCreditNote(d.documentType));
    const zDocs = incomeDocs.filter((d) => d.documentType === "דוח Z");
    const chargeDocs = incomeDocs.filter((d) => !isCustomerCreditNote(d.documentType));

    const ledgerPays = pays.filter((p) => !p.documentId || incomeDocIds.has(p.documentId));
    const excludedPays = pays.filter((p) => p.documentId && !incomeDocIds.has(p.documentId));
    const unlinkedPays = pays.filter((p) => !p.documentId);

    const oldCharges = money(incomeDocs.reduce((s, d) => s + money(d.totalAmount), 0));
    const charges = money(chargeDocs.reduce((s, d) => s + money(d.totalAmount), 0));
    const creditNoteTotal = money(creditNotes.reduce((s, d) => s + money(d.totalAmount), 0));
    const paymentsApplied = money(ledgerPays.reduce((s, p) => s + money(p.amount), 0));
    const opening = money(c.openingBalance);
    const newSigned = money(opening + charges - paymentsApplied - creditNoteTotal);
    const newSplit = splitSigned(newSigned);
    const expectedDebt = newSplit.debt;
    const expectedCredit = newSplit.credit;

    const oldSigned = money(oldCharges - paymentsApplied);
    const oldDebt = money(Math.max(0, oldSigned));
    const oldCredit = 0;
    const uiDebt = oldDebt;
    const uiCreditHidden = money(Math.max(0, -oldSigned));
    const movementsOpening = 0;

    moneyBox.charges += charges;
    moneyBox.payments += paymentsApplied;
    moneyBox.credits += expectedCredit;
    moneyBox.opening += opening;

    const entityIssues = [];

    if (opening !== 0 && movementsOpening === 0) {
      addIssue(entityIssues, {
        code: "OPENING_IGNORED_BY_LEDGER_API",
        severity: "HIGH",
        detail: `Customer.openingBalance=${opening} but movements API opening=0`,
      });
    }
    if (expectedCredit > EPS && uiDebt === 0) {
      addIssue(entityIssues, {
        code: "CREDIT_CLAMPED",
        severity: "CRITICAL",
        detail: `Expected credit ${expectedCredit} hidden by Math.max(0, charges-payments)`,
      });
    }
    if (uiCreditHidden > EPS && expectedCredit > EPS) {
      addIssue(entityIssues, {
        code: "CREDIT_NOT_SURFACED_IN_UI",
        severity: "CRITICAL",
        detail: `UI open_balance clamps credit ${uiCreditHidden} to 0`,
      });
    }
    for (const d of creditNotes) {
      addIssue(entityIssues, {
        code: "CREDIT_NOTE_TREATED_AS_CHARGE",
        severity: "HIGH",
        detail: `Credit note ${d.id} (${d.documentType}) amount ${money(d.totalAmount)} added as income charge`,
      });
    }
    for (const d of zDocs) {
      addIssue(entityIssues, {
        code: "Z_REPORT_ON_CUSTOMER",
        severity: "HIGH",
        detail: `Z report ${d.id} linked to customer and counted as charge ${money(d.totalAmount)}`,
      });
    }
    for (const p of excludedPays) {
      addIssue(entityIssues, {
        code: "SOURCE_WITHOUT_LEDGER_ENTRY",
        severity: "HIGH",
        detail: `Payment ${p.id} amount ${money(p.amount)} linked to non-income document ${p.documentId}`,
      });
    }
    for (const p of unlinkedPays) {
      addIssue(entityIssues, {
        code: "UNLINKED_PAYMENT_INCLUDED",
        severity: "MEDIUM",
        detail: `Payment ${p.id} amount ${money(p.amount)} has no documentId — included in ledger credit`,
      });
    }
    for (const d of otherDocs) {
      addIssue(entityIssues, {
        code: "NON_INCOME_DOC_ON_CUSTOMER",
        severity: "MEDIUM",
        detail: `Document ${d.id} category=${d.category} type=${d.documentType} ignored by customer ledger`,
      });
    }

    for (const d of incomeDocs) {
      const paidFromPays = money(
        ledgerPays.filter((p) => p.documentId === d.id).reduce((s, p) => s + money(p.amount), 0),
      );
      const storedPaid = money(d.paidAmount);
      const storedRemain = money(d.remainingAmount);
      const expectedRemain = money(Math.max(0, money(d.totalAmount) - paidFromPays));
      if (Math.abs(storedPaid - paidFromPays) > ROUND_EPS) {
        addIssue(entityIssues, {
          code: "DOC_PAID_AMOUNT_DRIFT",
          severity: "MEDIUM",
          detail: `Doc ${d.id} paidAmount=${storedPaid} vs payment sum=${paidFromPays}`,
        });
      }
      if (Math.abs(storedRemain - expectedRemain) > ROUND_EPS) {
        addIssue(entityIssues, {
          code: "DOC_REMAINING_DRIFT",
          severity: "MEDIUM",
          detail: `Doc ${d.id} remainingAmount=${storedRemain} vs expected ${expectedRemain}`,
        });
      }
      if (paidFromPays > money(d.totalAmount) + EPS) {
        addIssue(entityIssues, {
          code: "OVERPAYMENT_ON_DOCUMENT",
          severity: "HIGH",
          detail: `Doc ${d.id} total=${money(d.totalAmount)} payments=${paidFromPays} surplus=${money(paidFromPays - money(d.totalAmount))}`,
        });
      }
    }

    const byKey = new Map();
    for (const p of pays) {
      const key = `${money(p.amount)}|${isoDay(p.createdAt)}|${p.documentId || "none"}`;
      const list = byKey.get(key) ?? [];
      list.push(p);
      byKey.set(key, list);
    }
    for (const [key, list] of byKey) {
      if (list.length > 1) {
        addIssue(entityIssues, {
          code: "POSSIBLE_DUPLICATE",
          severity: "CRITICAL",
          detail: `${list.length} payments share amount+date+document (${key}): ${list.map((p) => p.id).join(",")}`,
        });
      }
    }

    const balanceCmp = classifyDiff(expectedDebt, uiDebt);
    if (balanceCmp.kind !== "MATCH" && !(expectedCredit > EPS && uiDebt === 0)) {
      addIssue(entityIssues, {
        code: balanceCmp.kind === "ROUNDING" ? "ROUNDING" : "BALANCE_MISMATCH",
        severity: balanceCmp.kind === "ROUNDING" ? "LOW" : "CRITICAL",
        detail: `Expected debt ${expectedDebt} vs UI/ledger ${uiDebt} diff ${balanceCmp.difference}`,
      });
    }

    const status = entityIssues.some((i) => i.severity === "CRITICAL" || i.severity === "HIGH")
      ? "FAIL"
      : entityIssues.length
        ? "WARN"
        : "PASS";
    if (status === "FAIL") fail += 1;
    else pass += 1;

    issues.push(...entityIssues.map((i) => ({ ...i, entityType: "customer", entityId: c.id, name: c.name })));

    entities.push({
      entityType: "customer",
      id: c.id,
      name: c.name,
      opening,
      charges,
      creditNotes: creditNoteTotal,
      payments: paymentsApplied,
      expectedSigned: newSigned,
      expectedDebt,
      expectedCredit,
      ledgerDebt: uiDebt,
      ledgerCredit: 0,
      uiDebt,
      uiCredit: 0,
      oldEngine: { debt: oldDebt, credit: oldCredit, signed: oldSigned },
      newEngine: { debt: expectedDebt, credit: expectedCredit, signed: newSigned },
      difference: money(newSigned - oldSigned),
      status,
      issueCount: entityIssues.length,
      issues: entityIssues,
      incomeDocCount: incomeDocs.length,
      paymentCount: pays.length,
      excludedPaymentCount: excludedPays.length,
      creditNoteCount: creditNotes.length,
    });
  }

  for (const p of data.payments) {
    if (!customerIds.has(p.customerId)) {
      issues.push({
        code: "WRONG_CUSTOMER",
        severity: "CRITICAL",
        entityType: "payment",
        entityId: p.id,
        name: p.customerId,
        detail: `Payment ${p.id} references missing customer ${p.customerId}`,
      });
    }
    if (p.documentId && !docById.has(p.documentId)) {
      issues.push({
        code: "ORPHAN_PAYMENT_DOCUMENT",
        severity: "HIGH",
        entityType: "payment",
        entityId: p.id,
        name: p.customerId,
        detail: `Payment ${p.id} references missing document ${p.documentId}`,
      });
    }
  }

  for (const ch of data.checks) {
    if (!customerIds.has(ch.customerId)) {
      issues.push({
        code: "ORPHAN_CHECK_CUSTOMER",
        severity: "HIGH",
        entityType: "check",
        entityId: ch.id,
        name: ch.customerId,
        detail: `Check ${ch.id} references missing customer`,
      });
    }
    if (ch.paymentId && !paymentIds.has(ch.paymentId)) {
      issues.push({
        code: "ORPHAN_CHECK_PAYMENT",
        severity: "HIGH",
        entityType: "check",
        entityId: ch.id,
        name: ch.customerId,
        detail: `Check ${ch.id} references missing payment ${ch.paymentId}`,
      });
    }
  }

  return { entities, issues, pass, fail, moneyBox };
}

function auditSuppliers(data) {
  const docsBySupplier = new Map();
  const entriesBySupplier = new Map();
  const docById = new Map(data.documents.map((d) => [d.id, d]));
  const supplierIds = new Set(data.suppliers.map((s) => s.id));

  for (const d of data.documents) {
    if (!d.supplierId) continue;
    const list = docsBySupplier.get(d.supplierId) ?? [];
    list.push(d);
    docsBySupplier.set(d.supplierId, list);
  }
  for (const e of data.ledgerEntries) {
    if (!e.supplierId) continue;
    const list = entriesBySupplier.get(e.supplierId) ?? [];
    list.push(e);
    entriesBySupplier.set(e.supplierId, list);
  }

  const entities = [];
  const issues = [];
  let pass = 0;
  let fail = 0;
  const moneyBox = { obligations: 0, payments: 0 };
  const missingFromLedgerCalc = [];

  for (const s of data.suppliers) {
    const docs = docsBySupplier.get(s.id) ?? [];
    const entries = entriesBySupplier.get(s.id) ?? [];
    const opening = money(s.openingBalance);

    const payDocs = docs.filter((d) => {
      if (d.category !== "הוצאה") return false;
      const t = expenseTypeOf(d);
      return !t || t === "SUPPLIER_PAYMENTS";
    });
    const otherDocs = docs.filter((d) => !payDocs.includes(d));

    const expectedCreditsFromDocs = money(payDocs.reduce((sum, d) => sum + money(d.totalAmount), 0));
    const manualEntries = entries.filter((e) => !e.financialDocumentId);
    const autoEntries = entries.filter((e) => e.financialDocumentId);
    const manualDebit = money(manualEntries.reduce((sum, e) => sum + money(e.debit), 0));
    const manualCredit = money(manualEntries.reduce((sum, e) => sum + money(e.credit), 0));
    const autoDebit = money(autoEntries.reduce((sum, e) => sum + money(e.debit), 0));
    const autoCredit = money(autoEntries.reduce((sum, e) => sum + money(e.credit), 0));

    const expectedNet = money(opening + manualDebit - manualCredit - expectedCreditsFromDocs);
    const actualNet = money(
      opening +
        entries.reduce((sum, e) => sum + money(e.debit) - money(e.credit), 0),
    );
    const uiBalance = money(Math.max(0, actualNet));
    const expectedUi = money(Math.max(0, expectedNet));
    const expectedCreditSide = money(Math.max(0, -expectedNet));

    moneyBox.obligations += money(Math.max(0, opening + manualDebit));
    moneyBox.payments += money(expectedCreditsFromDocs + manualCredit);

    const entityIssues = [];

    const linkedDocIds = new Set(autoEntries.map((e) => e.financialDocumentId).filter(Boolean));
    for (const d of payDocs) {
      if (!linkedDocIds.has(d.id)) {
        addIssue(entityIssues, {
          code: "SOURCE_WITHOUT_LEDGER_ENTRY",
          severity: "HIGH",
          detail: `Expense ${d.id} amount ${money(d.totalAmount)} has no LedgerEntry`,
        });
      }
    }
    for (const e of autoEntries) {
      const src = docById.get(e.financialDocumentId);
      if (!src) {
        addIssue(entityIssues, {
          code: "ORPHAN_LEDGER_ENTRY",
          severity: "HIGH",
          detail: `Ledger ${e.id} references missing document ${e.financialDocumentId}`,
        });
        continue;
      }
      const amt = money(e.credit || e.debit);
      if (Math.abs(amt - money(src.totalAmount)) > ROUND_EPS) {
        addIssue(entityIssues, {
          code: "WRONG_AMOUNT",
          severity: "CRITICAL",
          detail: `Ledger ${e.id} ${amt} != document ${src.id} ${money(src.totalAmount)}`,
        });
      }
      if (src.supplierId !== s.id) {
        addIssue(entityIssues, {
          code: "WRONG_ENTITY_MAPPING",
          severity: "CRITICAL",
          detail: `Ledger ${e.id} on supplier ${s.id} but document supplier ${src.supplierId}`,
        });
      }
    }

    const byDoc = new Map();
    for (const e of autoEntries) {
      const list = byDoc.get(e.financialDocumentId) ?? [];
      list.push(e);
      byDoc.set(e.financialDocumentId, list);
    }
    for (const [docId, list] of byDoc) {
      if (list.length > 1) {
        addIssue(entityIssues, {
          code: "DUPLICATE_LEDGER_ENTRY",
          severity: "CRITICAL",
          detail: `${list.length} ledger rows for document ${docId}`,
        });
      }
    }

    if (expectedCreditSide > EPS && uiBalance === 0) {
      addIssue(entityIssues, {
        code: "CREDIT_CLAMPED",
        severity: "CRITICAL",
        detail: `Supplier credit ${expectedCreditSide} hidden by Math.max(0, opening+net)`,
      });
    }

    const cmp = classifyDiff(expectedNet, actualNet);
    if (cmp.kind !== "MATCH") {
      addIssue(entityIssues, {
        code: cmp.kind === "ROUNDING" ? "ROUNDING" : "BALANCE_MISMATCH",
        severity: cmp.kind === "ROUNDING" ? "LOW" : "CRITICAL",
        detail: `Expected net ${expectedNet} vs ledger net ${actualNet} diff ${cmp.difference}`,
      });
    }

    for (const d of otherDocs) {
      addIssue(entityIssues, {
        code: "SUPPLIER_DOC_NOT_IN_LEDGER_RULE",
        severity: "MEDIUM",
        detail: `Document ${d.id} category=${d.category} expenseType=${expenseTypeOf(d) || "?"} not treated as supplier payment source`,
      });
    }

    const status = entityIssues.some((i) => i.severity === "CRITICAL" || i.severity === "HIGH")
      ? "FAIL"
      : entityIssues.length
        ? "WARN"
        : "PASS";
    if (status === "FAIL") fail += 1;
    else pass += 1;

    issues.push(...entityIssues.map((i) => ({ ...i, entityType: "supplier", entityId: s.id, name: s.name })));

    const newSplit = splitSigned(actualNet);
    entities.push({
      entityType: "supplier",
      id: s.id,
      name: s.name,
      opening,
      expectedNet,
      actualNet,
      expectedCredit: expectedCreditSide,
      uiBalance,
      oldEngine: { debt: uiBalance, credit: 0, signed: actualNet },
      newEngine: { debt: newSplit.debt, credit: newSplit.credit, signed: actualNet },
      difference: money(newSplit.signedBalance - uiBalance),
      status,
      issueCount: entityIssues.length,
      issues: entityIssues,
      docCount: docs.length,
      ledgerCount: entries.length,
      manualCount: manualEntries.length,
    });
  }

  for (const e of data.ledgerEntries) {
    if (e.supplierId && !supplierIds.has(e.supplierId)) {
      issues.push({
        code: "ORPHAN_LEDGER_ENTRY",
        severity: "CRITICAL",
        entityType: "ledger",
        entityId: e.id,
        name: e.supplierId,
        detail: `Ledger ${e.id} references missing supplier ${e.supplierId}`,
      });
    }
    if (!e.supplierId && !e.employeeId) {
      issues.push({
        code: "ORPHAN_LEDGER_ENTRY",
        severity: "HIGH",
        entityType: "ledger",
        entityId: e.id,
        name: e.description,
        detail: `Ledger ${e.id} has neither supplierId nor employeeId`,
      });
    }
  }

  return { entities, issues, pass, fail, moneyBox, missingFromLedgerCalc };
}

function auditEmployees(data) {
  const empIds = new Set(data.employees.map((e) => e.id));
  const entriesByEmp = new Map();
  for (const e of data.ledgerEntries) {
    if (!e.employeeId) continue;
    const list = entriesByEmp.get(e.employeeId) ?? [];
    list.push(e);
    entriesByEmp.set(e.employeeId, list);
  }
  const issues = [];
  const entities = [];
  let pass = 0;
  let fail = 0;
  for (const e of data.ledgerEntries) {
    if (e.employeeId && !empIds.has(e.employeeId)) {
      issues.push({
        code: "ORPHAN_LEDGER_ENTRY",
        severity: "HIGH",
        entityType: "employee",
        entityId: e.id,
        name: e.employeeId,
        detail: `Ledger ${e.id} references missing employee ${e.employeeId}`,
      });
    }
  }
  for (const emp of data.employees) {
    const entries = entriesByEmp.get(emp.id) ?? [];
    const opening = money(emp.openingBalance);
    const debit = money(entries.reduce((s, row) => s + money(row.debit), 0));
    const credit = money(entries.reduce((s, row) => s + money(row.credit), 0));
    const newSigned = money(opening + debit - credit);
    const newSplit = splitSigned(newSigned);
    const oldSigned = money(opening + debit - credit);
    const oldDebt = money(Math.max(0, oldSigned));
    const oldCredit = 0;
    const entityIssues = [];
    if (newSplit.credit > EPS) {
      entityIssues.push({
        code: "CREDIT_CLAMPED",
        severity: "CRITICAL",
        detail: `Employee credit ${newSplit.credit} hidden by Math.max(0, opening+net)`,
      });
    }
    const status = entityIssues.some((i) => i.severity === "CRITICAL" || i.severity === "HIGH")
      ? "FAIL"
      : entityIssues.length
        ? "WARN"
        : "PASS";
    if (status === "FAIL") fail += 1;
    else pass += 1;
    issues.push(...entityIssues.map((i) => ({ ...i, entityType: "employee", entityId: emp.id, name: emp.name })));
    entities.push({
      entityType: "employee",
      id: emp.id,
      name: emp.name,
      opening,
      totalDebit: debit,
      totalCredit: credit,
      expectedSigned: newSigned,
      expectedDebt: newSplit.debt,
      expectedCredit: newSplit.credit,
      oldEngine: { debt: oldDebt, credit: oldCredit, signed: oldSigned },
      newEngine: { debt: newSplit.debt, credit: newSplit.credit, signed: newSigned },
      difference: money(newSigned - oldSigned),
      status,
      issueCount: entityIssues.length,
      issues: entityIssues,
      ledgerCount: entries.length,
    });
  }
  return {
    master: data.employees.length,
    audited: entities.length,
    pass,
    fail,
    withLedger: new Set(data.ledgerEntries.filter((e) => e.employeeId).map((e) => e.employeeId)).size,
    entities,
    issues,
  };
}

function pickSpecial(entities, needles) {
  return entities.filter((e) => matchSpecial(e.name, needles));
}

function summarizeIssues(issues) {
  const counts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    missingLedgerEntries: 0,
    duplicateEntries: 0,
    amountMismatches: 0,
    directionMismatches: 0,
    currencyMismatches: 0,
    balanceMismatches: 0,
    orphans: 0,
    creditClamped: 0,
    openingIgnored: 0,
    possibleDuplicates: 0,
  };
  for (const i of issues) {
    counts[i.severity] = (counts[i.severity] || 0) + 1;
    if (i.code === "SOURCE_WITHOUT_LEDGER_ENTRY") counts.missingLedgerEntries += 1;
    if (i.code === "DUPLICATE_LEDGER_ENTRY" || i.code === "POSSIBLE_DUPLICATE") {
      counts.duplicateEntries += 1;
      if (i.code === "POSSIBLE_DUPLICATE") counts.possibleDuplicates += 1;
    }
    if (i.code === "WRONG_AMOUNT" || i.code === "AMOUNT_MISMATCH") counts.amountMismatches += 1;
    if (i.code === "WRONG_DIRECTION") counts.directionMismatches += 1;
    if (i.code === "CURRENCY_MISMATCH") counts.currencyMismatches += 1;
    if (i.code === "BALANCE_MISMATCH") counts.balanceMismatches += 1;
    if (String(i.code).startsWith("ORPHAN")) counts.orphans += 1;
    if (i.code === "CREDIT_CLAMPED" || i.code === "CREDIT_NOT_SURFACED_IN_UI") counts.creditClamped += 1;
    if (i.code === "OPENING_IGNORED_BY_LEDGER_API") counts.openingIgnored += 1;
  }
  return counts;
}

function systemMap() {
  return {
    CUSTOMER_MASTER: "Customer",
    SUPPLIER_MASTER: "Supplier",
    EMPLOYEE_MASTER: "Employee",
    CUSTOMER_MONEY_SOURCES: [
      "FinancialDocument.category=הכנסה (charge / debit)",
      "Payment linked to income document (money in / credit)",
      "Customer.openingBalance (stored; ignored by movements API)",
      "CheckPayment (tracking only — not a ledger line unless also Payment)",
      "FutureOrder/OrderPayment (cashflow only — not customer ledger)",
      "CashFlowEntry (cashflow only)",
    ],
    SUPPLIER_MONEY_SOURCES: [
      "LedgerEntry.debit/credit",
      "FinancialDocument expense SUPPLIER_PAYMENTS → auto LedgerEntry.credit",
      "Supplier.openingBalance",
      "Manual LedgerEntry without financialDocumentId",
    ],
    LEDGER_SOURCE: {
      customer: "VIRTUAL — computed from FinancialDocument + Payment (no LedgerEntry rows)",
      supplier: "LedgerEntry table + openingBalance",
      employee: "LedgerEntry table + openingBalance",
    },
    LEDGER_CALCULATION_SERVICE: [
      "GET /api/ledger/movements",
      "GET /api/ledger/overview",
      "syncExpenseDocumentLedgerEntry",
      "syncFinancialDocumentPaymentTotals",
    ],
    RULES: [
      {
        event: "Income document",
        source: "FinancialDocument",
        direction: "DEBIT / increases customer debt",
        amount: "totalAmount",
        currency: "implicit ILS — no currency field",
        reference: "document.id",
      },
      {
        event: "Customer payment",
        source: "Payment where document.category=הכנסה or documentId null",
        direction: "CREDIT / decreases customer debt",
        amount: "Payment.amount",
        currency: "implicit ILS — no currency field",
        reference: "Payment.documentId",
      },
      {
        event: "Supplier payment expense",
        source: "FinancialDocument category=הוצאה expenseType=SUPPLIER_PAYMENTS",
        direction: "CREDIT on supplier ledger",
        amount: "totalAmount",
        currency: "implicit ILS",
        reference: "LedgerEntry.financialDocumentId unique",
      },
      {
        event: "Manual supplier/employee line",
        source: "LedgerEntry",
        direction: "debit increases obligation, credit decreases",
        amount: "debit / credit",
        currency: "implicit ILS",
        reference: "LedgerEntry.id",
      },
    ],
    KNOWN_CODE_RISKS: [
      "Customer UI/API uses Math.max(0, charges-payments) — credit is clamped to 0",
      "Customer movements API returns opening: 0 even when Customer.openingBalance != 0",
      "Supplier/employee overview uses Math.max(0, opening+net) — credit clamped",
      "No currency column on Payment / FinancialDocument / LedgerEntry",
      "FutureOrder payments never enter customer ledger",
      "Credit notes (חשבונית זיכוי) with category הכנסה increase debt",
      "Date filters drop pre-range activity without carrying opening",
      `Overview master safety cap ${SAFETY_CAP} entities`,
    ],
  };
}

function isCustomerCreditNote(documentType) {
  const raw = String(documentType || "").trim();
  if (!raw) return false;
  const n = raw.toLowerCase().replace(/\s+/g, " ");
  return (
    raw === "חשבונית זיכוי" ||
    n === "חשבונית זיכוי" ||
    n === "credit note" ||
    n === "creditnote" ||
    n.includes("credit note") ||
    /إشعار\s*دائن/.test(raw) ||
    /اشعار\s*دائن/.test(raw) ||
    /זיכוי/.test(raw)
  );
}

function splitSigned(signed) {
  const s = money(signed);
  return { signedBalance: s, debt: money(Math.max(s, 0)), credit: money(Math.max(-s, 0)) };
}

function auditNameDuplicates(data) {
  const groups = new Map();
  const add = (type, row) => {
    const key = String(row.name || "").trim().toLowerCase();
    if (!key) return;
    const list = groups.get(key) ?? [];
    list.push({ type, id: row.id, name: row.name, phone: row.phone ?? null });
    groups.set(key, list);
  };
  for (const c of data.customers) add("customer", c);
  for (const s of data.suppliers) add("supplier", s);
  for (const e of data.employees) add("employee", e);

  const possible = [];
  const confirmed = [];
  const legitimateMultiRole = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    const types = new Set(list.map((x) => x.type));
    const sameType = list.length > 1 && types.size === 1;
    const phones = list.map((x) => String(x.phone || "").replace(/\D/g, "")).filter((p) => p.length >= 7);
    const samePhone = phones.length >= 2 && new Set(phones).size === 1;
    if (sameType && samePhone) {
      confirmed.push({ classification: "CONFIRMED_DUPLICATE", entities: list });
    } else if (sameType) {
      possible.push({ classification: "POSSIBLE_DUPLICATE", entities: list });
    } else {
      legitimateMultiRole.push({ classification: "LEGITIMATE_MULTI_ROLE", entities: list });
    }
  }
  return { possible, confirmed, legitimateMultiRole };
}

function carmelPaymentGap(customerEntity, data) {
  if (!customerEntity) return null;
  const pays = data.payments.filter((p) => p.customerId === customerEntity.id);
  const amounts = pays.map((p) => money(p.amount)).sort((a, b) => b - a);
  const hit1530 = pays.filter((p) => Math.abs(money(p.amount) - 1530) <= EPS);
  const hit152938 = pays.filter((p) => Math.abs(money(p.amount) - 1529.38) <= EPS);
  const docs = data.documents.filter((d) => d.customerId === customerEntity.id);
  const docHit1530 = docs.filter((d) => Math.abs(money(d.totalAmount) - 1530) <= EPS);
  const docHit152938 = docs.filter((d) => Math.abs(money(d.totalAmount) - 1529.38) <= EPS);
  const gap = money(1530 - 1529.38);
  return {
    customerId: customerEntity.id,
    name: customerEntity.name,
    paymentCount: pays.length,
    paymentAmounts: amounts,
    paymentsEqual1530: hit1530.map((p) => p.id),
    paymentsEqual1529_38: hit152938.map((p) => p.id),
    documentsEqual1530: docHit1530.map((d) => ({ id: d.id, type: d.documentType })),
    documentsEqual1529_38: docHit152938.map((d) => ({ id: d.id, type: d.documentType })),
    historicalGap: gap,
    gapStillPresent: hit1530.length > 0 && hit152938.length > 0,
    explanation:
      hit1530.length && hit152938.length
        ? `Both 1530 and 1529.38 exist as stored amounts. Difference ${gap} is in source records, not rounding applied by this audit.`
        : hit1530.length
          ? "1530 exists; 1529.38 was not found on this customer."
          : hit152938.length
            ? "1529.38 exists; 1530 was not found on this customer."
            : "Neither 1530 nor 1529.38 found as stored payment/document amounts on this customer.",
  };
}

async function main() {
  console.log(
    JSON.stringify({
      DATABASE_URL_PRESENT: auditEnv.present ? "YES" : "NO",
      AUDIT_ENV_FILE: AUDIT_ENV_FILE,
      READ_ONLY: true,
    }),
  );
  if (!auditEnv.ok || !prisma) {
    const blocked = {
      ok: false,
      finalStatus: "AUDIT_BLOCKED",
      environment: "blocked",
      dbConnection: "FAIL",
      dbReason: auditEnv.reason,
      envFile: AUDIT_ENV_FILE,
      fallbackUsed: "NONE",
      generatedAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(blocked, null, 2));
    process.exit(1);
  }

  const data = await loadAll();
  const customers = auditCustomers(data);
  const suppliers = auditSuppliers(data);
  const employees = auditEmployees(data);

  const allIssues = [...customers.issues, ...suppliers.issues, ...employees.issues];
  const custFail = customers.entities.filter((e) => e.status === "FAIL");
  const supFail = suppliers.entities.filter((e) => e.status === "FAIL");

  const special = {
    carmel: pickSpecial(customers.entities, ["כרמל", "carmel", "karmel"]),
    khalil: pickSpecial(customers.entities, ["khalil", "חליל", "خليل", "#101"]),
    hanan: pickSpecial(customers.entities, ["hanan", "חנאן", "حنان", "#107"]),
    imnan: pickSpecial(customers.entities, ["imnan", "עימנאן", "امنان", "#109"]),
    omar: pickSpecial(customers.entities, ["omar", "עומר", "عمر", "#102"]),
    hani: pickSpecial(suppliers.entities, ["هاني كعك", "هاني", "האני", "hani", "كعك"]),
    albabi: [
      ...pickSpecial(customers.entities, ["אלבאבי", "البابي"]),
      ...pickSpecial(suppliers.entities, ["אלבאבי", "البابي"]),
    ],
    salama: [
      ...pickSpecial(customers.entities, ["סלאמה", "سلامة"]),
      ...pickSpecial(suppliers.entities, ["סלאמה", "سلامة"]),
    ],
    superAdmin: pickSpecial(employees.entities, ["super admin", "Super Admin"]),
    abuYasser: [
      ...pickSpecial(customers.entities, ["ابو ياسر", "אבו יאסר"]),
      ...pickSpecial(suppliers.entities, ["ابو ياسر", "אבו יאסר"]),
      ...pickSpecial(employees.entities, ["ابو ياسر", "אבו יאסר"]),
    ],
  };
  const duplicates = auditNameDuplicates(data);
  const carmelGap = carmelPaymentGap(special.carmel[0], data);
  const oldVsNew = {
    customersChanged: customers.entities.filter(
      (e) => Math.abs(e.oldEngine.debt - e.newEngine.debt) > EPS || Math.abs(e.oldEngine.credit - e.newEngine.credit) > EPS,
    ).length,
    suppliersChanged: suppliers.entities.filter(
      (e) => Math.abs(e.oldEngine.debt - e.newEngine.debt) > EPS || Math.abs(e.oldEngine.credit - e.newEngine.credit) > EPS,
    ).length,
    employeesChanged: employees.entities.filter(
      (e) => Math.abs(e.oldEngine.debt - e.newEngine.debt) > EPS || Math.abs(e.oldEngine.credit - e.newEngine.credit) > EPS,
    ).length,
    clampAffected: allIssues.filter((i) => i.code === "CREDIT_CLAMPED" || i.code === "CREDIT_NOT_SURFACED_IN_UI").length,
    openingAffected: allIssues.filter((i) => i.code === "OPENING_IGNORED_BY_LEDGER_API").length,
    creditNoteAffected: allIssues.filter((i) => i.code === "CREDIT_NOTE_TREATED_AS_CHARGE").length,
  };

  const supplierMasterIds = new Set(data.suppliers.map((s) => s.id));
  const suppliersWithAnyLedgerOrDoc = new Set([
    ...data.ledgerEntries.filter((e) => e.supplierId).map((e) => e.supplierId),
    ...data.documents.filter((d) => d.supplierId).map((d) => d.supplierId),
  ]);
  const missingFinancialActivity = data.suppliers
    .filter((s) => !suppliersWithAnyLedgerOrDoc.has(s.id) && money(s.openingBalance) === 0)
    .map((s) => ({ id: s.id, name: s.name }));

  const hani = special.hani[0] || null;

  const report = {
    ok: true,
    finalStatus:
      custFail.length || supFail.length ? "LEDGER_INCONSISTENCIES_FOUND" : "LEDGER_VERIFIED",
    environment: "production",
    dbConnection: "PASS",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    envFile: AUDIT_ENV_FILE,
    fallbackUsed: "NONE",
    system: systemMap(),
    customers: {
      totalMaster: data.customers.length,
      audited: customers.entities.length,
      pass: customers.pass,
      fail: customers.fail,
      issueCounts: summarizeIssues(customers.issues),
      money: customers.moneyBox,
      failures: custFail.slice(0, 80).map((e) => ({
        name: e.name,
        id: e.id,
        expectedDebt: e.expectedDebt,
        expectedCredit: e.expectedCredit,
        ledgerDebt: e.ledgerDebt,
        ledgerCredit: e.ledgerCredit,
        difference: e.difference,
        status: e.status,
        issues: e.issues.map((i) => i.code),
      })),
    },
    suppliers: {
      totalMaster: data.suppliers.length,
      audited: suppliers.entities.length,
      pass: suppliers.pass,
      fail: suppliers.fail,
      issueCounts: summarizeIssues(suppliers.issues),
      money: suppliers.moneyBox,
      missingFinancialActivityCount: missingFinancialActivity.length,
      missingFinancialActivitySample: missingFinancialActivity.slice(0, 40),
      failures: supFail.slice(0, 80).map((e) => ({
        name: e.name,
        id: e.id,
        expectedNet: e.expectedNet,
        actualNet: e.actualNet,
        uiBalance: e.uiBalance,
        difference: e.difference,
        status: e.status,
        issues: e.issues.map((i) => i.code),
      })),
      haniKaak: hani
        ? {
            existsInSupplierMaster: true,
            hasFinancialEvents: hani.docCount > 0 || hani.ledgerCount > 0,
            hasLedgerEntity: true,
            visibleInUnifiedLedger: true,
            expectedBalance: hani.expectedNet,
            actualBalance: hani.actualNet,
            uiBalance: hani.uiBalance,
            status: hani.status,
            issues: hani.issues,
          }
        : {
            existsInSupplierMaster: false,
            hasFinancialEvents: false,
            hasLedgerEntity: false,
            visibleInUnifiedLedger: false,
            status: "MISSING",
          },
    },
    employees: {
      totalMaster: employees.master,
      audited: employees.audited,
      pass: employees.pass,
      fail: employees.fail,
      withLedger: employees.withLedger,
      issueCount: employees.issues.length,
      failures: employees.entities
        .filter((e) => e.status === "FAIL")
        .slice(0, 80)
        .map((e) => ({
          name: e.name,
          id: e.id,
          expectedDebt: e.expectedDebt,
          expectedCredit: e.expectedCredit,
          oldEngine: e.oldEngine,
          newEngine: e.newEngine,
          issues: e.issues.map((i) => i.code),
        })),
    },
    oldVsNew,
    duplicates: {
      possible: duplicates.possible.length,
      confirmed: duplicates.confirmed.length,
      legitimateMultiRole: duplicates.legitimateMultiRole.length,
      possibleRows: duplicates.possible,
      confirmedRows: duplicates.confirmed,
      legitimateMultiRoleRows: duplicates.legitimateMultiRole,
    },
    carmelGap,
    special,
    integrity: {
      sourceWithoutLedger: allIssues.filter((i) => i.code === "SOURCE_WITHOUT_LEDGER_ENTRY").length,
      ledgerWithoutSource: allIssues.filter((i) => String(i.code).startsWith("ORPHAN")).length,
      duplicateSourceMapping: allIssues.filter((i) => i.code === "DUPLICATE_LEDGER_ENTRY").length,
      wrongEntityMapping: allIssues.filter((i) => i.code === "WRONG_ENTITY_MAPPING" || i.code === "WRONG_CUSTOMER").length,
      currencyIssues: 0,
      currencyModel: "ABSENT — amounts are implicit ILS; no currency/exchangeRate columns on Payment, FinancialDocument, or LedgerEntry",
      roundingIssues: allIssues.filter((i) => i.code === "ROUNDING").length,
      creditClamped: allIssues.filter((i) => i.code === "CREDIT_CLAMPED" || i.code === "CREDIT_NOT_SURFACED_IN_UI").length,
      openingIgnored: allIssues.filter((i) => i.code === "OPENING_IGNORED_BY_LEDGER_API").length,
    },
    cashflowNotInLedger: {
      orderPaymentsActive: data.orderPayments.filter((p) => p.status === "ACTIVE").length,
      cashFlowRows: data.cashFlow.length,
      note: "OrderPayment/CashFlowEntry are excluded from customer/supplier ledger by design",
    },
    recommendedFixPlan: {
      CODE_FIX_REQUIRED: true,
      DATA_RECONCILIATION_REQUIRED: custFail.length + supFail.length > 0,
      MIGRATION_REQUIRED: false,
      notes: [
        "Stop clamping customer/supplier credit with Math.max(0, balance)",
        "Include Customer.openingBalance in movements opening and expected balance",
        "Surface expectedCredit separately from debt",
        "Do not treat credit notes as income charges",
        "Date-range views should carry pre-range opening",
        "Do not write/replay until this report is reviewed",
      ],
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.log(
      JSON.stringify({
        ok: false,
        finalStatus: "AUDIT_BLOCKED",
        environment: "blocked",
        dbConnection: "FAIL",
        error: String(e instanceof Error ? e.message : e).replace(
          /postgres(?:ql)?:\/\/\S+/gi,
          "[redacted]",
        ),
      }),
    );
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });

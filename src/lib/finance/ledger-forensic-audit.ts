/**
 * Read-only ledger forensic audit. No Prisma writes.
 * NEW engine = ledger-balance SSOT. OLD engine = production clamp / opening=0 / credit-note-as-charge.
 */

import {
  computeCustomerLedger,
  computeEntryLedger,
  isCustomerCreditNote,
  splitSignedBalance,
  type CustomerDocSource,
  type CustomerPaymentSource,
  type EntrySource,
} from "@/lib/finance/ledger-balance";

const EPS = 1e-6;

export type ForensicIssueCode =
  | "CREDIT_CLAMP"
  | "OPENING_BALANCE_IGNORED"
  | "CREDIT_NOTE_DIRECTION"
  | "DATE_RANGE_BALANCE"
  | "AMOUNT_MISMATCH"
  | "MISSING_LEDGER_ENTITY"
  | "DUPLICATE_ENTITY"
  | "POSSIBLE_DUPLICATE"
  | "ORPHAN_ENTRY"
  | "SOURCE_WITHOUT_LEDGER";

export type ForensicIssue = {
  code: ForensicIssueCode;
  detail: string;
};

export type ForensicEntityRow = {
  id: string;
  name: string;
  openingBalance: number;
  charges?: number;
  creditNotes?: number;
  payments?: number;
  debit?: number;
  credit?: number;
  expectedSignedBalance: number;
  newDebt: number;
  newCredit: number;
  oldDebt: number;
  oldCredit: number;
  oldBalance: number;
  newBalance: number;
  difference: number;
  issues: ForensicIssue[];
  status: "PASS" | "FAIL";
};

export type DuplicateClassification = "POSSIBLE_DUPLICATE" | "CONFIRMED_DUPLICATE" | "LEGITIMATE_MULTI_ROLE";

export type DuplicateRow = {
  classification: DuplicateClassification;
  entities: Array<{ type: "customer" | "supplier" | "employee"; id: string; name: string }>;
};

export type ForensicMaster = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  openingBalance: number;
};

export type ForensicSources = {
  customers: ForensicMaster[];
  suppliers: ForensicMaster[];
  employees: ForensicMaster[];
  documents: Array<
    CustomerDocSource & {
      customerId?: string | null;
      supplierId?: string | null;
      employeeId?: string | null;
    }
  >;
  payments: Array<CustomerPaymentSource & { customerId?: string | null }>;
  ledgerEntries: Array<
    EntrySource & {
      supplierId?: string | null;
      employeeId?: string | null;
    }
  >;
};

const KNOWN_CASE_NEEDLES: Record<string, string[]> = {
  carmel: ["כרמל", "carmel", "karmel"],
  khalil: ["khalil", "חליל", "خليل"],
  hanan: ["hanan", "חנאן", "حنان"],
  imnan: ["imnan", "עימנאן", "امنان"],
  omar: ["omar", "עומר", "عمر"],
  haniKaak: ["هاني كعك", "هاني", "האני", "hani"],
  albabi: ["אלבאבי", "البابي"],
  salama: ["סלאמה סנטר", "סלאמה", "سلامة"],
  superAdmin: ["super admin"],
  abuYasser: ["ابو ياسر", "אבו יאסר"],
};

function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nearly(a: number, b: number): boolean {
  return Math.abs(money(a) - money(b)) < 0.005;
}

function nameHay(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function digits(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

export function authorizeLedgerForensicAudit(
  session: { role?: string } | null,
): { ok: true } | { ok: false; status: 401 | 403 } {
  if (!session) return { ok: false, status: 401 };
  if (session.role !== "SUPER_ADMIN") return { ok: false, status: 403 };
  return { ok: true };
}

export function classifyNameDuplicates(data: {
  customers: ForensicMaster[];
  suppliers: ForensicMaster[];
  employees: ForensicMaster[];
}): DuplicateRow[] {
  const groups = new Map<string, DuplicateRow["entities"]>();
  const add = (type: DuplicateRow["entities"][number]["type"], row: ForensicMaster) => {
    const key = nameHay(row.name);
    if (!key) return;
    const list = groups.get(key) ?? [];
    list.push({ type, id: row.id, name: row.name });
    groups.set(key, list);
  };
  for (const row of data.customers) add("customer", row);
  for (const row of data.suppliers) add("supplier", row);
  for (const row of data.employees) add("employee", row);

  const phoneOf = (type: string, id: string): string => {
    const pool =
      type === "customer" ? data.customers : type === "supplier" ? data.suppliers : data.employees;
    return digits(pool.find((x) => x.id === id)?.phone);
  };

  const out: DuplicateRow[] = [];
  for (const [, entities] of groups) {
    if (entities.length < 2) continue;
    const types = new Set(entities.map((e) => e.type));
    const phones = entities.map((e) => phoneOf(e.type, e.id)).filter((p) => p.length >= 7);
    const samePhone = phones.length >= 2 && new Set(phones).size === 1;
    if (types.size === 1 && samePhone) {
      out.push({ classification: "CONFIRMED_DUPLICATE", entities });
    } else if (types.size === 1) {
      out.push({ classification: "POSSIBLE_DUPLICATE", entities });
    } else {
      out.push({ classification: "LEGITIMATE_MULTI_ROLE", entities });
    }
  }
  return out;
}

function pickKnown(entities: ForensicEntityRow[], needles: string[]): ForensicEntityRow[] {
  return entities.filter((e) => needles.some((n) => nameHay(e.name).includes(nameHay(n))));
}

function dateRangeBounds(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

function auditCustomers(data: ForensicSources): ForensicEntityRow[] {
  const docsBy = new Map<string, ForensicSources["documents"]>();
  const paysBy = new Map<string, ForensicSources["payments"]>();
  const incomeIds = new Set<string>();
  for (const doc of data.documents) {
    if (doc.customerId) {
      const list = docsBy.get(doc.customerId) ?? [];
      list.push(doc);
      docsBy.set(doc.customerId, list);
    }
    if ((doc.category ?? "").trim() === "הכנסה") incomeIds.add(doc.id);
  }
  for (const pay of data.payments) {
    if (!pay.customerId) continue;
    const list = paysBy.get(pay.customerId) ?? [];
    list.push(pay);
    paysBy.set(pay.customerId, list);
  }

  const { from, to } = dateRangeBounds();
  return data.customers.map((customer) => {
    const documents = docsBy.get(customer.id) ?? [];
    const payments = (paysBy.get(customer.id) ?? []).filter(
      (p) => !p.documentId || incomeIds.has(p.documentId),
    );
    const incomeDocs = documents.filter((d) => (d.category ?? "").trim() === "הכנסה");
    const creditNoteDocs = documents.filter((d) => isCustomerCreditNote(d.documentType));
    const chargeDocs = incomeDocs.filter((d) => !isCustomerCreditNote(d.documentType));
    const charges = chargeDocs.reduce((s, d) => s + Math.abs(money(d.totalAmount)), 0);
    const creditNotes = creditNoteDocs.reduce((s, d) => s + Math.abs(money(d.totalAmount)), 0);
    const paySum = payments.reduce((s, p) => s + Math.abs(money(p.amount)), 0);
    const oldCharges = incomeDocs.reduce((s, d) => s + Math.abs(money(d.totalAmount)), 0);
    const oldSigned = oldCharges - paySum;
    const oldDebt = Math.max(oldSigned, 0);
    const oldCredit = 0;

    const neu = computeCustomerLedger({
      entityId: customer.id,
      entityName: customer.name,
      openingBalance: customer.openingBalance,
      documents,
      payments,
    });

    const issues: ForensicIssue[] = [];
    if (neu.credit > EPS && oldCredit === 0) {
      issues.push({
        code: "CREDIT_CLAMP",
        detail: `New credit ${neu.credit} hidden by old Math.max(0, charges-payments)`,
      });
    }
    if (Math.abs(money(customer.openingBalance)) > EPS) {
      issues.push({
        code: "OPENING_BALANCE_IGNORED",
        detail: `openingBalance=${customer.openingBalance} ignored by old movements opening=0`,
      });
    }
    if (creditNoteDocs.length > 0) {
      issues.push({
        code: "CREDIT_NOTE_DIRECTION",
        detail: `${creditNoteDocs.length} credit note(s) counted as charges in old engine`,
      });
    }

    const oldPeriod = computeCustomerLedger({
      entityId: customer.id,
      entityName: customer.name,
      openingBalance: 0,
      documents: documents.filter((d) => {
        const day = (d.docDate ?? d.createdAt)?.toString().slice(0, 10) ?? "";
        return day >= from && day <= to;
      }),
      payments: payments.filter((p) => {
        const day = String(p.createdAt).slice(0, 10);
        return day >= from && day <= to;
      }),
    });
    const newPeriod = computeCustomerLedger({
      entityId: customer.id,
      entityName: customer.name,
      openingBalance: customer.openingBalance,
      documents,
      payments,
      dateFrom: from,
      dateTo: to,
    });
    if (!nearly(oldPeriod.signedBalance, newPeriod.signedBalance)) {
      issues.push({
        code: "DATE_RANGE_BALANCE",
        detail: `Period ${from}..${to} old=${oldPeriod.signedBalance} new=${newPeriod.signedBalance}`,
      });
    }

    const difference = neu.signedBalance - oldSigned;
    const status: "PASS" | "FAIL" =
      issues.some((i) => i.code === "CREDIT_CLAMP" || i.code === "CREDIT_NOTE_DIRECTION") ||
      !nearly(neu.debt, oldDebt) ||
      !nearly(neu.credit, oldCredit)
        ? "FAIL"
        : issues.length
          ? "FAIL"
          : "PASS";

    return {
      id: customer.id,
      name: customer.name,
      openingBalance: money(customer.openingBalance),
      charges,
      creditNotes,
      payments: paySum,
      expectedSignedBalance: neu.signedBalance,
      newDebt: neu.debt,
      newCredit: neu.credit,
      oldDebt,
      oldCredit,
      oldBalance: oldDebt,
      newBalance: neu.signedBalance,
      difference,
      issues,
      status,
    };
  });
}

function auditEntryEntities(
  kind: "supplier" | "employee",
  masters: ForensicMaster[],
  entries: ForensicSources["ledgerEntries"],
  documents: ForensicSources["documents"],
): ForensicEntityRow[] {
  const byId = new Map<string, ForensicSources["ledgerEntries"]>();
  for (const row of entries) {
    const key = kind === "supplier" ? row.supplierId : row.employeeId;
    if (!key) continue;
    const list = byId.get(key) ?? [];
    list.push(row);
    byId.set(key, list);
  }
  const masterIds = new Set(masters.map((m) => m.id));

  return masters.map((entity) => {
    const rows = byId.get(entity.id) ?? [];
    const debit = rows.reduce((s, r) => s + Math.max(0, money(r.debit)), 0);
    const credit = rows.reduce((s, r) => s + Math.max(0, money(r.credit)), 0);
    const signed = money(entity.openingBalance) + debit - credit;
    const neu = computeEntryLedger({
      entityType: kind,
      entityId: entity.id,
      entityName: entity.name,
      openingBalance: entity.openingBalance,
      entries: rows,
    });
    const oldDebt = Math.max(signed, 0);
    const oldCredit = 0;
    const issues: ForensicIssue[] = [];
    if (neu.credit > EPS) {
      issues.push({
        code: "CREDIT_CLAMP",
        detail: `New credit ${neu.credit} hidden by old Math.max(0, opening+net)`,
      });
    }
    for (const row of rows) {
      if (row.financialDocumentId) {
        const src = documents.find((d) => d.id === row.financialDocumentId);
        if (!src) {
          issues.push({
            code: "ORPHAN_ENTRY",
            detail: `Ledger ${row.id} references missing document ${row.financialDocumentId}`,
          });
        } else {
          const amt = Math.max(money(row.credit), money(row.debit));
          if (Math.abs(amt - Math.abs(money(src.totalAmount))) > 0.02) {
            issues.push({
              code: "AMOUNT_MISMATCH",
              detail: `Ledger ${row.id} ${amt} != document ${src.id} ${src.totalAmount}`,
            });
          }
        }
      }
    }
    if (kind === "supplier") {
      for (const doc of documents) {
        if (doc.supplierId !== entity.id) continue;
        if ((doc.category ?? "").trim() !== "הוצאה") continue;
        const linked = rows.some((r) => r.financialDocumentId === doc.id);
        if (!linked) {
          issues.push({
            code: "SOURCE_WITHOUT_LEDGER",
            detail: `Expense ${doc.id} amount ${doc.totalAmount} has no LedgerEntry`,
          });
        }
      }
    }

    const status: "PASS" | "FAIL" =
      issues.length > 0 || !nearly(neu.debt, oldDebt) || !nearly(neu.credit, oldCredit) ? "FAIL" : "PASS";

    return {
      id: entity.id,
      name: entity.name,
      openingBalance: money(entity.openingBalance),
      debit,
      credit,
      expectedSignedBalance: neu.signedBalance,
      newDebt: neu.debt,
      newCredit: neu.credit,
      oldDebt,
      oldCredit,
      oldBalance: oldDebt,
      newBalance: neu.signedBalance,
      difference: neu.signedBalance - signed,
      issues,
      status,
    };
  }).concat(
    entries
      .filter((row) => {
        const id = kind === "supplier" ? row.supplierId : row.employeeId;
        return Boolean(id) && !masterIds.has(id!);
      })
      .map((row) => ({
        id: row.id,
        name: kind === "supplier" ? String(row.supplierId) : String(row.employeeId),
        openingBalance: 0,
        debit: 0,
        credit: 0,
        expectedSignedBalance: 0,
        newDebt: 0,
        newCredit: 0,
        oldDebt: 0,
        oldCredit: 0,
        oldBalance: 0,
        newBalance: 0,
        difference: 0,
        issues: [
          {
            code: "ORPHAN_ENTRY" as const,
            detail: `Ledger ${row.id} references missing ${kind}`,
          },
        ],
        status: "FAIL" as const,
      })),
  );
}

function carmelGap(customer: ForensicEntityRow | undefined, data: ForensicSources) {
  if (!customer) return null;
  const pays = data.payments.filter((p) => p.customerId === customer.id);
  const docs = data.documents.filter((d) => d.customerId === customer.id);
  const pay1530 = pays.filter((p) => Math.abs(money(p.amount) - 1530) <= EPS);
  const pay1529 = pays.filter((p) => Math.abs(money(p.amount) - 1529.38) <= EPS);
  const doc1530 = docs.filter((d) => Math.abs(money(d.totalAmount) - 1530) <= EPS);
  const doc1529 = docs.filter((d) => Math.abs(money(d.totalAmount) - 1529.38) <= EPS);
  return {
    id: customer.id,
    name: customer.name,
    historicalGap: 1530 - 1529.38,
    payments1530: pay1530.map((p) => ({ id: p.id, amount: money(p.amount) })),
    payments1529_38: pay1529.map((p) => ({ id: p.id, amount: money(p.amount) })),
    documents1530: doc1530.map((d) => ({ id: d.id, amount: money(d.totalAmount), type: d.documentType })),
    documents1529_38: doc1529.map((d) => ({
      id: d.id,
      amount: money(d.totalAmount),
      type: d.documentType,
    })),
    gapStillPresent: pay1530.length > 0 && (pay1529.length > 0 || doc1529.length > 0),
    explanation:
      pay1530.length && (pay1529.length || doc1529.length)
        ? "Both 1530 and 1529.38 exist as stored amounts. Difference 0.62 is in source records."
        : pay1530.length
          ? "1530 exists; 1529.38 was not found on this customer."
          : pay1529.length || doc1529.length
            ? "1529.38 exists; 1530 was not found on this customer."
            : "Neither 1530 nor 1529.38 found as stored amounts on this customer.",
    entity: customer,
  };
}

export function runLedgerForensicAudit(data: ForensicSources) {
  const customers = auditCustomers(data);
  const suppliers = auditEntryEntities("supplier", data.suppliers, data.ledgerEntries, data.documents);
  const employees = auditEntryEntities("employee", data.employees, data.ledgerEntries, data.documents);
  const duplicates = classifyNameDuplicates(data);

  const allIssues = [...customers, ...suppliers, ...employees].flatMap((e) => e.issues);
  const codeOnly = new Set<ForensicIssueCode>([
    "CREDIT_CLAMP",
    "OPENING_BALANCE_IGNORED",
    "CREDIT_NOTE_DIRECTION",
    "DATE_RANGE_BALANCE",
  ]);
  const sourceCodes = new Set<ForensicIssueCode>([
    "AMOUNT_MISMATCH",
    "ORPHAN_ENTRY",
    "SOURCE_WITHOUT_LEDGER",
  ]);

  const tally = (rows: ForensicEntityRow[]) => ({
    total: rows.length,
    pass: rows.filter((r) => r.status === "PASS").length,
    fail: rows.filter((r) => r.status === "FAIL").length,
  });
  const customerRows = customers.filter((r) => data.customers.some((c) => c.id === r.id));
  const supplierRows = suppliers.filter((r) => data.suppliers.some((s) => s.id === r.id));
  const employeeRows = employees.filter((r) => data.employees.some((e) => e.id === r.id));

  return {
    customers: { ...tally(customerRows), rows: customerRows },
    suppliers: { ...tally(supplierRows), rows: supplierRows },
    employees: { ...tally(employeeRows), rows: employeeRows },
    orphans: [...suppliers, ...employees].filter(
      (r) =>
        r.issues.some((i) => i.code === "ORPHAN_ENTRY") &&
        !data.suppliers.some((s) => s.id === r.id) &&
        !data.employees.some((e) => e.id === r.id),
    ),
    affectedByOldClamp: allIssues.filter((i) => i.code === "CREDIT_CLAMP").length,
    affectedByOpeningBalance: allIssues.filter((i) => i.code === "OPENING_BALANCE_IGNORED").length,
    affectedByCreditNote: allIssues.filter((i) => i.code === "CREDIT_NOTE_DIRECTION").length,
    affectedByDateRange: allIssues.filter((i) => i.code === "DATE_RANGE_BALANCE").length,
    duplicates: {
      possible: duplicates.filter((d) => d.classification === "POSSIBLE_DUPLICATE"),
      confirmed: duplicates.filter((d) => d.classification === "CONFIRMED_DUPLICATE"),
      legitimateMultiRole: duplicates.filter((d) => d.classification === "LEGITIMATE_MULTI_ROLE"),
    },
    sourceDataErrors: allIssues.filter((i) => sourceCodes.has(i.code)).length,
    codeOnlyErrors: allIssues.filter((i) => codeOnly.has(i.code)).length,
    knownCases: {
      carmel: pickKnown(customers, KNOWN_CASE_NEEDLES.carmel),
      khalil: pickKnown(customers, KNOWN_CASE_NEEDLES.khalil),
      hanan: pickKnown(customers, KNOWN_CASE_NEEDLES.hanan),
      imnan: pickKnown(customers, KNOWN_CASE_NEEDLES.imnan),
      omar: pickKnown(customers, KNOWN_CASE_NEEDLES.omar),
      haniKaak: pickKnown(suppliers, KNOWN_CASE_NEEDLES.haniKaak),
      albabi: [
        ...pickKnown(customers, KNOWN_CASE_NEEDLES.albabi),
        ...pickKnown(suppliers, KNOWN_CASE_NEEDLES.albabi),
      ],
      salama: [
        ...pickKnown(customers, KNOWN_CASE_NEEDLES.salama),
        ...pickKnown(suppliers, KNOWN_CASE_NEEDLES.salama),
      ],
      superAdmin: pickKnown(employees, KNOWN_CASE_NEEDLES.superAdmin),
      abuYasser: [
        ...pickKnown(customers, KNOWN_CASE_NEEDLES.abuYasser),
        ...pickKnown(suppliers, KNOWN_CASE_NEEDLES.abuYasser),
        ...pickKnown(employees, KNOWN_CASE_NEEDLES.abuYasser),
      ],
    },
    carmelGap: carmelGap(pickKnown(customers, KNOWN_CASE_NEEDLES.carmel)[0], data),
    coverage: {
      customers: customerRows.length === data.customers.length,
      suppliers: supplierRows.length === data.suppliers.length,
      employees: employeeRows.length === data.employees.length,
    },
  };
}

export function sanitizeLedgerAuditError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/DATABASE_URL|DIRECT_URL/gi, "[redacted]");
}

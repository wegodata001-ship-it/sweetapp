/**
 * Shared mapping for live ledger routes.
 * Overview and movements must call the same compute* functions.
 */
import {
  computeCustomerLedger,
  computeEntryLedger,
  movementsFromStatement,
  overviewRowFromStatement,
  type LedgerStatement,
} from "@/lib/finance/ledger-engine";
import type { EntityType, LedgerMovementView, LedgerOverviewRow } from "@/lib/finance/types";

export type CustomerSourceDoc = {
  id: string;
  customerId?: string | null;
  documentType: string;
  category: string;
  title: string;
  totalAmount: number;
  docDate: Date | string | null;
  createdAt: Date | string;
};

export type CustomerSourcePayment = {
  id: string;
  customerId?: string | null;
  amount: number;
  createdAt: Date | string;
  documentId?: string | null;
  documentTitle?: string | null;
};

export type EntrySourceRow = {
  id: string;
  debit: number;
  credit: number;
  entryDate: Date | string;
  docType: string;
  description: string;
  financialDocumentId?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
};

export function statementForCustomer(params: {
  id: string;
  name: string;
  openingBalance: number;
  documents: CustomerSourceDoc[];
  payments: CustomerSourcePayment[];
  dateFrom?: string | null;
  dateTo?: string | null;
}): LedgerStatement {
  return computeCustomerLedger({
    entityId: params.id,
    entityName: params.name,
    openingBalance: params.openingBalance,
    documents: params.documents.filter((d) => !d.customerId || d.customerId === params.id),
    payments: params.payments.filter((p) => !p.customerId || p.customerId === params.id),
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
}

export function statementForEntryEntity(params: {
  entityType: "supplier" | "employee";
  id: string;
  name: string;
  openingBalance: number;
  entries: EntrySourceRow[];
  dateFrom?: string | null;
  dateTo?: string | null;
}): LedgerStatement {
  const entries = params.entries.filter((row) =>
    params.entityType === "supplier" ? row.supplierId === params.id : row.employeeId === params.id,
  );
  return computeEntryLedger({
    entityType: params.entityType,
    entityId: params.id,
    entityName: params.name,
    openingBalance: params.openingBalance,
    entries,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
}

export function overviewRowFromEntityStatement(
  entity: { entity_type: EntityType; id: string; name: string; opening_balance: number },
  statement: LedgerStatement,
): LedgerOverviewRow {
  return overviewRowFromStatement(entity, statement);
}

export function movementViewsFromStatement(statement: LedgerStatement): LedgerMovementView[] {
  return movementsFromStatement(statement);
}

export function movementsPayload(statement: LedgerStatement) {
  return {
    opening: statement.periodOpening,
    broughtForward: statement.periodOpening,
    entityName: statement.entityName,
    openDebt: statement.debt,
    totalCredit: statement.periodCredit,
    balance: statement.signedBalance,
    signedBalance: statement.signedBalance,
    debt: statement.debt,
    credit: statement.credit,
    side: statement.side,
    movements: movementViewsFromStatement(statement),
  };
}

/**
 * Open payables for the dashboard.
 * Remaining debt comes only from statementForEntryEntity (supplier AP / employee).
 * No date window: an unpaid balance from an earlier month stays included.
 * Customers are not parties here.
 */
import type { ExpenseObligationDoc } from "@/lib/finance/expense-obligation";
import {
  statementForEntryEntity,
  type EntrySourceRow,
} from "@/lib/finance/ledger-route-map";

export type OpenPayableParty = {
  id: string;
  entityType: "supplier" | "employee";
  name: string;
  openingBalance: number;
};

export type OpenPayableRow = {
  id: string;
  entityType: "supplier" | "employee";
  name: string;
  charges: number;
  paid: number;
  remaining: number;
};

export function openPayableRows(params: {
  parties: OpenPayableParty[];
  entries: EntrySourceRow[];
  expenseDocuments?: ExpenseObligationDoc[];
}): { total: number; count: number; rows: OpenPayableRow[] } {
  const rows: OpenPayableRow[] = [];
  for (const party of params.parties) {
    const statement = statementForEntryEntity({
      entityType: party.entityType,
      id: party.id,
      name: party.name,
      openingBalance: party.openingBalance,
      entries: params.entries,
      expenseDocuments: params.expenseDocuments,
    });
    if (!(statement.debt > 0)) continue;
    rows.push({
      id: party.id,
      entityType: party.entityType,
      name: party.name,
      charges: statement.periodDebit,
      paid: statement.periodCredit,
      remaining: statement.debt,
    });
  }
  rows.sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, "he"));
  const total = rows.reduce((sum, row) => sum + row.remaining, 0);
  return { total, count: rows.length, rows };
}

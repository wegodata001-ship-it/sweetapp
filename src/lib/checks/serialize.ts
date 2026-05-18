import {
  checkDisplayStatus,
  checkTier,
  daysUntilDue,
  displayTier,
  effectiveCheckStatus,
  type CheckDisplayStatus,
} from "@/lib/checks/helpers";
import type { CheckStatus } from "@/lib/checks/types";

export type SerializedCheck = ReturnType<typeof serializeCheck>;

export function serializeCheck(row: {
  id: string;
  customerId: string;
  customer?: { id: string; name: string; phone: string | null } | null;
  paymentId: string | null;
  documentId: string | null;
  document?: { id: string; title: string | null } | null;
  checkNumber: string;
  bankName: string;
  branch: string | null;
  amount: number;
  dueDate: Date;
  status: string;
  bounceReason: string | null;
  notes: string | null;
  depositedAt: Date | null;
  clearedAt: Date | null;
  bouncedAt: Date | null;
  cancelledAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const status = row.status as CheckStatus;
  const display: CheckDisplayStatus = checkDisplayStatus({ status, dueDate: row.dueDate });
  const tier = displayTier(display) || checkTier({ status, dueDate: row.dueDate });
  const effective = effectiveCheckStatus({ status, dueDate: row.dueDate });
  const days = daysUntilDue(row.dueDate);
  const pendingClearance = status === "PENDING" || status === "DEPOSITED";

  return {
    id: row.id,
    customer_id: row.customerId,
    customer: row.customer
      ? { id: row.customer.id, name: row.customer.name, phone: row.customer.phone }
      : null,
    payment_id: row.paymentId,
    document_id: row.documentId,
    document: row.document ? { id: row.document.id, title: row.document.title } : null,

    check_number: row.checkNumber,
    bank_name: row.bankName,
    branch: row.branch,
    amount: row.amount,
    due_date: row.dueDate.toISOString().slice(0, 10),
    status,
    effective_status: effective,
    display_status: display,
    tier,
    days_until_due: days,
    is_overdue: days < 0 && (status === "PENDING" || status === "DEPOSITED"),
    pending_clearance: pendingClearance,
    bounce_reason: row.bounceReason,
    notes: row.notes,

    deposited_at: row.depositedAt?.toISOString() ?? null,
    cleared_at: row.clearedAt?.toISOString() ?? null,
    bounced_at: row.bouncedAt?.toISOString() ?? null,
    cancelled_at: row.cancelledAt?.toISOString() ?? null,

    created_by_id: row.createdById,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

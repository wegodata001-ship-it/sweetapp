import { hasRecentNotification } from "@/lib/notifications/dedupe";
import { notifyAdminRecipients, toneToColor } from "@/lib/notifications/dispatch";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";

async function notifyScanAdmins(params: {
  type: "SYSTEM_ALERT" | "NEW_UPDATE";
  title: string;
  message: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dedupeKey: string;
  dedupeValue: string;
  metadata: Record<string, unknown>;
  sendEmail: boolean;
}): Promise<void> {
  const adminIds = await listStaffAlertRecipientIds();
  if (!adminIds.length) return;

  const dup = await hasRecentNotification({
    type: params.type,
    roleTarget: "ADMIN",
    metadataKey: params.dedupeKey,
    metadataValue: params.dedupeValue,
    sinceHours: 24,
  });
  if (dup) return;

  await notifyAdminRecipients(adminIds, {
    type: params.type,
    title: params.title,
    message: params.message,
    color: toneToColor(params.priority === "CRITICAL" ? "DANGER" : "WARNING"),
    priority: params.priority,
    actionUrl: "/finance/register",
    metadata: {
      ...params.metadata,
      scanAlert: params.sendEmail,
      emailImportance: params.sendEmail ? undefined : "NONE",
      source: "document_scan",
    },
  });
}

export async function notifyDocumentScanSuccess(params: {
  fileName: string;
  fileHash: string;
}): Promise<void> {
  await notifyScanAdmins({
    type: "NEW_UPDATE",
    title: "מסמך חדש נסרק",
    message: `המסמך "${params.fileName}" נסרק בהצלחה`,
    priority: "LOW",
    dedupeKey: "fileHash",
    dedupeValue: params.fileHash,
    metadata: { fileHash: params.fileHash, fileName: params.fileName, scanKind: "success" },
    sendEmail: false,
  });
}

export async function notifyDocumentScanFailed(params: {
  fileName: string;
  fileHash: string;
  reason: string;
}): Promise<void> {
  await notifyScanAdmins({
    type: "SYSTEM_ALERT",
    title: "סריקת מסמך נכשלה",
    message: `${params.fileName}: ${params.reason}`,
    priority: "HIGH",
    dedupeKey: "fileHash",
    dedupeValue: params.fileHash,
    metadata: {
      fileHash: params.fileHash,
      fileName: params.fileName,
      scanKind: "failed",
      reason: params.reason,
      systemAlert: true,
    },
    sendEmail: true,
  });
}

export async function notifyDocumentScanUnlinked(params: {
  fileName: string;
  fileHash: string;
  supplierName?: string | null;
}): Promise<void> {
  const label = params.supplierName?.trim() || "ספק לא מזוהה";
  await notifyScanAdmins({
    type: "SYSTEM_ALERT",
    title: "מסמך ללא שיוך",
    message: `${params.fileName} — ${label}`,
    priority: "MEDIUM",
    dedupeKey: "fileHash",
    dedupeValue: params.fileHash,
    metadata: {
      fileHash: params.fileHash,
      fileName: params.fileName,
      supplierName: params.supplierName,
      scanKind: "unlinked",
      systemAlert: true,
    },
    sendEmail: true,
  });
}

export async function notifySystemFailure(params: {
  title: string;
  message: string;
  dedupeKey: string;
  dedupeValue: string;
  priority?: "HIGH" | "CRITICAL";
  actionUrl?: string;
}): Promise<void> {
  const adminIds = await listStaffAlertRecipientIds();
  if (!adminIds.length) return;

  const dup = await hasRecentNotification({
    type: "SYSTEM_ALERT",
    roleTarget: "ADMIN",
    metadataKey: params.dedupeKey,
    metadataValue: params.dedupeValue,
    sinceHours: 24,
  });
  if (dup) return;

  await notifyAdminRecipients(adminIds, {
    type: "SYSTEM_ALERT",
    title: params.title,
    message: params.message,
    color: toneToColor(params.priority === "CRITICAL" ? "DANGER" : "WARNING"),
    priority: params.priority ?? "HIGH",
    actionUrl: params.actionUrl ?? "/admin",
    metadata: {
      [params.dedupeKey]: params.dedupeValue,
      systemAlert: true,
      source: "system_failure",
    },
  });
}

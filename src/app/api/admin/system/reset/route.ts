import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { requireDb } from "@/lib/api-route";
import {
  exportClientDataBackup,
  resetClientSystemData,
} from "@/lib/system/reset-client-data";
import { countOpenInvoices } from "@/lib/finance/open-invoices";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST — RESET CLIENT SYSTEM (SUPER_ADMIN)
 * Body: { "confirm": "RESET_CLIENT" }
 */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "SUPER_ADMIN בלבד" }, { status: 403 });
  }

  let body: { confirm?: string };
  try {
    body = (await req.json()) as { confirm?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON לא תקין" }, { status: 400 });
  }

  if (body.confirm !== "RESET_CLIENT") {
    return NextResponse.json(
      { ok: false, error: 'יש לשלוח confirm: "RESET_CLIENT"' },
      { status: 400 },
    );
  }

  console.log("[CLIENT RESET] started by", session.id, session.email);

  const backup = await exportClientDataBackup();
  const openBefore = await countOpenInvoices({ log: true });
  const stats = await resetClientSystemData();
  const openAfter = await countOpenInvoices({ log: true });

  return NextResponse.json({
    ok: true,
    data: {
      stats,
      openInvoicesBefore: openBefore,
      openInvoicesAfter: openAfter,
      backupCounts: backup.counts,
      message: "מערכת אופסה — מוכנה ללקוח",
    },
  });
}

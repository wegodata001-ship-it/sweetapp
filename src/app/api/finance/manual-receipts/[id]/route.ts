import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { requireDb } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { findOrCreateSupplier, isDatabaseSaveError } from "@/lib/finance/supplier-resolve";
import {
  assertExpenseLink,
  auditSnapshot,
  parseBody,
  serialize,
  writeAudit,
} from "../route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.manualReceipt.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ ok: false, error: "הקבלה לא נמצאה" }, { status: 404 });

  const parsed = parseBody((await req.json()) as Parameters<typeof parseBody>[0]);
  if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const linkError = await assertExpenseLink(parsed.data.linkedFinancialDocumentId, id);
  if (linkError) return NextResponse.json({ ok: false, error: linkError }, { status: 400 });

  try {
    const before = auditSnapshot(existing);
    const updated = await prisma.$transaction(async (tx) => {
      await findOrCreateSupplier(tx, parsed.data.supplierName);
      return tx.manualReceipt.update({ where: { id }, data: parsed.data });
    });
    await writeAudit(session.sub, "manual_receipt_update", id, before, auditSnapshot(updated));
    return NextResponse.json({ ok: true, data: serialize(updated) });
  } catch (e) {
    if (isDatabaseSaveError(e)) {
      console.error("manual receipt update failed");
      return NextResponse.json({ ok: false, error: "לא נשמר המסמך" }, { status: 500 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.manualReceipt.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ ok: false, error: "הקבלה לא נמצאה" }, { status: 404 });
  const before = auditSnapshot(existing);
  await prisma.manualReceipt.delete({ where: { id } });
  await writeAudit(session.sub, "manual_receipt_delete", id, before, null);
  return NextResponse.json({ ok: true });
}

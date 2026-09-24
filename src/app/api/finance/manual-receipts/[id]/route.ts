import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { requireDb } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
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

  const before = auditSnapshot(existing);
  const updated = await prisma.manualReceipt.update({ where: { id }, data: parsed.data });
  await writeAudit(session.sub, "manual_receipt_update", id, before, auditSnapshot(updated));
  return NextResponse.json({ ok: true, data: serialize(updated) });
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

import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { normalizeSupplierName } from "@/lib/document-scan/supplier-aliases";
import { parsePayload } from "@/lib/finance/document-payload";
import { syncExpenseDocumentLedgerEntry } from "@/lib/finance/expense-ledger-sync";
import { normalizeExpenseType } from "@/lib/finance/expense-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function partyName(title: string, metadata: unknown): string {
  const payload = parsePayload(metadata);
  if (payload?.kind === "expense" && payload.counterpartyName.trim()) return payload.counterpartyName.trim();
  const parts = title.split("—");
  return (parts[1] ?? parts[0] ?? title).trim();
}

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });

  const [docs, suppliers] = await Promise.all([
    prisma.financialDocument.findMany({
      where: { category: "הוצאה", supplierId: null },
      select: {
        id: true,
        title: true,
        docDate: true,
        createdAt: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        metadata: true,
        supplierId: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const rows = docs
    .filter((doc) => {
      const payload = parsePayload(doc.metadata);
      return payload?.kind === "expense" && normalizeExpenseType(payload.expenseType) === "SUPPLIER_PAYMENTS";
    })
    .map((doc) => ({
      id: doc.id,
      date: (doc.docDate ?? doc.createdAt).toISOString().slice(0, 10),
      partyName: partyName(doc.title, doc.metadata),
      documentNumber: doc.title,
      totalAmount: doc.totalAmount,
      paidAmount: doc.paidAmount,
      remainingAmount: doc.remainingAmount,
      supplierId: doc.supplierId,
    }));

  return NextResponse.json({ ok: true, data: rows, suppliers });
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });

  const body = (await req.json()) as { documentId?: string; supplierId?: string; newSupplierName?: string };
  if (!body.documentId) return NextResponse.json({ ok: false, error: "חסר מסמך" }, { status: 400 });

  const doc = await prisma.financialDocument.findUnique({ where: { id: body.documentId } });
  if (!doc || doc.supplierId) return NextResponse.json({ ok: false, error: "המסמך כבר משויך או לא נמצא" }, { status: 400 });
  const payload = parsePayload(doc.metadata);
  if (payload?.kind !== "expense" || normalizeExpenseType(payload.expenseType) !== "SUPPLIER_PAYMENTS") {
    return NextResponse.json({ ok: false, error: "המסמך אינו תשלום ספק" }, { status: 400 });
  }

  let supplierId = body.supplierId?.trim() || "";
  if (!supplierId && body.newSupplierName?.trim()) {
    const name = body.newSupplierName.trim();
    const wanted = normalizeSupplierName(name);
    const existing = await prisma.supplier.findMany({ select: { id: true, name: true } });
    const match = existing.find((row) => normalizeSupplierName(row.name) === wanted);
    supplierId = match?.id ?? (await prisma.supplier.create({ data: { name } })).id;
  }
  if (!supplierId) return NextResponse.json({ ok: false, error: "יש לבחור ספק או ליצור ספק" }, { status: 400 });

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
  if (!supplier) return NextResponse.json({ ok: false, error: "הספק לא נמצא" }, { status: 404 });

  const nextMeta = payload.kind === "expense" ? { ...payload, supplierId: supplier.id, counterpartyName: supplier.name } : payload;
  await prisma.$transaction(async (tx) => {
    await tx.financialDocument.update({
      where: { id: doc.id },
      data: { supplierId: supplier.id, metadata: nextMeta },
    });
    await syncExpenseDocumentLedgerEntry(doc.id, tx);
  });

  return NextResponse.json({ ok: true, supplierId: supplier.id });
}

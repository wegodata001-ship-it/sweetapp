import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

/** רישום ידני לכרטסת ספק או עובד */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const body = (await req.json()) as {
      supplierId?: string | null;
      employeeId?: string | null;
      entryDate: string;
      docType: string;
      description: string;
      debit?: number;
      credit?: number;
    };
    const hasS = Boolean(body.supplierId);
    const hasE = Boolean(body.employeeId);
    if ((hasS && hasE) || (!hasS && !hasE)) {
      return NextResponse.json({ ok: false, error: "נא לבחור ספק או עובד בלבד" }, { status: 400 });
    }
    if (!body.entryDate || !body.docType?.trim()) {
      return NextResponse.json({ ok: false, error: "חסרים שדות" }, { status: 400 });
    }

    const row = await prisma.ledgerEntry.create({
      data: {
        entryDate: new Date(body.entryDate),
        docType: body.docType.trim(),
        description: body.description?.trim() || "",
        debit: body.debit ?? 0,
        credit: body.credit ?? 0,
        supplierId: body.supplierId ?? null,
        employeeId: body.employeeId ?? null,
      },
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

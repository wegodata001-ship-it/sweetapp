import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { appendSupplierAlias } from "@/lib/ocr/supplier-aliases";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Link OCR supplier name to existing supplier + save alias for future scans. */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const body = (await req.json()) as { supplierId?: string; ocrName?: string };
    const supplierId = body.supplierId?.trim();
    const ocrName = body.ocrName?.trim();
    if (!supplierId || !ocrName) {
      return NextResponse.json({ ok: false, error: "supplierId and ocrName required" }, { status: 400 });
    }
    const existing = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, notes: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "supplier not found" }, { status: 404 });
    }
    const notes = appendSupplierAlias(existing.notes, ocrName);
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { notes },
    });
    return NextResponse.json({
      ok: true,
      data: { id: existing.id, name: existing.name },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
}

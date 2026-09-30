import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { findOrCreateSupplier, isDatabaseSaveError } from "@/lib/finance/supplier-resolve";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const rows = await prisma.supplier.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        updatedAt: true,
        createdAt: true,
        _count: { select: { supplierProducts: true } },
      },
    });
    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      updatedAt: r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      productCount: r._count.supplierProducts,
    }));
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const body = (await req.json()) as {
      name: string;
      phone?: string | null;
      email?: string | null;
      notes?: string | null;
      openingBalance?: number;
    };
    if (!body.name?.trim()) return NextResponse.json({ ok: false, error: "חסר שם" }, { status: 400 });
    const row = await prisma.$transaction(async (tx) => {
      const resolved = await findOrCreateSupplier(tx, body.name, {
        phone: body.phone,
        email: body.email,
        notes: body.notes,
        openingBalance: body.openingBalance,
      });
      if (!resolved) return null;
      return tx.supplier.findUnique({
        where: { id: resolved.id },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          updatedAt: true,
          createdAt: true,
          _count: { select: { supplierProducts: true } },
        },
      });
    });
    if (!row) return NextResponse.json({ ok: false, error: "חסר שם" }, { status: 400 });
    return NextResponse.json({
      ok: true,
      data: {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        updatedAt: row.updatedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        productCount: row._count.supplierProducts,
      },
    });
  } catch (e) {
    if (isDatabaseSaveError(e)) {
      console.error("supplier save failed");
      return NextResponse.json({ ok: false, error: "לא נשמר המסמך" }, { status: 500 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

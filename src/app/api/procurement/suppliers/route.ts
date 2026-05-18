import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const rows = await prisma.supplier.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
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
    const row = await prisma.supplier.create({
      data: {
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        notes: body.notes?.trim() || null,
        openingBalance: body.openingBalance ?? 0,
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

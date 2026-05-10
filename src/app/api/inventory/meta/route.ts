import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const [categories, suppliers, warehouses, users] = await Promise.all([
      prisma.productCategory.findMany({ orderBy: { name: "asc" } }),
      prisma.supplier.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
      prisma.user.findMany({
        where: { isActive: true },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, email: true, role: true },
      }),
    ]);
    return NextResponse.json({
      ok: true,
      data: { categories, suppliers, warehouses, users },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

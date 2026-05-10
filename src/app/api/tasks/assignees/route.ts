import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

/** רשימת עובדים להקצאת משימות (מסך משימות — הרשאת tasks) */
export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const rows = await prisma.employee.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        role: true,
        department: true,
        phone: true,
      },
    });
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

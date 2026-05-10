import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) {
    return NextResponse.json({ ok: true, data: [] });
  }

  try {
    const rows = await prisma.product.findMany({
      where: {
        name: {
          contains: q,
          mode: "insensitive",
        },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    return NextResponse.json({ ok: true, data: rows.map((row) => row.name) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

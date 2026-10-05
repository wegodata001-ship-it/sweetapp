import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim() ?? "";
    const type = searchParams.get("type")?.trim() ?? "";
    const userId = searchParams.get("userId")?.trim() ?? "";
    const dateFrom = searchParams.get("dateFrom")?.trim() ?? "";
    const dateTo = searchParams.get("dateTo")?.trim() ?? "";

    const where: Prisma.GeneratedReportWhereInput = {};

    if (type) where.type = type;

    if (userId) where.createdById = userId;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        const d = new Date(dateFrom);
        if (Number.isFinite(d.getTime())) where.createdAt.gte = d;
      }
      if (dateTo) {
        const d = new Date(dateTo);
        if (Number.isFinite(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          where.createdAt.lte = d;
        }
      }
    }

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { fileName: { contains: q, mode: "insensitive" } },
      ];
    }

    const takeRaw = Number(searchParams.get("take") ?? "50");
    const take = Number.isFinite(takeRaw) ? Math.min(200, Math.max(1, Math.floor(takeRaw))) : 50;
    const rows = await prisma.generatedReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    const hasMore = rows.length > take;
    const data = rows.slice(0, take).map((row) => ({ ...row, publicUrl: null, pdfUrl: null }));

    return NextResponse.json({ ok: true, data, hasMore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

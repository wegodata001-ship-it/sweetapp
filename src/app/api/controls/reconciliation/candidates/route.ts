import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { ReconCandidateOrderDto } from "@/lib/controls/reconciliation-types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    const or: Prisma.FutureOrderWhereInput[] = [];
    if (q) {
      or.push({ customerName: { contains: q, mode: "insensitive" } });
      or.push({ customerCode: { contains: q, mode: "insensitive" } });
      const asNum = Number(q.replace(/[^0-9]/g, ""));
      if (Number.isFinite(asNum) && asNum > 0) or.push({ orderNumber: asNum });
    }

    const orders = await prisma.futureOrder.findMany({
      where: or.length ? { OR: or } : {},
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerCode: true,
        weekCode: true,
        totalAmount: true,
      },
    });

    const data: ReconCandidateOrderDto[] = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      customerCode: o.customerCode ?? null,
      weekCode: o.weekCode ?? null,
      totalAmount: o.totalAmount,
    }));
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

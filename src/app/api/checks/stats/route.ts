import { NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET() {
  const block = await requireDb();
  if (block) return block;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inSeven = new Date(today.getTime() + 7 * MS_PER_DAY);
    const inThirty = new Date(today.getTime() + 30 * MS_PER_DAY);

    const [openCount, overdueAgg, weekAgg, bouncedAgg, futureAgg, dueTodayAgg, byBank, recent] =
      await Promise.all([
        prismaAny.checkPayment.count({ where: { status: { in: ["PENDING", "DEPOSITED"] } } }),
        prismaAny.checkPayment.aggregate({
          where: {
            status: { in: ["PENDING", "DEPOSITED"] },
            dueDate: { lt: today },
          },
          _count: true,
          _sum: { amount: true },
        }),
        prismaAny.checkPayment.aggregate({
          where: {
            status: { in: ["PENDING", "DEPOSITED"] },
            dueDate: { gte: today, lte: inSeven },
          },
          _count: true,
          _sum: { amount: true },
        }),
        prismaAny.checkPayment.aggregate({
          where: { status: "BOUNCED" },
          _count: true,
          _sum: { amount: true },
        }),
        prismaAny.checkPayment.aggregate({
          where: {
            status: { in: ["PENDING", "DEPOSITED"] },
            dueDate: { gte: today },
          },
          _count: true,
          _sum: { amount: true },
        }),
        prismaAny.checkPayment.aggregate({
          where: {
            status: { in: ["PENDING", "DEPOSITED"] },
            dueDate: { gte: today, lt: new Date(today.getTime() + MS_PER_DAY) },
          },
          _count: true,
          _sum: { amount: true },
        }),
        prismaAny.checkPayment.groupBy({
          by: ["bankName"],
          where: { status: { in: ["PENDING", "DEPOSITED"] } },
          _count: { _all: true },
          _sum: { amount: true },
          orderBy: { _count: { bankName: "desc" } },
        }),
        prismaAny.checkPayment.findMany({
          where: {
            status: { in: ["PENDING", "DEPOSITED"] },
            dueDate: { gte: today, lte: inThirty },
          },
          orderBy: { dueDate: "asc" },
          take: 8,
          include: { customer: { select: { id: true, name: true } } },
        }),
      ]);

    return NextResponse.json({
      ok: true,
      data: {
        open_count: openCount,
        overdue: {
          count: overdueAgg._count ?? 0,
          amount: overdueAgg._sum.amount ?? 0,
        },
        due_this_week: {
          count: weekAgg._count ?? 0,
          amount: weekAgg._sum.amount ?? 0,
        },
        due_today: {
          count: dueTodayAgg._count ?? 0,
          amount: dueTodayAgg._sum.amount ?? 0,
        },
        bounced: {
          count: bouncedAgg._count ?? 0,
          amount: bouncedAgg._sum.amount ?? 0,
        },
        future: {
          count: futureAgg._count ?? 0,
          amount: futureAgg._sum.amount ?? 0,
        },
        by_bank: (byBank as Array<{ bankName: string; _count: { _all: number }; _sum: { amount: number | null } }>).map(
          (b) => ({
            bank: b.bankName,
            count: b._count._all,
            amount: b._sum.amount ?? 0,
          }),
        ),
        upcoming: (recent as Array<{
          id: string;
          checkNumber: string;
          amount: number;
          dueDate: Date;
          status: string;
          customer: { id: string; name: string } | null;
        }>).map((r) => ({
          id: r.id,
          check_number: r.checkNumber,
          amount: r.amount,
          due_date: r.dueDate.toISOString().slice(0, 10),
          status: r.status,
          customer: r.customer,
        })),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

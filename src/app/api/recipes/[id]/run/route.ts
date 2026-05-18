import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "לא מחובר" }, { status: 401 });
  const { id: recipeId } = await ctx.params;
  try {
    const run = await prisma.recipeRun.findFirst({
      where: { recipeId, userId: session.sub, status: "active" },
      include: {
        stepRecords: { include: { recipeStep: true } },
      },
    });
    return NextResponse.json({ ok: true, data: run });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "לא מחובר" }, { status: 401 });
  const { id: recipeId } = await ctx.params;
  const userId = session.sub;

  try {
    const body = (await req.json()) as {
      action: "start" | "cancel" | "start_step" | "complete_step";
      recipeStepId?: string;
      lateReason?: string | null;
    };

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, isActive: true },
      include: { steps: { orderBy: { orderIndex: "asc" } } },
    });
    if (!recipe) return NextResponse.json({ ok: false, error: "מתכון לא נמצא" }, { status: 404 });

    if (body.action === "cancel") {
      await prisma.recipeRun.updateMany({
        where: { recipeId, userId, status: "active" },
        data: { status: "cancelled", activeStepId: null, stepStartedAt: null },
      });
      return NextResponse.json({ ok: true, data: null });
    }

    if (body.action === "start") {
      const existing = await prisma.recipeRun.findFirst({
        where: { recipeId, userId, status: "active" },
      });
      if (existing) {
        return NextResponse.json({ ok: true, data: existing });
      }
      const run = await prisma.$transaction(async (tx) => {
        const r = await tx.recipeRun.create({
          data: { recipeId, userId, status: "active" },
        });
        await tx.recipeRunStep.createMany({
          data: recipe.steps.map((s) => ({
            recipeRunId: r.id,
            recipeStepId: s.id,
          })),
        });
        return r;
      });
      const full = await prisma.recipeRun.findUnique({
        where: { id: run.id },
        include: { stepRecords: { include: { recipeStep: true } } },
      });
      return NextResponse.json({ ok: true, data: full });
    }

    const run = await prisma.recipeRun.findFirst({
      where: { recipeId, userId, status: "active" },
      include: { stepRecords: true },
    });
    if (!run) return NextResponse.json({ ok: false, error: "אין הרצה פעילה" }, { status: 400 });

    const byStep = new Map(run.stepRecords.map((x) => [x.recipeStepId, x]));

    if (body.action === "start_step") {
      if (!body.recipeStepId) return NextResponse.json({ ok: false, error: "חסר שלב" }, { status: 400 });
      if (run.activeStepId && run.activeStepId !== body.recipeStepId) {
        return NextResponse.json({ ok: false, error: "יש להשלים את השלב הנוכחי לפני מעבר" }, { status: 400 });
      }
      const step = recipe.steps.find((s) => s.id === body.recipeStepId);
      if (!step) return NextResponse.json({ ok: false, error: "שלב לא קיים" }, { status: 400 });
      const rs = byStep.get(step.id);
      if (!rs) return NextResponse.json({ ok: false, error: "שגיאת הרצה" }, { status: 400 });
      if (rs.completedAt) return NextResponse.json({ ok: false, error: "שלב כבר הושלם" }, { status: 400 });
      if (rs.startedAt && !rs.completedAt) {
        return NextResponse.json({ ok: false, error: "השלב כבר פעיל" }, { status: 400 });
      }

      for (const s of recipe.steps) {
        if (s.orderIndex >= step.orderIndex) break;
        const prev = byStep.get(s.id);
        if (!prev?.completedAt) {
          return NextResponse.json({ ok: false, error: "יש להשלים שלבים קודמים" }, { status: 400 });
        }
      }

      const now = new Date();
      await prisma.$transaction([
        prisma.recipeRunStep.update({
          where: { id: rs.id },
          data: { startedAt: now },
        }),
        prisma.recipeRun.update({
          where: { id: run.id },
          data: { activeStepId: step.id, stepStartedAt: now },
        }),
      ]);
      const full = await prisma.recipeRun.findUnique({
        where: { id: run.id },
        include: { stepRecords: { include: { recipeStep: true } } },
      });
      return NextResponse.json({ ok: true, data: full });
    }

    if (body.action === "complete_step") {
      if (!body.recipeStepId) return NextResponse.json({ ok: false, error: "חסר שלב" }, { status: 400 });
      if (run.activeStepId !== body.recipeStepId) {
        return NextResponse.json({ ok: false, error: "שלב זה אינו הפעיל" }, { status: 400 });
      }
      const step = recipe.steps.find((s) => s.id === body.recipeStepId);
      if (!step || !run.stepStartedAt) {
        return NextResponse.json({ ok: false, error: "מצב לא תקין" }, { status: 400 });
      }
      const rs = byStep.get(step.id);
      if (!rs) return NextResponse.json({ ok: false, error: "שגיאת הרצה" }, { status: 400 });

      const now = new Date();
      const budgetMs = Math.max(1, step.estimatedMinutes) * 60_000;
      const late = now.getTime() - run.stepStartedAt.getTime() > budgetMs;
      const reason = body.lateReason?.trim() ?? "";
      if (late && !reason) {
        return NextResponse.json({ ok: false, error: "late_reason_required" }, { status: 400 });
      }

      const incompleteBefore = await prisma.recipeRunStep.count({
        where: {
          recipeRunId: run.id,
          completedAt: null,
          recipeStep: { orderIndex: { lt: step.orderIndex } },
        },
      });
      if (incompleteBefore > 0) {
        return NextResponse.json({ ok: false, error: "יש להשלים שלבים קודמים" }, { status: 400 });
      }

      await prisma.recipeRunStep.update({
        where: { id: rs.id },
        data: {
          completedAt: now,
          wasLate: late,
          lateReason: late ? reason : null,
        },
      });

      const remaining = await prisma.recipeRunStep.count({
        where: { recipeRunId: run.id, completedAt: null },
      });

      const done = remaining === 0;

      await prisma.recipeRun.update({
        where: { id: run.id },
        data: {
          activeStepId: null,
          stepStartedAt: null,
          ...(done ? { status: "completed" } : {}),
        },
      });

      const full = await prisma.recipeRun.findUnique({
        where: { id: run.id },
        include: { stepRecords: { include: { recipeStep: true } } },
      });
      return NextResponse.json({
        ok: true,
        data: full,
        meta: { wasLate: late, completedRecipe: done },
      });
    }

    return NextResponse.json({ ok: false, error: "פעולה לא ידועה" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

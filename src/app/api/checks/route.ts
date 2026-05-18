import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { serializeCheck } from "@/lib/checks/serialize";
import { isCheckStatus } from "@/lib/checks/helpers";

type CheckRow = Parameters<typeof serializeCheck>[0];

const CHECK_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  document: { select: { id: true, title: true } },
} as const;

function parseDateInput(input: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";
    const customerId = searchParams.get("customerId")?.trim() ?? "";
    const bankName = searchParams.get("bankName")?.trim() ?? "";
    const dueFrom = parseDateInput(searchParams.get("dueFrom"));
    const dueTo = parseDateInput(searchParams.get("dueTo"));
    const minAmountRaw = searchParams.get("minAmount");
    const maxAmountRaw = searchParams.get("maxAmount");
    const minAmount =
      minAmountRaw && minAmountRaw.trim() !== "" ? Number(minAmountRaw) : NaN;
    const maxAmount =
      maxAmountRaw && maxAmountRaw.trim() !== "" ? Number(maxAmountRaw) : NaN;
    const onlyOverdue = searchParams.get("onlyOverdue") === "1";

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { checkNumber: { contains: q } },
        { bankName: { contains: q } },
        { branch: { contains: q } },
        { notes: { contains: q } },
        { customer: { name: { contains: q } } },
      ];
    }
    if (status && isCheckStatus(status)) where.status = status;
    if (customerId) where.customerId = customerId;
    if (bankName) where.bankName = bankName;
    const dueRange: Record<string, Date> = {};
    if (dueFrom) dueRange.gte = dueFrom;
    if (dueTo) {
      const end = new Date(dueTo);
      end.setHours(23, 59, 59, 999);
      dueRange.lte = end;
    }
    if (Object.keys(dueRange).length > 0) where.dueDate = dueRange;
    const amountRange: Record<string, number> = {};
    if (Number.isFinite(minAmount)) amountRange.gte = minAmount;
    if (Number.isFinite(maxAmount)) amountRange.lte = maxAmount;
    if (Object.keys(amountRange).length > 0) where.amount = amountRange;

    if (onlyOverdue) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.AND = [
        { status: { in: ["PENDING", "DEPOSITED"] } },
        { dueDate: { lt: today } },
      ];
    }

    const rows = (await prismaAny.checkPayment.findMany({
      where,
      include: CHECK_INCLUDE,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    })) as CheckRow[];

    return NextResponse.json({ ok: true, data: rows.map(serializeCheck) });
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
  const session = await getSessionFromCookie();
  try {
    const body = (await req.json()) as {
      customerId?: string;
      paymentId?: string | null;
      documentId?: string | null;
      checkNumber?: string;
      bankName?: string;
      branch?: string | null;
      amount?: number;
      dueDate?: string;
      notes?: string | null;
    };

    const customerId = body.customerId?.trim();
    const checkNumber = body.checkNumber?.trim();
    const bankName = body.bankName?.trim();
    const amount = Number(body.amount);
    const due = body.dueDate ? new Date(body.dueDate) : null;

    if (!customerId || !checkNumber || !bankName || !(amount > 0) || !due || !Number.isFinite(due.getTime())) {
      return NextResponse.json(
        { ok: false, error: "חסרים שדות חובה: לקוח, מספר צ'ק, בנק, סכום, תאריך פירעון" },
        { status: 400 },
      );
    }

    const created = (await prismaAny.checkPayment.create({
      data: {
        customerId,
        paymentId: body.paymentId || null,
        documentId: body.documentId || null,
        checkNumber,
        bankName,
        branch: body.branch?.trim() || null,
        amount,
        dueDate: due,
        notes: body.notes?.trim() || null,
        status: "PENDING",
        createdById: session?.sub ?? null,
      },
      include: CHECK_INCLUDE,
    })) as CheckRow;

    return NextResponse.json({ ok: true, data: serializeCheck(created) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

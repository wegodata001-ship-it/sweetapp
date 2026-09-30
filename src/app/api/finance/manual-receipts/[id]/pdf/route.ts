import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { generateManualReceiptPdfBytes } from "@/lib/pdf/generate-manual-receipt-pdf";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  const { id } = await params;
  try {
    const bytes = await generateManualReceiptPdfBytes(id);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="manual-receipt-${id.slice(0, 8)}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "לא ניתן להפיק PDF" }, { status: 404 });
  }
}

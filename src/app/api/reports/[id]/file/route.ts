import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { pdfContentDisposition, resolveStoredReportPdf } from "@/lib/pdf/resolve-stored-report-pdf";

export const dynamic = "force-dynamic";

const UNAVAILABLE = "לא ניתן להציג את המסמך כרגע";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const file = await resolveStoredReportPdf(id);
    if (!file) {
      return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 404 });
    }
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfContentDisposition(download ? "attachment" : "inline", file.fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("stored report pdf failed");
    return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 500 });
  }
}

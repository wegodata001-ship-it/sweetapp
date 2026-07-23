import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { getCountSessionDetail } from "@/lib/inventory/count-session-service";
import {
  countSessionExcelBuffer,
  countSessionExportFileName,
  countSessionPdfBytes,
} from "@/lib/inventory/count-session-export";

/** GET — ייצוא PDF / Excel לסשן ספירה (לא חוסם UI — רץ בצד שרת) */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const format = (req.nextUrl.searchParams.get("format") || "pdf").toLowerCase();
    if (format !== "pdf" && format !== "xlsx") {
      return NextResponse.json({ ok: false, error: "format חייב pdf או xlsx" }, { status: 400 });
    }

    const detail = await getCountSessionDetail(id);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "ספירה לא נמצאה" }, { status: 404 });
    }

    const fileName = countSessionExportFileName(detail, format);
    if (format === "xlsx") {
      const buf = countSessionExcelBuffer(detail);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          "Cache-Control": "no-store",
        },
      });
    }

    const pdf = await countSessionPdfBytes(detail);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

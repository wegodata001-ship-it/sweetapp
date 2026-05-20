import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { clearAllOcrCache } from "@/lib/ocr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST — מחיקת כל מטמון OCR (ocr_cache DB + memory) */
export async function POST() {
  const block = await requireDb();
  if (block) return block;

  const result = await clearAllOcrCache();
  return NextResponse.json({
    ok: true,
    deletedRows: result.deletedRows,
    message: "ocr_cache cleared",
  });
}

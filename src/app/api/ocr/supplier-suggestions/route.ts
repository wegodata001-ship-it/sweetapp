import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { rankSupplierSuggestions } from "@/lib/ocr/matcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ ok: true, data: [] });
  }
  const data = await rankSupplierSuggestions(q, 10);
  return NextResponse.json({ ok: true, data });
}

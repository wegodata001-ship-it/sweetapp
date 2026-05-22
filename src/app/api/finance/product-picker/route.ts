import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { searchProductPickerCatalog } from "@/lib/finance/product-picker-catalog";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET — חיפוש ממוקד (q, skip, take) — לא טוען את כל המאגר */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const supplierId = sp.get("supplierId")?.trim() || null;
  const q = sp.get("q")?.trim() ?? "";
  const skip = Math.max(0, parseInt(sp.get("skip") ?? "0", 10) || 0);
  const take = Math.min(30, Math.max(5, parseInt(sp.get("take") ?? "20", 10) || 20));

  try {
    const { rows, hasMore } = await searchProductPickerCatalog({
      q: q || undefined,
      supplierId,
      skip,
      take,
    });
    return NextResponse.json({ ok: true, data: rows, hasMore });
  } catch (e) {
    console.error("[GET /api/finance/product-picker]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/** POST — הוספת מוצר חדש למאגר */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  let body: { name?: string; price?: number; unit?: string | null; supplierId?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON לא תקין" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ ok: false, error: "חסר שם מוצר" }, { status: 400 });
  }

  const price = Number(body.price ?? 0);
  const unit = body.unit?.trim() || null;
  const supplierId = body.supplierId?.trim() || null;

  try {
    if (supplierId) {
      const regularPrice = Number.isFinite(price) && price >= 0 ? price : 0;
      const p = await prisma.supplierProduct.create({
        data: {
          supplierId,
          productName: name,
          regularPrice,
          unit,
        },
        select: {
          id: true,
          productName: true,
          regularPrice: true,
          unit: true,
          supplierId: true,
          supplier: { select: { name: true } },
        },
      });
      await prisma.supplierProductPriceHistory.create({
        data: { supplierProductId: p.id, price: regularPrice, source: "manual" },
      });
      return NextResponse.json({
        ok: true,
        data: {
          key: `sp:${p.id}`,
          name: p.productName,
          lastPrice: regularPrice,
          unit: p.unit,
          supplierId: p.supplierId,
          supplierName: p.supplier.name,
          supplierProductId: p.id,
          productId: null,
          vatMode: "includes_vat" as const,
        },
      });
    }

    const product = await prisma.product.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true, name: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        key: `p:${product.id}`,
        name: product.name,
        lastPrice: Number.isFinite(price) && price > 0 ? price : 0,
        unit,
        supplierId: null,
        supplierName: null,
        supplierProductId: null,
        productId: product.id,
        vatMode: "includes_vat" as const,
      },
    });
  } catch (e) {
    console.error("[POST /api/finance/product-picker]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

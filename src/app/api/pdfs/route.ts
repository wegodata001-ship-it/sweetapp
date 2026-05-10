import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getPublicStorageUrl, getSupabaseServiceClient } from "@/lib/supabase/server";

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET?.trim() || "pdf_photo";
const VAT_RATE = 0.18;

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function vatLabel(vatType: string | null): string {
  if (vatType === "before_vat") return "ללא מע״מ";
  if (vatType === "exempt") return "פטור ממע״מ";
  return "כולל מע״מ";
}

async function loadHebrewFont(pdfDoc: PDFDocument) {
  try {
    const url =
      "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanshebrew/NotoSansHebrew%5Bwdth%2Cwght%5D.ttf";
    const res = await fetch(url);
    if (!res.ok) throw new Error("font fetch");
    const bytes = new Uint8Array(await res.arrayBuffer());
    return pdfDoc.embedFont(bytes);
  } catch {
    return pdfDoc.embedFont(StandardFonts.Helvetica);
  }
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  try {
    const body = (await req.json()) as { documentId?: string; paymentId?: string };

    const pdfDoc = await PDFDocument.create();
    const font = await loadHebrewFont(pdfDoc);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let page = pdfDoc.addPage([595.28, 841.89]);
    let { height } = page.getSize();
    let y = height - 48;
    const margin = 48;
    const lineH = 14;
    const footerText = "תודה שבחרתם בנו";

    const ensureSpace = (need: number) => {
      if (y - need < 72) {
        page = pdfDoc.addPage([595.28, 841.89]);
        height = page.getSize().height;
        y = height - margin;
      }
    };

    page.drawText("WEGO REPORT", { x: margin, y, size: 18, font: bold, color: rgb(0.1, 0.15, 0.2) });
    y -= 28;

    const businessName = process.env.WEGO_BUSINESS_NAME || "WEGO";
    page.drawText(businessName, { x: margin, y, size: 11, font });
    y -= 22;

    if (body.documentId) {
      const doc = await prisma.financialDocument.findUnique({
        where: { id: body.documentId },
        include: {
          customer: true,
          items: { orderBy: { id: "asc" } },
          payments: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!doc) return NextResponse.json({ ok: false, error: "מסמך לא נמצא" }, { status: 404 });

      const headerLines = [
        `פרטי מסמך: ${doc.title}`,
        `מספר מסמך: ${doc.id}`,
        `שם לקוח: ${doc.customer?.name ?? "—"}`,
        `תאריך: ${doc.docDate ? doc.docDate.toISOString().slice(0, 10) : "—"}`,
        `סוג הזמנה: ${doc.documentType}`,
        `סטטוס תשלום: ${doc.paymentStatus}`,
      ];
      for (const line of headerLines) {
        ensureSpace(lineH + 4);
        page.drawText(line, { x: margin, y, size: 10, font, maxWidth: 500 });
        y -= lineH;
      }

      y -= 8;
      ensureSpace(20);
      page.drawText("טבלת פריטים", { x: margin, y, size: 12, font: bold });
      y -= 18;

      ensureSpace(lineH);
      const hdr =
        "שם פריט          כמות          מחיר          מע״מ          סה\"כ";
      page.drawText(hdr, { x: margin, y, size: 9, font: bold });
      y -= lineH + 4;

      for (const it of doc.items) {
        ensureSpace(lineH + 6);
        const row = `${it.itemName}    ${it.quantity}    ${it.unitPrice.toFixed(2)}    ${vatLabel(it.vatType)}    ${it.total.toFixed(2)}`;
        page.drawText(row, { x: margin, y, size: 9, font, maxWidth: 490 });
        y -= lineH + 2;
      }

      const vatAmount = doc.items.reduce((sum, it) => {
        if (it.vatType === "exempt") return sum;
        if (it.vatType === "before_vat") return sum + it.total - it.unitPrice * it.quantity;
        return sum + it.total - it.total / (1 + VAT_RATE);
      }, 0);
      const netAmount = doc.totalAmount - vatAmount;
      for (const line of [
        `סכום לפני מע״מ: ${netAmount.toFixed(2)}`,
        `מע״מ: ${vatAmount.toFixed(2)}`,
        `סה״כ: ${doc.totalAmount.toFixed(2)}`,
      ]) {
        ensureSpace(lineH + 4);
        page.drawText(line, { x: margin, y, size: 10, font, maxWidth: 500 });
        y -= lineH;
      }

      y -= 10;
      ensureSpace(24);
      page.drawText("אזור תשלומים", { x: margin, y, size: 12, font: bold });
      y -= 18;

      const payLines = [
        `סכום מסמך: ${doc.totalAmount.toFixed(2)}`,
        `שולם: ${doc.paidAmount.toFixed(2)}`,
        `נותר: ${doc.remainingAmount.toFixed(2)}`,
      ];
      for (const line of payLines) {
        ensureSpace(lineH + 4);
        page.drawText(line, { x: margin, y, size: 10, font, maxWidth: 500 });
        y -= lineH;
      }
      ensureSpace(lineH);
      page.drawText("אמצעי          סכום          הערות", { x: margin, y, size: 9, font: bold });
      y -= lineH + 4;
      for (const pay of doc.payments) {
        ensureSpace(lineH + 6);
        page.drawText(
          `${pay.paymentMethod ?? "—"}    ${pay.amount.toFixed(2)}    ${pay.notes ?? ""}`,
          { x: margin, y, size: 9, font, maxWidth: 490 },
        );
        y -= lineH + 2;
      }
    } else if (body.paymentId) {
      const pay = await prisma.payment.findUnique({
        where: { id: body.paymentId },
        include: { customer: true, document: true },
      });
      if (!pay) return NextResponse.json({ ok: false, error: "תשלום לא נמצא" }, { status: 404 });
      const lines = [
        `תשלום`,
        `לקוח: ${pay.customer.name}`,
        `מסמך: ${pay.document?.title ?? "—"}`,
        `סכום: ${pay.amount.toFixed(2)}`,
        `תאריך: ${pay.createdAt.toISOString().slice(0, 10)}`,
        pay.paymentMethod ? `אמצעי: ${pay.paymentMethod}` : "",
      ].filter(Boolean);
      for (const line of lines) {
        ensureSpace(lineH + 4);
        page.drawText(line as string, { x: margin, y, size: 11, font, maxWidth: 500 });
        y -= lineH;
      }
    } else {
      return NextResponse.json({ ok: false, error: "נדרש documentId או paymentId" }, { status: 400 });
    }

    ensureSpace(36);
    page.drawText(footerText, {
      x: margin,
      y: Math.max(margin, y - 24),
      size: 10,
      font,
      color: rgb(0.35, 0.35, 0.4),
    });

    const pdfBytes = await pdfDoc.save();
    let fileName = `doc-${body.documentId ?? body.paymentId}-${Date.now()}.pdf`;
    if (body.documentId) {
      const d = await prisma.financialDocument.findUnique({
        where: { id: body.documentId },
        include: { customer: { select: { name: true } } },
      });
      if (d) {
        const clientName = safeFilePart(d.customer?.name || "CLIENT");
        const datePart = (d.docDate ?? d.createdAt).toISOString().slice(0, 10);
        fileName = `${clientName}_${datePart}_ORDER.pdf`;
      }
    }
    const storagePath = `pdfs/${fileName}`;

    const supabase = getSupabaseServiceClient();
    let pdfUrl = "";
    let uploadOk = false;

    if (supabase) {
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      uploadOk = !upErr;
      if (uploadOk) {
        pdfUrl = getPublicStorageUrl(BUCKET, storagePath);
      }
    }

    let customerId: string | null = null;
    if (body.documentId) {
      const d = await prisma.financialDocument.findUnique({
        where: { id: body.documentId },
        select: { customerId: true },
      });
      customerId = d?.customerId ?? null;
      if (uploadOk) {
        await prisma.financialDocument.update({
          where: { id: body.documentId },
          data: { pdfStoragePath: storagePath },
        });
      }
    } else if (body.paymentId) {
      const p = await prisma.payment.findUnique({
        where: { id: body.paymentId },
        select: { customerId: true },
      });
      customerId = p?.customerId ?? null;
    }

    const rec = await prisma.generatedPdf.create({
      data: {
        pdfUrl: pdfUrl || `pending:${storagePath}`,
        documentId: body.documentId ?? null,
        customerId,
        kind: body.documentId ? "document" : "payment",
      },
    });

    return NextResponse.json({
      ok: true,
      id: rec.id,
      pdfUrl: rec.pdfUrl.startsWith("pending:") ? "" : rec.pdfUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

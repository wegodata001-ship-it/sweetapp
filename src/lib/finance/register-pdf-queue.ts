export type PdfQueueStatus = "processing" | "ready" | "failed";

export type PdfQueueUpdate = {
  status: PdfQueueStatus;
  pdfUrl?: string;
};

const POLL_MS = 1_200;
const MAX_POLLS = 45;

/** מפעיל יצירת PDF ברקע — לא ממתין לסיום */
export function enqueueDocumentPdf(documentId: string): void {
  void fetch(`/api/documents/${encodeURIComponent(documentId)}/pdf`, {
    method: "POST",
    credentials: "same-origin",
  });
}

export function enqueuePaymentPdf(paymentId: string): void {
  void fetch(`/api/payments/${encodeURIComponent(paymentId)}/pdf`, {
    method: "POST",
    credentials: "same-origin",
  });
}

export function pollDocumentPdf(
  documentId: string,
  onUpdate: (u: PdfQueueUpdate) => void,
): void {
  const statusUrl = `/api/documents/${encodeURIComponent(documentId)}/pdf`;
  void (async () => {
    onUpdate({ status: "processing" });
    await new Promise((r) => setTimeout(r, 500));
    for (let i = 0; i < MAX_POLLS; i++) {
      try {
        const res = await fetch(statusUrl, { credentials: "same-origin" });
        const j = (await res.json()) as { ok?: boolean; status?: string; pdfUrl?: string };
        if (j.status === "ready" && j.pdfUrl) {
          onUpdate({ status: "ready", pdfUrl: j.pdfUrl });
          return;
        }
        const latestRes = await fetch(
          `/api/reports/latest?relatedId=${encodeURIComponent(documentId)}`,
          { credentials: "same-origin" },
        );
        const lj = (await latestRes.json()) as { data?: { publicUrl?: string } | null };
        if (lj.data?.publicUrl) {
          onUpdate({ status: "ready", pdfUrl: lj.data.publicUrl });
          return;
        }
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    onUpdate({ status: "failed" });
  })();
}

export function pollPaymentPdf(paymentId: string, onUpdate: (u: PdfQueueUpdate) => void): void {
  const statusUrl = `/api/payments/${encodeURIComponent(paymentId)}/pdf`;
  void (async () => {
    onUpdate({ status: "processing" });
    await new Promise((r) => setTimeout(r, 500));
    for (let i = 0; i < MAX_POLLS; i++) {
      try {
        const res = await fetch(statusUrl, { credentials: "same-origin" });
        const j = (await res.json()) as { ok?: boolean; status?: string; pdfUrl?: string };
        if (j.status === "ready" && j.pdfUrl) {
          onUpdate({ status: "ready", pdfUrl: j.pdfUrl });
          return;
        }
        const latestRes = await fetch(
          `/api/reports/latest?relatedId=${encodeURIComponent(paymentId)}`,
          { credentials: "same-origin" },
        );
        const lj = (await latestRes.json()) as { data?: { publicUrl?: string } | null };
        if (lj.data?.publicUrl) {
          onUpdate({ status: "ready", pdfUrl: lj.data.publicUrl });
          return;
        }
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    onUpdate({ status: "failed" });
  })();
}

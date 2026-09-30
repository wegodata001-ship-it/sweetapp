import { isPdfPayload } from "@/lib/pdf/pdf-bytes";

export function storedReportFileUrl(reportId: string, download = false): string {
  const url = `/api/reports/${encodeURIComponent(reportId)}/file`;
  return download ? `${url}?download=1` : url;
}

export async function fetchPdfBlob(url: string): Promise<Blob> {
  const sameOrigin = url.startsWith("/") || (typeof window !== "undefined" && url.startsWith(window.location.origin));
  const res = await fetch(url, {
    credentials: sameOrigin ? "same-origin" : "omit",
    cache: "no-store",
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!res.ok || !isPdfPayload(res.headers.get("content-type"), bytes)) {
    throw new Error("not-pdf");
  }
  return new Blob([bytes], { type: "application/pdf" });
}

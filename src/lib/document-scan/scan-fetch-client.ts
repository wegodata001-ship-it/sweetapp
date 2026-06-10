import type { ScanProgressPhase } from "./scan-progress";

export type ScanStreamResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

/** קריאת סריקה עם progress אמיתי (NDJSON stream) */
export async function fetchScanWithProgress<T>(params: {
  url: string;
  form: FormData;
  onProgress: (phase: ScanProgressPhase) => void;
}): Promise<ScanStreamResult<T>> {
  params.form.set("stream", "1");

  let res: Response;
  try {
    res = await fetch(params.url, { method: "POST", body: params.form });
  } catch {
    return { ok: false, error: "network_error" };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("ndjson") || !res.body) {
    try {
      const json = (await res.json()) as {
        success?: boolean;
        ok?: boolean;
        data?: T;
        error?: string;
        code?: string;
      };
      if (json.success && json.ok && json.data) return { ok: true, data: json.data };
      return { ok: false, error: json.error ?? "scan_failed", code: json.code };
    } catch {
      return { ok: false, error: "invalid_response" };
    }
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastError: ScanStreamResult<T> = { ok: false, error: "scan_failed" };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      let msg: {
        type?: string;
        phase?: ScanProgressPhase;
        success?: boolean;
        ok?: boolean;
        data?: T;
        error?: string;
        code?: string;
      };
      try {
        msg = JSON.parse(line) as typeof msg;
      } catch {
        continue;
      }

      if (msg.type === "progress" && msg.phase) {
        params.onProgress(msg.phase);
        continue;
      }

      if (msg.type === "result" && msg.success && msg.ok && msg.data) {
        return { ok: true, data: msg.data };
      }

      if (msg.type === "error" || msg.ok === false) {
        lastError = {
          ok: false,
          error: msg.error ?? "scan_failed",
          code: msg.code,
        };
      }
    }
  }

  return lastError;
}

/** מספר עמודים מדויק ל-PDF (שרת — pdf.js) */
export async function fetchPdfPageCount(file: File): Promise<number | null> {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/scan/pdf-page-count", { method: "POST", body: form });
    const json = (await res.json()) as { ok?: boolean; pageCount?: number };
    if (!res.ok || !json.ok || typeof json.pageCount !== "number" || json.pageCount <= 0) {
      return null;
    }
    return json.pageCount;
  } catch {
    return null;
  }
}

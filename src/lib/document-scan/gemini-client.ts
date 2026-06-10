import {
  SCAN_BUSY_USER_MESSAGE,
  SCAN_TIMEOUT_USER_MESSAGE,
  ScanServiceError,
} from "@/lib/document-scan/scan-errors";

/** המתנה בין retries על 429/500/503 בלבד — סה"כ מקסימום 2+4+8 שניות */
export const GEMINI_RETRY_DELAYS_MS = [2000, 4000, 8000] as const;
/** timeout לכל ניסיון בודד */
export const GEMINI_REQUEST_TIMEOUT_MS = 20_000;

const RETRYABLE_HTTP = new Set([429, 500, 503]);
const MAX_ATTEMPTS = 4; // initial + 3 retries

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message.toLowerCase();
  return (
    e.name === "TimeoutError" ||
    e.name === "AbortError" ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("aborted")
  );
}

export type GeminiGenerateContentResult = {
  rawResponse: string;
  text: string;
  timing: {
    requestMs: number;
    responseMs: number;
  };
};

export async function callGeminiGenerateContent(params: {
  model: string;
  requestBody: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<GeminiGenerateContentResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ScanServiceError("SCAN_NOT_CONFIGURED", "GEMINI_API_KEY is not configured");
  }

  const perAttemptTimeout = params.timeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS;
  console.log("[GEMINI_START]", { model: params.model, timeoutMs: perAttemptTimeout });

  let lastError: ScanServiceError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const delayMs = GEMINI_RETRY_DELAYS_MS[attempt - 1];
      console.log(`[GEMINI_RETRY_${attempt}]`, { delayMs });
      console.log(SCAN_BUSY_USER_MESSAGE);
      await sleep(delayMs);
    }

    try {
      const requestStart = Date.now();
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          params.model,
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params.requestBody),
          signal: AbortSignal.timeout(perAttemptTimeout),
        },
      );
      const requestMs = Date.now() - requestStart;
      console.log("GEMINI_REQUEST_MS", requestMs, { attempt: attempt + 1, status: res.status });

      const responseStart = Date.now();
      const rawResponse = await res.text();
      const responseMs = Date.now() - responseStart;
      console.log("GEMINI_RESPONSE_MS", responseMs, { attempt: attempt + 1, bytes: rawResponse.length });

      if (!res.ok) {
        const msg = `Gemini HTTP ${res.status}: ${rawResponse.slice(0, 400)}`;
        if (RETRYABLE_HTTP.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
          lastError = new ScanServiceError("SCAN_PROVIDER_BUSY", msg);
          continue;
        }
        console.log("[GEMINI_FAILED]", msg);
        throw new ScanServiceError(
          RETRYABLE_HTTP.has(res.status) ? "SCAN_PROVIDER_BUSY" : "SCAN_PROVIDER_ERROR",
          RETRYABLE_HTTP.has(res.status)
            ? SCAN_TIMEOUT_USER_MESSAGE
            : msg,
        );
      }

      const parsedResponse = JSON.parse(rawResponse) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = parsedResponse.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
      if (!text?.trim()) {
        const msg = "Gemini returned no JSON text";
        console.log("[GEMINI_FAILED]", msg);
        throw new ScanServiceError("SCAN_PROVIDER_ERROR", msg);
      }

      console.log("[GEMINI_SUCCESS]", { attempt: attempt + 1, requestMs, responseMs });
      return { rawResponse, text, timing: { requestMs, responseMs } };
    } catch (e) {
      if (e instanceof ScanServiceError) {
        if (e.code === "SCAN_PROVIDER_BUSY" && attempt < MAX_ATTEMPTS - 1) {
          lastError = e;
          continue;
        }
        console.log("[GEMINI_FAILED]", e.message);
        throw e;
      }

      if (isTimeoutError(e)) {
        console.log("[GEMINI_FAILED]", "timeout", { attempt: attempt + 1, timeoutMs: perAttemptTimeout });
        throw new ScanServiceError("SCAN_TIMEOUT", SCAN_TIMEOUT_USER_MESSAGE);
      }

      const msg = e instanceof Error ? e.message : String(e);
      console.log("[GEMINI_FAILED]", msg);
      throw new ScanServiceError("SCAN_PROVIDER_ERROR", msg);
    }
  }

  console.log("[GEMINI_FAILED]", lastError?.message ?? "unknown");
  throw (
    lastError ??
    new ScanServiceError("SCAN_PROVIDER_BUSY", SCAN_TIMEOUT_USER_MESSAGE)
  );
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-1.5-flash";
}

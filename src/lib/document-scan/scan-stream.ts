import type { ScanProgressPhase } from "./scan-progress";

export type ScanStreamLine =
  | { type: "progress"; phase: ScanProgressPhase }
  | { type: "result"; success: true; ok: true; data: unknown; provider?: string; debug?: unknown }
  | { type: "error"; success: false; ok: false; error: string; code?: string; provider?: string };

export function ndjsonLine(payload: ScanStreamLine): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
}

export function scanStreamResponse(run: (report: (phase: ScanProgressPhase) => void) => Promise<ScanStreamLine>): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const push = (line: ScanStreamLine) => controller.enqueue(ndjsonLine(line));
      try {
        const result = await run((phase) => push({ type: "progress", phase }));
        push(result);
      } catch (e) {
        push({
          type: "error",
          success: false,
          ok: false,
          error: e instanceof Error ? e.message : "שגיאה בסריקה",
          provider: "gemini_vision",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

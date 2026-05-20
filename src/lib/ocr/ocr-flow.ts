import { activeOcrProviderLabel } from "./ocr-provider";

export function getOcrProvider(): string {
  return activeOcrProviderLabel();
}

/** @deprecated use getOcrProvider() */
export const OCR_PROVIDER = "dynamic" as const;

export function getOcrRuntime(): "local" | "vercel" {
  return process.env.VERCEL ? "vercel" : "local";
}

export function logOcrFlow(meta: Record<string, unknown>): void {
  console.log("[OCR FLOW]", {
    provider: getOcrProvider(),
    runtime: getOcrRuntime(),
    ...meta,
  });
}

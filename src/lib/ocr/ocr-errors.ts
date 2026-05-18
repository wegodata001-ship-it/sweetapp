export type OcrErrorCode =
  | "OCR_NOT_CONFIGURED"
  | "OCR_READ_FAILED"
  | "FILE_TOO_LARGE"
  | "OCR_PROVIDER_ERROR"
  | "OCR_TIMEOUT"
  | "OCR_PARTIAL";

export class OcrServiceError extends Error {
  readonly code: OcrErrorCode;
  readonly provider = "ocr.space" as const;

  constructor(code: OcrErrorCode, message: string) {
    super(message);
    this.name = "OcrServiceError";
    this.code = code;
  }
}

export function mapOcrSpaceMessageToCode(message: string): OcrErrorCode {
  const m = message.toLowerCase();
  if (m.includes("file size") || m.includes("too large") || m.includes("1mb")) {
    return "FILE_TOO_LARGE";
  }
  if (m.includes("timeout") || m.includes("timed out")) {
    return "OCR_TIMEOUT";
  }
  return "OCR_PROVIDER_ERROR";
}

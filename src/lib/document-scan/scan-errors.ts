export type ScanErrorCode =
  | "SCAN_NOT_CONFIGURED"
  | "SCAN_PROVIDER_ERROR"
  | "SCAN_PROVIDER_BUSY"
  | "SCAN_TIMEOUT"
  | "SCAN_READ_FAILED"
  | "VALIDATION"
  | "FILE_TOO_LARGE";

export const SCAN_BUSY_USER_MESSAGE =
  "שרת ה-AI עמוס כרגע.\nהמערכת מנסה שוב באופן אוטומטי...";

export const SCAN_TIMEOUT_USER_MESSAGE =
  "שרת הסריקה עמוס כרגע, נסה שוב בעוד מספר רגעים";

export class ScanServiceError extends Error {
  readonly code: ScanErrorCode;

  constructor(code: ScanErrorCode, message: string) {
    super(message);
    this.name = "ScanServiceError";
    this.code = code;
  }
}

/** @deprecated use ScanServiceError */
export { ScanServiceError as OcrServiceError };

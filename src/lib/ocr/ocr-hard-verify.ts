/**
 * Hard verify — Google Vision בלבד, בלי OCR.space בשקט ובלי cache ישן.
 */
import { OcrServiceError } from "./ocr-errors";

export type OcrProviderActive = "google_vision" | "ocr_space";

/** Google Vision API key בלבד (בדיקה שהמשתמש ביקש) */
export function googleVisionApiKeyPresent(): boolean {
  return Boolean(process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim());
}

/** מצב קשיח: אין fallback ל-OCR.space */
export function isGoogleOnlyMode(): boolean {
  return process.env.OCR_ALLOW_OCR_SPACE !== "1";
}

/** Layout בלבד — אין regex fallback */
export function isLayoutOnlyMode(): boolean {
  return process.env.OCR_ALLOW_TEXT_FALLBACK !== "1";
}

export function logGoogleVisionKeyCheck(): void {
  const present = googleVisionApiKeyPresent();
  console.log("[OCR HARD VERIFY] GOOGLE_CLOUD_VISION_API_KEY present:", present);
}

export function logOcrProviderActive(active: OcrProviderActive): void {
  console.log("OCR PROVIDER ACTIVE:", active);
}

/**
 * דורש מפתח API — לא OCR.space, לא service-account בלבד (למצב verify).
 */
export function assertGoogleVisionHardRequirements(): void {
  logGoogleVisionKeyCheck();
  if (!googleVisionApiKeyPresent()) {
    throw new OcrServiceError(
      "OCR_NOT_CONFIGURED",
      "Google Vision not configured — set GOOGLE_CLOUD_VISION_API_KEY in .env",
    );
  }
  logOcrProviderActive("google_vision");
}

export function resolveActiveOcrProvider(): OcrProviderActive {
  if (isGoogleOnlyMode()) {
    assertGoogleVisionHardRequirements();
    return "google_vision";
  }
  const forced = process.env.OCR_PROVIDER?.trim().toLowerCase();
  if (forced === "ocr_space" || forced === "ocr.space") return "ocr_space";
  if (googleVisionApiKeyPresent()) return "google_vision";
  return "ocr_space";
}

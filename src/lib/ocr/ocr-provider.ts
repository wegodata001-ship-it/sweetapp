import {
  googleVisionApiKeyPresent,
  isGoogleOnlyMode,
  logOcrProviderActive,
  resolveActiveOcrProvider,
  type OcrProviderActive,
} from "./ocr-hard-verify";

export type OcrProviderId = OcrProviderActive;

export function resolveOcrProvider(): OcrProviderId {
  return resolveActiveOcrProvider();
}

export function activeOcrProviderLabel(): string {
  return resolveOcrProvider();
}

export function anyOcrConfigured(): boolean {
  if (isGoogleOnlyMode()) return googleVisionApiKeyPresent();
  return googleVisionApiKeyPresent() || Boolean(process.env.OCR_SPACE_API_KEY?.trim());
}

export function logActiveOcrProvider(): OcrProviderId {
  const active = resolveOcrProvider();
  logOcrProviderActive(active);
  return active;
}

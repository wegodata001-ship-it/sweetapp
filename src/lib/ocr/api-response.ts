import { NextResponse } from "next/server";
import type { ScannedDocument } from "./types";

const PROVIDER = "ocr.space" as const;

export type ScanDebugMeta = {
  provider: string;
  confidence: number;
  textLength: number;
  itemsFound: number;
  parseDurationMs: number;
  ocrEngine?: string;
  fromCache?: boolean;
  partial?: boolean;
};

export type ScanApiSuccess = {
  success: true;
  ok: true;
  data: ScannedDocument & { error?: string; partial?: boolean };
  provider: typeof PROVIDER;
  debug?: ScanDebugMeta;
};

export type ScanApiFailure = {
  success: false;
  ok: false;
  error: string;
  provider: typeof PROVIDER;
  code?: string;
};

export function scanJsonSuccess(
  data: ScannedDocument & { error?: string; partial?: boolean },
  debug?: ScanDebugMeta,
): NextResponse<ScanApiSuccess> {
  return NextResponse.json({
    success: true,
    ok: true,
    data,
    provider: PROVIDER,
    ...(debug ? { debug } : {}),
  });
}

export function scanJsonError(
  error: string,
  status: number,
  code?: string,
): NextResponse<ScanApiFailure> {
  return NextResponse.json(
    {
      success: false,
      ok: false,
      error,
      provider: PROVIDER,
      ...(code ? { code } : {}),
    },
    { status },
  );
}

import { NextResponse } from "next/server";
import type { ScannedDocument } from "./types";

const PROVIDER = "ocr.space" as const;

export type ScanApiSuccess = {
  success: true;
  ok: true;
  data: ScannedDocument & { error?: string };
  provider: typeof PROVIDER;
};

export type ScanApiFailure = {
  success: false;
  ok: false;
  error: string;
  provider: typeof PROVIDER;
  code?: string;
};

export function scanJsonSuccess(
  data: ScannedDocument & { error?: string },
): NextResponse<ScanApiSuccess> {
  return NextResponse.json({
    success: true,
    ok: true,
    data,
    provider: PROVIDER,
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

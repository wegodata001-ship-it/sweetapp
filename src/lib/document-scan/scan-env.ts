import { isGeminiConfigured, geminiModelName } from "./gemini-client";

export function logScanEnv(): void {
  console.log("[SCAN_ENV]", {
    geminiApiKey: isGeminiConfigured(),
    geminiModel: geminiModelName(),
    scanEngine: "gemini_vision",
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
    supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  });
}

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { StorageDownloadResult, StorageDownloader } from "./storage";
import { storageCredentialsPresent } from "./storage";

export function createSupabaseDownloader(env: NodeJS.ProcessEnv = process.env): StorageDownloader | null {
  if (!storageCredentialsPresent(env)) return null;
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;

  return async (bucket: string, path: string): Promise<StorageDownloadResult> => {
    const client = getSupabaseServiceClient();
    if (!client) return { ok: false, reason: "NOT_ACCESSIBLE" };
    try {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) {
        const msg = (error?.message ?? "").toLowerCase();
        if (
          msg.includes("not found") ||
          msg.includes("object not found") ||
          msg.includes("404") ||
          msg.includes("does not exist")
        ) {
          return { ok: false, reason: "MISSING_SOURCE_FILE" };
        }
        return { ok: false, reason: "NOT_ACCESSIBLE" };
      }
      const buf = new Uint8Array(await data.arrayBuffer());
      return { ok: true, bytes: buf };
    } catch {
      return { ok: false, reason: "NOT_ACCESSIBLE" };
    }
  };
}

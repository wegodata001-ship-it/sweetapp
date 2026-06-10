import { createClient } from "@supabase/supabase-js";

/** Server-only client with service role — Storage uploads and admin operations. */
export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getPublicStorageUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, "");
  if (!base) return "";
  const safePath = encodeURIComponent(path).replace(/%2F/g, "/");
  return `${base}/storage/v1/object/public/${bucket}/${safePath}`;
}

/** Signed URL for private buckets — access only via authenticated API routes. */
export async function createSignedStorageUrl(
  bucket: string,
  path: string,
  expiresInSec = 3600,
): Promise<string | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSec);
    if (error) {
      console.error("[createSignedStorageUrl]", error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (e) {
    console.error(
      "[createSignedStorageUrl] failed",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

import { reportsBucket } from "@/lib/pdf/constants";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/** הורדת PDF מהארכיון — ללא יצירה מחדש */
export async function downloadReportFromStorage(filePath: string): Promise<Buffer | null> {
  const path = filePath?.trim();
  if (!path) return null;

  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase.storage.from(reportsBucket()).download(path);
  if (error || !data) {
    console.error("[downloadReportFromStorage]", error?.message ?? "no data", path);
    return null;
  }

  return Buffer.from(await data.arrayBuffer());
}

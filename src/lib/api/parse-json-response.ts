/**
 * Safe JSON parse for API responses (Vercel may return HTML/text on 500).
 */
export async function parseApiJson<T>(
  res: Response,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number; raw?: string }> {
  const status = res.status;
  const raw = await res.text();
  if (!raw.trim()) {
    return { ok: false, error: `Empty response (HTTP ${status})`, status, raw };
  }
  try {
    const data = JSON.parse(raw) as T;
    return { ok: true, data };
  } catch {
    const preview = raw.slice(0, 200).replace(/\s+/g, " ");
    console.error("[parseApiJson] non-JSON response:", status, preview);
    return {
      ok: false,
      error: `Server returned invalid JSON (HTTP ${status})`,
      status,
      raw: preview,
    };
  }
}

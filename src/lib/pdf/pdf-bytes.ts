/** True when the body is a PDF, not a JSON error page. */
export function isPdfPayload(contentType: string | null, bytes: Uint8Array): boolean {
  if (bytes.length >= 5) {
    const head = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!);
    if (head === "%PDF-") return true;
  }
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return type === "application/pdf" && bytes.length > 0 && bytes[0] !== 0x7b;
}

export function logEmailSent(payload: Record<string, unknown>): void {
  console.log("[EMAIL SENT]", payload);
}

export function logEmailFailed(payload: Record<string, unknown>): void {
  console.log("[EMAIL FAILED]", payload);
}

export function logEmailRetry(payload: Record<string, unknown>): void {
  console.log("[EMAIL RETRY]", payload);
}

export function logEmailError(payload: Record<string, unknown>): void {
  console.error("[EMAIL ERROR]", payload);
}

export function documentEmailBusinessId(): string {
  return (
    process.env.WEGO_COMPANY_ID?.trim() ||
    process.env.WEGO_TENANT_ID?.trim()?.replace(/^TEN_/, "") ||
    "default"
  );
}

export function normalizeContactEmail(email: string): string {
  return email.trim().toLowerCase();
}

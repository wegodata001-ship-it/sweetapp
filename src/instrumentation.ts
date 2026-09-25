export async function register() {
  const { installLatinDigits } = await import("@/lib/i18n/latin-digits");
  installLatinDigits();
}

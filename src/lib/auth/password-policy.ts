export type PasswordPolicyCode = "PASSWORD_TOO_SHORT" | "PASSWORD_NO_UPPERCASE" | "PASSWORD_NO_DIGIT";

export function passwordPolicyViolation(password: string): PasswordPolicyCode | null {
  if (password.length < 8) return "PASSWORD_TOO_SHORT";
  if (!/[A-Z]/.test(password)) return "PASSWORD_NO_UPPERCASE";
  if (!/\d/.test(password)) return "PASSWORD_NO_DIGIT";
  return null;
}

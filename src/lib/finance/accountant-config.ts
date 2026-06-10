/** כתובת המייל של רואה החשבון — להצגה ב-tooltip של מסמכים שנשלחו */
export function getAccountantRecipientEmail(): string | null {
  const fromEnv =
    process.env.ACCOUNTANT_EMAIL?.trim() || process.env.NEXT_PUBLIC_ACCOUNTANT_EMAIL?.trim();
  return fromEnv || null;
}

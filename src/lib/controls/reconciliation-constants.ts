/** בקרות → התאמת מערכות — קבועים משותפים (client + server) */

export const RECON_STATUS = {
  MATCHED: "MATCHED",
  AMOUNT_DIFFERENCE: "AMOUNT_DIFFERENCE",
  MISSING_IN_WEGO: "MISSING_IN_WEGO",
  MISSING_IN_EXTERNAL: "MISSING_IN_EXTERNAL",
  PENDING: "PENDING",
} as const;

export type ReconStatus = (typeof RECON_STATUS)[keyof typeof RECON_STATUS];

export const RECON_STATUS_VALUES: ReconStatus[] = Object.values(RECON_STATUS);

export function isReconStatus(value: string): value is ReconStatus {
  return (RECON_STATUS_VALUES as string[]).includes(value);
}

/** מדינות נתמכות להתאמה (מערכת חיצונית) */
export const RECON_COUNTRY = {
  TURKEY: "TURKEY",
  CHINA: "CHINA",
} as const;

export type ReconCountry = (typeof RECON_COUNTRY)[keyof typeof RECON_COUNTRY];

export const RECON_COUNTRY_VALUES: ReconCountry[] = Object.values(RECON_COUNTRY);

export function isReconCountry(value: string): value is ReconCountry {
  return (RECON_COUNTRY_VALUES as string[]).includes(value);
}

/** סובלנות להשוואת סכומים (₪) — מתחת לזה נחשב תואם */
export const RECON_AMOUNT_EPSILON = 0.01;

/** תוויות עברית (fallback ל-UI שאינו עובר i18n, ול-PDF/Excel) */
export const RECON_STATUS_LABELS_HE: Record<ReconStatus, string> = {
  MATCHED: "תואם",
  AMOUNT_DIFFERENCE: "פער סכום",
  MISSING_IN_WEGO: "חסר ב-WEGO",
  MISSING_IN_EXTERNAL: "חסר בחיצוני",
  PENDING: "ממתין",
};

export const RECON_COUNTRY_LABELS_HE: Record<ReconCountry, string> = {
  TURKEY: "טורקיה",
  CHINA: "סין",
};

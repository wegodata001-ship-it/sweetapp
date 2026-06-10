/** רמת אמינות לשדה — נמוך = לא מוצג כערך (לא זוהה). */
export type FieldConfidenceTier = "high" | "medium" | "low" | "none";

export type ScannedField<T> = {
  value: T | null;
  /** ערך לתצוגה — או "לא זוהה" */
  display: string;
  confidence: FieldConfidenceTier;
  confidencePercent: number | null;
  detected: boolean;
};

export type IntakeMode = "quick" | "full";

export type DocumentScanFields = {
  supplier: ScannedField<string>;
  date: ScannedField<string>;
  invoiceNumber: ScannedField<string>;
  vatId: ScannedField<string>;
  subtotal: ScannedField<number>;
  vat: ScannedField<number>;
  total: ScannedField<number>;
  documentType: ScannedField<string>;
};

export type DocumentScanResult = DocumentScanFields & {
  rawText: string;
  intakeMode: IntakeMode;
  /** שדות עם אמינות מספקת לקליטה */
  readyForConfirm: boolean;
};

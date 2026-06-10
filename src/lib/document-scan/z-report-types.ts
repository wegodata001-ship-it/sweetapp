import type { FieldConfidenceTier, ScannedField } from "./types";

export type ZReportScanFields = {
  zNumber: ScannedField<string>;
  date: ScannedField<string>;
  cashTaxable: ScannedField<number>;
  cashExempt: ScannedField<number>;
  creditTaxable: ScannedField<number>;
  creditExempt: ScannedField<number>;
  transfers: ScannedField<number>;
  grandTotal: ScannedField<number>;
};

export type ScannedZReportDto = {
  zNumber: string;
  date: string;
  cashTaxable: number;
  cashExempt: number;
  creditTaxable: number;
  creditExempt: number;
  transfers: number;
  grandTotal: number;
  cashTotal: number;
  creditTotal: number;
  receiptFileUrl?: string | null;
  receiptFileName?: string | null;
  receiptStoragePath?: string | null;
  receiptStorageBucket?: string | null;
  receiptMimeType?: string | null;
  engine: string;
  confidence: number;
  scanFields?: ZReportScanFields;
  readyForConfirm?: boolean;
  error?: string;
  partial?: boolean;
};

export type { FieldConfidenceTier };

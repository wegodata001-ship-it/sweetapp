-- תזרים מזומנים (תחזית): יתרת בנק ידנית + סוג התראה

ALTER TABLE "FinanceSettings"
  ADD COLUMN IF NOT EXISTS "forecastBankBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'CASHFLOW_SHORTAGE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "FinanceSettings" ADD COLUMN IF NOT EXISTS "forecastBankBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterEnum
DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'CASHFLOW_SHORTAGE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

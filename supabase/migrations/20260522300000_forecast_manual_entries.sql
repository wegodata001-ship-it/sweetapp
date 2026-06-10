ALTER TABLE "FinanceSettings"
ADD COLUMN IF NOT EXISTS "forecastManualEntries" JSONB NOT NULL DEFAULT '[]'::jsonb;

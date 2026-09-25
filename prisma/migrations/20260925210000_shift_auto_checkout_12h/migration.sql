-- 12-hour maximum open shift. Existing closed rows stay untouched (checkoutType NULL).

DO $$ BEGIN
  CREATE TYPE "ShiftCheckoutType" AS ENUM ('MANUAL', 'AUTO_12_HOURS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "WorkSession" ADD COLUMN IF NOT EXISTS "checkoutType" "ShiftCheckoutType";
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "checkoutType" "ShiftCheckoutType";

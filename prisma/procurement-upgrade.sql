-- Procurement: extend Supplier + catalog (reference only — prefer `npx prisma db push` or `migrate dev`)
-- PostgreSQL

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "SupplierProduct" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "regularPrice" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplierProduct_supplierId_idx" ON "SupplierProduct"("supplierId");

ALTER TABLE "SupplierProduct" DROP CONSTRAINT IF EXISTS "SupplierProduct_supplierId_fkey";
ALTER TABLE "SupplierProduct"
  ADD CONSTRAINT "SupplierProduct_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SupplierProductPriceHistory" (
    "id" TEXT NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT DEFAULT 'manual',
    CONSTRAINT "SupplierProductPriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplierProductPriceHistory_supplierProductId_idx" ON "SupplierProductPriceHistory"("supplierProductId");
CREATE INDEX IF NOT EXISTS "SupplierProductPriceHistory_recordedAt_idx" ON "SupplierProductPriceHistory"("recordedAt");

ALTER TABLE "SupplierProductPriceHistory" DROP CONSTRAINT IF EXISTS "SupplierProductPriceHistory_supplierProductId_fkey";
ALTER TABLE "SupplierProductPriceHistory"
  ADD CONSTRAINT "SupplierProductPriceHistory_supplierProductId_fkey"
  FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

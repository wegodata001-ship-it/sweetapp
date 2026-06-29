-- Order payments ledger + cashflow link (ADDITIVE ONLY — does not change existing data)

-- 1) New ledger table for actual payments recorded on a FutureOrder
CREATE TABLE IF NOT EXISTS "OrderPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PAYMENT',
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    CONSTRAINT "OrderPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderPayment_orderId_idx" ON "OrderPayment"("orderId");
CREATE INDEX IF NOT EXISTS "OrderPayment_status_idx" ON "OrderPayment"("status");
CREATE INDEX IF NOT EXISTS "OrderPayment_kind_idx" ON "OrderPayment"("kind");
CREATE INDEX IF NOT EXISTS "OrderPayment_paidAt_idx" ON "OrderPayment"("paidAt");

ALTER TABLE "OrderPayment"
  ADD CONSTRAINT "OrderPayment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "FutureOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Additive nullable links on CashFlowEntry (existing rows remain NULL — no data change)
ALTER TABLE "CashFlowEntry" ADD COLUMN IF NOT EXISTS "relatedOrderId" TEXT;
ALTER TABLE "CashFlowEntry" ADD COLUMN IF NOT EXISTS "orderPaymentId" TEXT;

CREATE INDEX IF NOT EXISTS "CashFlowEntry_relatedOrderId_idx" ON "CashFlowEntry"("relatedOrderId");
CREATE INDEX IF NOT EXISTS "CashFlowEntry_orderPaymentId_idx" ON "CashFlowEntry"("orderPaymentId");

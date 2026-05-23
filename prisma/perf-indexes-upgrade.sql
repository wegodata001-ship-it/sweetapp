-- ביצועים: אינדקסים בלבד — בטוח לנתוני לקוח
-- אין DROP TABLE, אין DELETE, אין שינוי עמודות קיימות
-- הרצה: Supabase → SQL Editor → הדבק והרץ
-- או:  cd wego-erp-v1
--     npx prisma db execute --file prisma/perf-indexes-upgrade.sql

CREATE INDEX IF NOT EXISTS "Customer_name_idx" ON "Customer"("name");

CREATE INDEX IF NOT EXISTS "Supplier_name_idx" ON "Supplier"("name");

CREATE INDEX IF NOT EXISTS "Employee_name_idx" ON "Employee"("name");

CREATE INDEX IF NOT EXISTS "SupplierProduct_productName_idx" ON "SupplierProduct"("productName");
CREATE INDEX IF NOT EXISTS "SupplierProduct_supplierId_productName_idx" ON "SupplierProduct"("supplierId", "productName");

CREATE INDEX IF NOT EXISTS "LedgerEntry_entryDate_idx" ON "LedgerEntry"("entryDate");
CREATE INDEX IF NOT EXISTS "LedgerEntry_supplierId_entryDate_idx" ON "LedgerEntry"("supplierId", "entryDate");
CREATE INDEX IF NOT EXISTS "LedgerEntry_employeeId_entryDate_idx" ON "LedgerEntry"("employeeId", "entryDate");

CREATE INDEX IF NOT EXISTS "FinancialDocument_category_idx" ON "FinancialDocument"("category");
CREATE INDEX IF NOT EXISTS "FinancialDocument_customerId_category_idx" ON "FinancialDocument"("customerId", "category");

CREATE INDEX IF NOT EXISTS "CashFlowEntry_entryDate_idx" ON "CashFlowEntry"("entryDate");
CREATE INDEX IF NOT EXISTS "CashFlowEntry_entryType_entryDate_idx" ON "CashFlowEntry"("entryType", "entryDate");

CREATE INDEX IF NOT EXISTS "Notification_recipientUserId_createdAt_idx" ON "Notification"("recipientUserId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Notification_recipientUserId_isRead_createdAt_idx" ON "Notification"("recipientUserId", "isRead", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

CREATE INDEX IF NOT EXISTS "FinancialDocument_docDate_idx" ON "FinancialDocument"("docDate");
CREATE INDEX IF NOT EXISTS "FinancialDocument_category_docDate_idx" ON "FinancialDocument"("category", "docDate");

CREATE INDEX IF NOT EXISTS "EmployeeTask_status_targetDueAt_idx" ON "EmployeeTask"("status", "targetDueAt");
CREATE INDEX IF NOT EXISTS "EmployeeTask_completedAt_idx" ON "EmployeeTask"("completedAt");

CREATE INDEX IF NOT EXISTS "FutureOrder_eventDate_idx" ON "FutureOrder"("eventDate");
CREATE INDEX IF NOT EXISTS "FutureOrder_orderCategory_status_idx" ON "FutureOrder"("orderCategory", "status");

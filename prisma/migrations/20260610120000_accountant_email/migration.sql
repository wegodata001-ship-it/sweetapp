-- AlterTable
ALTER TABLE "FinancialDocument" ADD COLUMN "sentToCpaEmail" TEXT;

-- CreateTable
CREATE TABLE "AccountantEmailLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentTo" TEXT NOT NULL,
    "sentById" TEXT,
    "attachmentsCount" INTEGER NOT NULL,
    "subject" TEXT,
    "message" TEXT,
    "resendId" TEXT,

    CONSTRAINT "AccountantEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountantEmailLog_documentId_idx" ON "AccountantEmailLog"("documentId");

-- CreateIndex
CREATE INDEX "AccountantEmailLog_sentById_idx" ON "AccountantEmailLog"("sentById");

-- CreateIndex
CREATE INDEX "AccountantEmailLog_sentAt_idx" ON "AccountantEmailLog"("sentAt");

-- AddForeignKey
ALTER TABLE "AccountantEmailLog" ADD CONSTRAINT "AccountantEmailLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FinancialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountantEmailLog" ADD CONSTRAINT "AccountantEmailLog_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

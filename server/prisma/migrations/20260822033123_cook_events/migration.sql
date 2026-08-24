-- AlterTable
ALTER TABLE "ConsumptionLog" ADD COLUMN "cookEventId" TEXT;

-- CreateIndex
CREATE INDEX "ConsumptionLog_cookEventId_idx" ON "ConsumptionLog"("cookEventId");

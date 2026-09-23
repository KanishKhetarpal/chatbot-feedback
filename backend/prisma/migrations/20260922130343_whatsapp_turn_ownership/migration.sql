-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "lockToken" TEXT,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "handledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "whatsapp_messages_direction_handledAt_idx" ON "whatsapp_messages"("direction", "handledAt");

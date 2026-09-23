-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "score" INTEGER,
ADD COLUMN     "scoreBand" TEXT,
ADD COLUMN     "scoreSignals" JSONB,
ADD COLUMN     "scoredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "whatsapp_followup_rules" ADD COLUMN     "maxScore" INTEGER,
ADD COLUMN     "minScore" INTEGER;

-- CreateIndex
CREATE INDEX "whatsapp_contacts_score_idx" ON "whatsapp_contacts"("score");

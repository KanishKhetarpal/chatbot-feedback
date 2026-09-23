-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "crmCheckedAt" TIMESTAMP(3),
ADD COLUMN     "followupAnchorAt" TIMESTAMP(3),
ADD COLUMN     "followupRuleId" TEXT,
ADD COLUMN     "followupStage" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "followupRuleId" TEXT,
ADD COLUMN     "followupStep" INTEGER;

-- CreateTable
CREATE TABLE "whatsapp_followup_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "stages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "steps" JSONB NOT NULL,
    "quietStart" TEXT NOT NULL DEFAULT '20:30',
    "quietEnd" TEXT NOT NULL DEFAULT '09:30',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_followup_rules_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "chat_agents" ADD COLUMN     "leadGateAfter" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "leadSoftAfter" INTEGER NOT NULL DEFAULT 3;

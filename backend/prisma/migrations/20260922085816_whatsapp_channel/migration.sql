-- AlterTable
ALTER TABLE "chat_widget_visitors" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'web';

-- CreateTable
CREATE TABLE "whatsapp_contacts" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "profileName" TEXT,
    "agentId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "stage" TEXT NOT NULL DEFAULT 'new',
    "botPausedUntil" TIMESTAMP(3),
    "handoffAt" TIMESTAMP(3),
    "handoffReason" TEXT,
    "optedOutAt" TIMESTAMP(3),
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "pendingOptions" JSONB,
    "followupCount" INTEGER NOT NULL DEFAULT 0,
    "nextFollowupAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT,
    "payload" JSONB,
    "source" TEXT NOT NULL DEFAULT 'bot',
    "provider" TEXT NOT NULL DEFAULT 'mcube',
    "providerMessageId" TEXT,
    "inReplyToId" TEXT,
    "optionId" TEXT,
    "optionTitle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "statusRank" INTEGER NOT NULL DEFAULT 1,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "chatMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_contacts_waId_key" ON "whatsapp_contacts"("waId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_contacts_visitorId_key" ON "whatsapp_contacts"("visitorId");

-- CreateIndex
CREATE INDEX "whatsapp_contacts_agentId_lastInboundAt_idx" ON "whatsapp_contacts"("agentId", "lastInboundAt");

-- CreateIndex
CREATE INDEX "whatsapp_contacts_nextFollowupAt_idx" ON "whatsapp_contacts"("nextFollowupAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_contactId_createdAt_idx" ON "whatsapp_messages"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_direction_createdAt_idx" ON "whatsapp_messages"("direction", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_inReplyToId_idx" ON "whatsapp_messages"("inReplyToId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_provider_providerMessageId_key" ON "whatsapp_messages"("provider", "providerMessageId");

-- AddForeignKey
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "chat_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "chat_widget_visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

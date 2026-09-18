-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "avatarUrl" TEXT,
    "heading" TEXT,
    "subheading" TEXT,
    "greeting" TEXT,
    "messagePresets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inputPlaceholder" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "responseLength" TEXT NOT NULL DEFAULT 'balanced',
    "language" TEXT NOT NULL DEFAULT 'auto',
    "useEmoji" BOOLEAN NOT NULL DEFAULT false,
    "knowledgeMode" TEXT NOT NULL DEFAULT 'strict',
    "fallbackMessage" TEXT,
    "restrictedTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "handoffTriggers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "handoffMessage" TEXT,
    "handoffOnFallback" INTEGER NOT NULL DEFAULT 2,
    "leadCapture" TEXT NOT NULL DEFAULT 'never',
    "leadFields" TEXT[] DEFAULT ARRAY['phone']::TEXT[],
    "qualificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "guidedFlow" JSONB,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "effort" TEXT NOT NULL DEFAULT 'medium',
    "maxTokens" INTEGER NOT NULL DEFAULT 1024,
    "publicKey" TEXT NOT NULL,
    "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "theme" JSONB,
    "activePackId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_agent_knowledge_sources" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT,
    "rowCount" INTEGER,
    "sheetCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "lastSynced" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "contentBytes" INTEGER NOT NULL DEFAULT 0,
    "fileBytes" INTEGER,
    "contentHash" TEXT,
    "embeddedHash" TEXT,
    "embeddedAt" TIMESTAMP(3),
    "mimeType" TEXT,
    "storageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_agent_knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_agent_knowledge_chunks" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "origin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_agent_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_agent_knowledge_packs" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "packHash" TEXT NOT NULL,
    "sourceHashes" JSONB NOT NULL,
    "sourceCount" INTEGER NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "builtByUserId" TEXT,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_agent_knowledge_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_widget_visitors" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "location" TEXT,
    "courseInterest" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "deviceType" TEXT,
    "timezone" TEXT,
    "language" TEXT,
    "pageUrl" TEXT,
    "referrer" TEXT,
    "custom" JSONB,
    "fieldSources" JSONB,
    "handoffAt" TIMESTAMP(3),
    "currentNodeId" TEXT,
    "guidedFlowExitedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "ratingComment" TEXT,
    "ratedAt" TIMESTAMP(3),
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,

    CONSTRAINT "chat_widget_visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_widget_messages" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "latencyMs" INTEGER,
    "packVersion" INTEGER,
    "chipNodeId" TEXT,
    "rating" TEXT,
    "feedbackNote" TEXT,
    "ratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_widget_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_widget_rate_limits" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_widget_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "chat_agents_publicKey_key" ON "chat_agents"("publicKey");

-- CreateIndex
CREATE INDEX "chat_agents_createdByUserId_idx" ON "chat_agents"("createdByUserId");

-- CreateIndex
CREATE INDEX "chat_agents_status_idx" ON "chat_agents"("status");

-- CreateIndex
CREATE INDEX "chat_agent_knowledge_sources_agentId_idx" ON "chat_agent_knowledge_sources"("agentId");

-- CreateIndex
CREATE INDEX "chat_agent_knowledge_sources_agentId_type_idx" ON "chat_agent_knowledge_sources"("agentId", "type");

-- CreateIndex
CREATE INDEX "chat_agent_knowledge_sources_agentId_enabled_idx" ON "chat_agent_knowledge_sources"("agentId", "enabled");

-- CreateIndex
CREATE INDEX "chat_agent_knowledge_chunks_sourceId_idx" ON "chat_agent_knowledge_chunks"("sourceId");

-- CreateIndex
CREATE INDEX "chat_agent_knowledge_packs_agentId_idx" ON "chat_agent_knowledge_packs"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_agent_knowledge_packs_agentId_version_key" ON "chat_agent_knowledge_packs"("agentId", "version");

-- CreateIndex
CREATE INDEX "chat_widget_visitors_agentId_idx" ON "chat_widget_visitors"("agentId");

-- CreateIndex
CREATE INDEX "chat_widget_visitors_agentId_lastSeenAt_idx" ON "chat_widget_visitors"("agentId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "chat_widget_visitors_userId_idx" ON "chat_widget_visitors"("userId");

-- CreateIndex
CREATE INDEX "chat_widget_visitors_reviewStatus_idx" ON "chat_widget_visitors"("reviewStatus");

-- CreateIndex
CREATE INDEX "chat_widget_messages_visitorId_createdAt_idx" ON "chat_widget_messages"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_widget_messages_createdAt_idx" ON "chat_widget_messages"("createdAt");

-- CreateIndex
CREATE INDEX "chat_widget_messages_rating_idx" ON "chat_widget_messages"("rating");

-- CreateIndex
CREATE INDEX "chat_widget_rate_limits_blockedUntil_idx" ON "chat_widget_rate_limits"("blockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "chat_widget_rate_limits_scope_key_key" ON "chat_widget_rate_limits"("scope", "key");

-- AddForeignKey
ALTER TABLE "chat_agents" ADD CONSTRAINT "chat_agents_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_agent_knowledge_sources" ADD CONSTRAINT "chat_agent_knowledge_sources_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "chat_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_agent_knowledge_chunks" ADD CONSTRAINT "chat_agent_knowledge_chunks_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "chat_agent_knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_agent_knowledge_packs" ADD CONSTRAINT "chat_agent_knowledge_packs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "chat_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_widget_visitors" ADD CONSTRAINT "chat_widget_visitors_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "chat_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_widget_visitors" ADD CONSTRAINT "chat_widget_visitors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_widget_visitors" ADD CONSTRAINT "chat_widget_visitors_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_widget_messages" ADD CONSTRAINT "chat_widget_messages_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "chat_widget_visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

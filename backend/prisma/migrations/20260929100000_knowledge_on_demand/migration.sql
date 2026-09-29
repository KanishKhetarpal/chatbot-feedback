-- Knowledge a bot reads only when a turn needs it. `on_demand` sources stay out
-- of the compiled pack and are attached to a turn whose recent words match one
-- of `triggers`. Every existing source keeps today's behaviour.
ALTER TABLE "chat_agent_knowledge_sources" ADD COLUMN "loadMode" TEXT NOT NULL DEFAULT 'always';
ALTER TABLE "chat_agent_knowledge_sources" ADD COLUMN "triggers" TEXT[] DEFAULT ARRAY[]::TEXT[];

import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ChatAgentsController } from './chat-agents.controller';
import { ChatAgentsService } from './chat-agents.service';
import { GuidedFlowRuntimeService } from './guided-flow-runtime.service';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeFileStorageService } from './knowledge-file-storage.service';
import { KnowledgeService } from './knowledge.service';
import { TrainingService } from './training.service';
import { WidgetController } from './widget.controller';
import { WidgetRateLimitService } from './widget-rate-limit.service';
import { WidgetService } from './widget.service';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    // The public chat routes are unauthenticated and every AI turn costs money,
    // so they get a per-IP ceiling that does not depend on a login.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
  ],
  controllers: [ChatAgentsController, KnowledgeController, WidgetController, InboxController],
  providers: [
    ChatAgentsService,
    KnowledgeService,
    KnowledgeFileStorageService,
    InboxService,
    GuidedFlowRuntimeService,
    TrainingService,
    WidgetService,
    WidgetRateLimitService,
  ],
  exports: [ChatAgentsService, KnowledgeService, TrainingService],
})
export class ChatAgentsModule {}

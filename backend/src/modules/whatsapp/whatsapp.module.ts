import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { McubeClient } from './mcube.client';
import { McubeInboxPoller } from './mcube-inbox.poller';
import { CrmLeadLookupService } from './crm-lead-lookup.service';
import { WhatsappFollowupService } from './whatsapp-followup.service';
import { WhatsappAnalyticsService } from './whatsapp-analytics.service';
import { WhatsappBotService } from './whatsapp-bot.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappSenderService } from './whatsapp-sender.service';
import { WhatsappScoreService } from './whatsapp-score.service';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [WhatsappController],
  providers: [
    McubeClient,
    WhatsappSenderService,
    WhatsappBotService,
    WhatsappAnalyticsService,
    McubeInboxPoller,
    CrmLeadLookupService,
    WhatsappFollowupService,
    WhatsappScoreService,
  ],
})
export class WhatsappModule {}

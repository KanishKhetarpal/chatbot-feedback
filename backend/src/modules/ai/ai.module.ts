import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiUsageRecorder } from './ai-usage.recorder';
import { AnthropicService } from './anthropic.service';

@Module({
  imports: [PrismaModule],
  providers: [AnthropicService, AiUsageRecorder],
  exports: [AnthropicService, AiUsageRecorder],
})
export class AiModule {}

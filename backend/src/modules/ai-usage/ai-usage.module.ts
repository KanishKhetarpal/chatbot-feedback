import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiUsageController } from './ai-usage.controller';
import { AiUsageService } from './ai-usage.service';

/**
 * Read side of the token ledger. Deliberately does NOT import AiModule — the
 * recorder lives there and AnthropicService depends on it, so the reverse edge
 * would be circular.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AiUsageController],
  providers: [AiUsageService],
})
export class AiUsageModule {}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AiAttribution, AiTokenUsage } from './ai-usage.types';

/**
 * Writes one `ai_usage_logs` row per Claude call.
 *
 * Sits behind `AnthropicService` — the only place a client is constructed — so
 * no caller can spend tokens without a row. It is handed the numbers AFTER the
 * response and is never awaited: a ledger must not add latency to a live chat
 * turn, and it must never throw into the call it is measuring.
 */
@Injectable()
export class AiUsageRecorder {
  private readonly logger = new Logger(AiUsageRecorder.name);

  constructor(private readonly prisma: PrismaService) {}

  record(input: {
    attribution: AiAttribution & { endpoint: string };
    model: string;
    usage: AiTokenUsage;
    latencyMs?: number | null;
    /** false for `countTokens`, which Anthropic does not bill. */
    billable?: boolean;
  }): void {
    const { attribution, model, usage } = input;
    void this.prisma.aiUsageLog
      .create({
        data: {
          feature: attribution.feature,
          operation: attribution.endpoint,
          model,
          agentId: attribution.entityType === 'chat_agent' ? (attribution.entityId ?? null) : null,
          visitorId: attribution.visitorId ?? null,
          userId: attribution.userId ?? null,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
          latencyMs: input.latencyMs ?? null,
          billable: input.billable ?? true,
        },
        select: { id: true },
      })
      .catch((error) => {
        this.logger.warn(`Usage row not written [${attribution.endpoint}]: ${(error as Error)?.message ?? error}`);
      });
  }
}

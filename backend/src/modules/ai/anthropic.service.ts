import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AiUsageRecorder } from './ai-usage.recorder';
import type { AiAttribution, AiTokenUsage } from './ai-usage.types';

/**
 * The one place an Anthropic client is constructed.
 *
 * A trimmed copy of the CRM's service: the same three calls the chat agent
 * needs (`chat`, `countTokens`, `warmCache`) with the same signatures, minus the
 * CRM's token ledger — usage is returned to the caller and stored on the
 * message row, which is where a reviewer reads it from anyway.
 */

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ChatUsage = AiTokenUsage;

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);
const REQUEST_TIMEOUT_MS = 60_000;

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);
  private readonly client: Anthropic;

  constructor(private readonly usage: AiUsageRecorder) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  /** Exact token count for a system block, against the model that will read it. */
  async countTokens(
    model: string,
    text: string,
    attribution: AiAttribution & { endpoint: string },
  ): Promise<number> {
    const result = await this.withRetry(() =>
      this.client.messages.countTokens({
        model,
        system: [{ type: 'text', text }],
        messages: [{ role: 'user', content: '.' }],
      }),
    );
    this.logger.debug(`countTokens [${attribution.endpoint}] model=${model} → ${result.input_tokens}`);
    this.usage.record({
      attribution,
      model,
      usage: { inputTokens: result.input_tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      billable: false,
    });
    return result.input_tokens;
  }

  /**
   * One chat turn. `system` is pre-built blocks so the caller controls where the
   * prompt-cache breakpoint sits; `temperature` is never sent (Sonnet 5 / Opus 5
   * reject it) — tone is steered through the prompt.
   */
  async chat(
    params: {
      model: string;
      system: Anthropic.TextBlockParam[];
      messages: Anthropic.MessageParam[];
      maxTokens: number;
      effort?: EffortLevel;
    },
    attribution: AiAttribution & { endpoint: string },
  ): Promise<{ text: string; usage: ChatUsage }> {
    const start = Date.now();
    try {
      const message = await this.withRetry(() =>
        this.client.messages.create({
          model: params.model,
          max_tokens: params.maxTokens,
          system: params.system,
          messages: params.messages,
          ...(params.effort ? { output_config: { effort: params.effort } } : {}),
        }),
      );
      const usage = this.usageOf(message);
      this.usage.record({ attribution, model: params.model, usage, latencyMs: Date.now() - start });
      this.logger.debug(
        `chat [${attribution.endpoint}] model=${params.model} ${Date.now() - start}ms in=${usage.inputTokens} out=${usage.outputTokens} cacheRead=${usage.cacheReadTokens}`,
      );
      const textBlock = message.content.find((block) => block.type === 'text');
      return {
        text: textBlock && textBlock.type === 'text' ? textBlock.text.trim() : '',
        usage,
      };
    } catch (error) {
      this.logger.warn(`chat failed [${attribution.endpoint}]: ${(error as Error)?.message ?? error}`);
      throw error;
    }
  }

  /**
   * Write the system prefix into the prompt cache without generating a reply.
   * `effort` must match what the real calls send — it is part of the cache key.
   */
  async warmCache(
    model: string,
    system: Anthropic.TextBlockParam[],
    attribution: AiAttribution & { endpoint: string },
    effort?: EffortLevel,
  ): Promise<void> {
    const started = Date.now();
    const message = await this.client.messages.create({
      model,
      max_tokens: 0,
      system,
      ...(effort ? { output_config: { effort } } : {}),
      messages: [{ role: 'user', content: 'warmup' }],
    });
    const usage = this.usageOf(message);
    this.usage.record({ attribution, model, usage, latencyMs: Date.now() - started });
    this.logger.log(
      `warmCache [${attribution.endpoint}] model=${model} cacheWrite=${usage.cacheWriteTokens} cacheRead=${usage.cacheReadTokens}`,
    );
  }

  private usageOf(message: { usage?: Anthropic.Usage | null }): ChatUsage {
    return {
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
      cacheWriteTokens: message.usage?.cache_creation_input_tokens ?? 0,
      cacheReadTokens: message.usage?.cache_read_input_tokens ?? 0,
    };
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const isConnectionError = error instanceof Anthropic.APIConnectionError;
      if (isConnectionError || (status && RETRYABLE_STATUS.has(status))) {
        await new Promise((r) => setTimeout(r, 500));
        return fn();
      }
      throw error;
    }
  }
}

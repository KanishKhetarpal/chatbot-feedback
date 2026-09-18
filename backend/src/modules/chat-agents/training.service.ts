import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AnthropicService } from '../ai/anthropic.service';
import type { AiAttribution } from '../ai/ai-usage.types';
import { resolveEffort } from './chat-agent-models';
import {
  KNOWLEDGE_CONTEXT_TOKEN_LIMIT,
  KNOWLEDGE_PACK_RETENTION,
} from './knowledge.constants';
import { sha256 } from './knowledge.util';
import { buildSystemBlocks, type PromptAgent } from './prompt.util';
import { apportionTokens, renderPack } from './training.util';

/**
 * What changed since the agent was last trained.
 *
 * Reported as three counts rather than one total because "12 added, 1 removed"
 * tells an author what happened and "13 changes" does not.
 */
export interface TrainingState {
  hasPack: boolean;
  needed: boolean;
  added: number;
  removed: number;
  changed: number;
  /** Sum of the three — what the existing summary panel calls staleCount. */
  staleCount: number;
  lastTrainedAt: Date | null;
  pack: {
    version: number;
    tokenCount: number;
    sourceCount: number;
    model: string;
    builtAt: Date;
  } | null;
}

/** Enabled and ingested — the sources a build is allowed to compile. */
const TRAINABLE = { enabled: true, status: 'ready' } as const;

/**
 * Compiles an agent's knowledge into the artefact the answer path reads.
 *
 * "Training" here changes no model weights. It gathers every enabled, ready
 * source, renders them into one deterministic document, checks that document
 * fits the per-turn token budget, and stores it as a versioned pack. Nothing in
 * this service knows or cares where a source's text came from — that is the
 * whole point, and it is why website and file ingestion can be added later
 * without touching this file.
 */
@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
  ) {}

  // ── Staleness ──────────────────────────────────────────────────────────────

  /**
   * Compare what the agent knows against what its author has written.
   *
   * Compares *sets*, not rows. A per-row `contentHash !== embeddedHash` check
   * catches an edited source but is blind to a trained source being deleted or
   * disabled — in both cases the row is gone from the query, so nothing looks
   * stale while the live pack still teaches the removed material. Comparing the
   * pack's recorded source set against the current one catches all five cases
   * (add, edit, delete, disable, re-enable) with one rule.
   */
  async getTrainingState(agentId: string): Promise<TrainingState> {
    const [agent, current] = await Promise.all([
      this.prisma.chatAgent.findUnique({
        where: { id: agentId },
        select: { id: true, activePackId: true },
      }),
      this.prisma.chatAgentKnowledgeSource.findMany({
        where: { agentId, ...TRAINABLE },
        select: { id: true, contentHash: true },
      }),
    ]);
    if (!agent) throw new NotFoundException('Agent not found');

    const pack = agent.activePackId
      ? await this.prisma.chatAgentKnowledgePack.findUnique({
          where: { id: agent.activePackId },
        })
      : null;

    const live = new Map(current.map((s) => [s.id, s.contentHash ?? '']));
    const packed = new Map(Object.entries(this.readSourceHashes(pack?.sourceHashes)));

    const added = [...live.keys()].filter((id) => !packed.has(id)).length;
    const removed = [...packed.keys()].filter((id) => !live.has(id)).length;
    const changed = [...live].filter(
      ([id, hash]) => packed.has(id) && packed.get(id) !== hash,
    ).length;

    return {
      hasPack: pack !== null,
      needed: added + removed + changed > 0,
      added,
      removed,
      changed,
      staleCount: added + removed + changed,
      lastTrainedAt: pack?.builtAt ?? null,
      pack: pack
        ? {
            version: pack.version,
            tokenCount: pack.tokenCount,
            sourceCount: pack.sourceCount,
            model: pack.model,
            builtAt: pack.builtAt,
          }
        : null,
    };
  }

  /**
   * What the pack *would* weigh, with an extra source added.
   *
   * Exists so an upload can be refused at the door instead of at train time. The
   * alternative — accept the file, store it, and let the author discover at train
   * that it can never be used — is the worse failure by a distance: it is minutes
   * later, it names the wrong culprit (training, not the upload), and it leaves a
   * dead source behind that has already eaten the storage quota.
   *
   * Counts the whole projected pack rather than the candidate alone, because the
   * limit is on the pack. "This file is 18k tokens" is not actionable; "this would
   * take you to 71,000 of 60,000" is.
   */
  async previewPackTokens(
    agentId: string,
    candidate?: { name: string; description: string | null; text: string },
  ): Promise<{ tokenCount: number; limit: number; fits: boolean; currentTokens: number }> {
    const agent = await this.prisma.chatAgent.findUnique({
      where: { id: agentId },
      select: { id: true, model: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const sources = await this.prisma.chatAgentKnowledgeSource.findMany({
      where: { agentId, ...TRAINABLE },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { name: true, description: true, location: true },
    });

    const existing = sources.map((s) => ({
      name: s.name,
      description: s.description,
      text: s.location,
    }));

    const currentTokens = existing.length
      ? await this.countTokens(agent.model, renderPack(existing), agentId)
      : 0;

    if (!candidate) {
      return {
        tokenCount: currentTokens,
        currentTokens,
        limit: KNOWLEDGE_CONTEXT_TOKEN_LIMIT,
        fits: currentTokens <= KNOWLEDGE_CONTEXT_TOKEN_LIMIT,
      };
    }

    const tokenCount = await this.countTokens(
      agent.model,
      renderPack([...existing, candidate]),
      agentId,
    );
    return {
      tokenCount,
      currentTokens,
      limit: KNOWLEDGE_CONTEXT_TOKEN_LIMIT,
      fits: tokenCount <= KNOWLEDGE_CONTEXT_TOKEN_LIMIT,
    };
  }

  // ── Training ───────────────────────────────────────────────────────────────

  async train(agentId: string, userId?: string) {
    const agent = await this.prisma.chatAgent.findUnique({
      where: { id: agentId },
      // Persona fields come along so the finished build can be warmed into the
      // prompt cache using the exact prefix the answer path will send.
      select: {
        id: true,
        model: true,
        effort: true,
        name: true,
        instructions: true,
        tone: true,
        responseLength: true,
        language: true,
        useEmoji: true,
        knowledgeMode: true,
        restrictedTopics: true,
        fallbackMessage: true,
        handoffTriggers: true,
        handoffMessage: true,
        qualificationEnabled: true,
      },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const sources = await this.prisma.chatAgentKnowledgeSource.findMany({
      where: { agentId, ...TRAINABLE },
      // Deterministic order: the pack is a prompt-cache key, and re-ordering the
      // same content would look like new content and force a cache rewrite.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        contentHash: true,
        contentBytes: true,
      },
    });

    if (sources.length === 0) {
      throw new BadRequestException({
        message:
          'This agent has no knowledge to train on. Add a source, or enable one you have switched off.',
        error: 'no_knowledge',
      });
    }

    const content = renderPack(
      sources.map((s) => ({ name: s.name, description: s.description, text: s.location })),
    );
    const tokenCount = await this.countTokens(agent.model, content, agentId, userId);

    if (tokenCount > KNOWLEDGE_CONTEXT_TOKEN_LIMIT) {
      throw new BadRequestException({
        message:
          `This agent's knowledge is ${tokenCount.toLocaleString()} tokens, over the ` +
          `${KNOWLEDGE_CONTEXT_TOKEN_LIMIT.toLocaleString()} limit. Disable or trim a source and train again.`,
        error: 'knowledge_too_large',
        tokenCount,
        limit: KNOWLEDGE_CONTEXT_TOKEN_LIMIT,
        // Which source to blame. Proportional to size, not individually counted:
        // exact figures would cost one API call per source, on the path where
        // there are already too many of them.
        approximate: true,
        sources: apportionTokens(
          sources.map((s) => ({ id: s.id, name: s.name, bytes: s.contentBytes })),
          tokenCount,
        ),
      });
    }

    const sourceHashes = Object.fromEntries(
      sources.map((s) => [s.id, s.contentHash ?? '']),
    );

    const pack = await this.commit({
      agentId,
      userId,
      model: agent.model,
      content,
      tokenCount,
      sourceIds: sources.map((s) => s.id),
      sourceHashes,
    });

    this.logger.log(
      `Trained agent ${agentId}: v${pack.version}, ${sources.length} sources, ${tokenCount} tokens`,
    );

    await this.warmCache(agent, content, agentId, userId);

    return {
      pack: {
        version: pack.version,
        tokenCount: pack.tokenCount,
        sourceCount: pack.sourceCount,
        model: pack.model,
        builtAt: pack.builtAt,
      },
      training: await this.getTrainingState(agentId),
    };
  }

  /** The compiled document itself — "show me exactly what this agent knows". */
  async getPack(agentId: string) {
    const agent = await this.prisma.chatAgent.findUnique({
      where: { id: agentId },
      select: { id: true, activePackId: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const pack = agent.activePackId
      ? await this.prisma.chatAgentKnowledgePack.findUnique({
          where: { id: agent.activePackId },
        })
      : null;
    if (!pack) {
      throw new NotFoundException({
        message: 'This agent has not been trained yet.',
        error: 'not_trained',
      });
    }

    return {
      version: pack.version,
      tokenCount: pack.tokenCount,
      sourceCount: pack.sourceCount,
      model: pack.model,
      packHash: pack.packHash,
      builtAt: pack.builtAt,
      content: pack.content,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * Insert the pack, point the agent at it, and stamp its sources as trained —
   * atomically, so a failure can never leave `activePackId` pointing at a build
   * whose sources were not marked, or vice versa.
   */
  private async commit(input: {
    agentId: string;
    userId?: string;
    model: string;
    content: string;
    tokenCount: number;
    sourceIds: string[];
    sourceHashes: Record<string, string>;
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const latest = await tx.chatAgentKnowledgePack.aggregate({
          where: { agentId: input.agentId },
          _max: { version: true },
        });
        const version = (latest._max.version ?? 0) + 1;

        const pack = await tx.chatAgentKnowledgePack.create({
          data: {
            agentId: input.agentId,
            version,
            content: input.content,
            packHash: sha256(input.content),
            sourceHashes: input.sourceHashes as Prisma.InputJsonValue,
            sourceCount: input.sourceIds.length,
            tokenCount: input.tokenCount,
            model: input.model,
            builtByUserId: input.userId ?? null,
          },
        });

        await tx.chatAgent.update({
          where: { id: input.agentId },
          data: { activePackId: pack.id },
        });

        const now = new Date();
        await tx.chatAgentKnowledgeSource.updateMany({
          where: { id: { in: input.sourceIds } },
          data: { embeddedAt: now },
        });
        // embeddedHash differs per row, so it cannot ride the updateMany above.
        await Promise.all(
          input.sourceIds.map((id) =>
            tx.chatAgentKnowledgeSource.update({
              where: { id },
              data: { embeddedHash: input.sourceHashes[id] || null },
            }),
          ),
        );

        // Packs are large text blobs; keep a few builds for rollback and audit,
        // not every build ever made.
        await tx.chatAgentKnowledgePack.deleteMany({
          where: {
            agentId: input.agentId,
            version: { lte: version - KNOWLEDGE_PACK_RETENTION },
          },
        });

        return pack;
      });
    } catch (error) {
      // @@unique([agentId, version]) — two trains raced for the same version.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'Another training run for this agent is already in progress. Try again.',
          error: 'training_in_progress',
        });
      }
      throw error;
    }
  }

  /**
   * Write the new build into the prompt cache before anyone asks a question.
   *
   * Training is exactly the "moment before traffic" a warm-up is for: the prefix
   * just changed, so the cache entry for it does not exist, and without this the
   * first visitor after every train pays the cold write in latency.
   *
   * Must reproduce the answer path's request exactly — same system blocks *and*
   * the same `effort`, which participates in the cache key even though the
   * prefix bytes are unchanged. `resolveEffort` is shared with WidgetService so
   * the two cannot drift apart; when they did, the warm wrote its own entry and
   * every first visitor still paid the cold write.
   *
   * Best-effort: a cold cache is slower, not broken, so a failure here must
   * never fail a train that already committed.
   */
  /**
   * Training spend belongs to the person who pressed Train and to the agent they trained.
   * There is no lead: an agent's knowledge serves every visitor, so charging it to one is
   * meaningless. The dashboard reports it as overhead.
   */
  private attributionFor(agentId: string, userId?: string): AiAttribution {
    return {
      feature: 'chat_agent_training',
      actorType: userId ? 'user' : 'system',
      trigger: 'manual',
      userId: userId ?? null,
      entityType: 'chat_agent',
      entityId: agentId,
    };
  }

  private async warmCache(
    agent: PromptAgent & { model: string; effort: string },
    packContent: string,
    agentId: string,
    userId?: string,
  ): Promise<void> {
    try {
      await this.anthropic.warmCache(
        agent.model,
        buildSystemBlocks(agent, packContent),
        { ...this.attributionFor(agentId, userId), endpoint: 'agent.warm-cache' },
        resolveEffort(agent.model, agent.effort),
      );
    } catch (error) {
      this.logger.warn(`Cache warm failed (harmless): ${(error as Error)?.message}`);
    }
  }

  /**
   * Token count, or a clear refusal.
   *
   * No estimate fallback on purpose. This number gates a budget that costs money
   * on every message, and characters ÷ 4 is wrong by enough to wave through a
   * pack that shouldn't have shipped.
   */
  private async countTokens(
    model: string,
    content: string,
    agentId: string,
    userId?: string,
  ): Promise<number> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException({
        message:
          'Training needs ANTHROPIC_API_KEY to measure the knowledge size. Set it and try again.',
        error: 'ai_not_configured',
      });
    }
    return this.anthropic.countTokens(model, content, {
      ...this.attributionFor(agentId, userId),
      endpoint: 'agent.count-tokens',
    });
  }

  /** `sourceHashes` is Json on the way out — narrow it before comparing. */
  private readSourceHashes(value: Prisma.JsonValue | undefined): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).map(([id, hash]) => [id, typeof hash === 'string' ? hash : '']),
    );
  }
}

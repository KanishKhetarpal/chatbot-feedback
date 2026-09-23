import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { previewText } from './ui-block.util';
import { isAllowedModel } from './chat-agent-models';
import { ChatAgentValidationError, emptyToNull, normalizeOrigins } from './chat-agent.util';
import { CreateChatAgentDto } from './dto/create-chat-agent.dto';
import { UpdateChatAgentDto } from './dto/update-chat-agent.dto';
import { UpdateGuidedFlowDto } from './dto/update-guided-flow.dto';
import { validateGuidedFlow } from './guided-flow.validator';
import { GuidedFlowSchema, type GuidedFlow } from './schemas/guided-flow.schema';
import { KnowledgeFileStorageService } from './knowledge-file-storage.service';
import { WidgetThemeDto } from './dto/widget-theme.dto';
import { TrainingService } from './training.service';
import { compactTheme, resolveTheme } from './widget-theme';

const KNOWLEDGE_LIST_SELECT = {
  id: true,
  name: true,
  type: true,
  status: true,
  enabled: true,
  chunkCount: true,
  lastSynced: true,
} as const;

type ChatAgentWithKnowledge = Prisma.ChatAgentGetPayload<{
  include: { knowledgeSources: { select: typeof KNOWLEDGE_LIST_SELECT } };
}>;

function validationFailed(issues: { path: string; message: string }[]) {
  return new BadRequestException({
    message: 'Request validation failed',
    error: 'validation_failed',
    details: issues.map((issue) => issue.message),
    issues,
  });
}

@Injectable()
export class ChatAgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly training: TrainingService,
    private readonly storage: KnowledgeFileStorageService,
  ) {}

  async list() {
    const rows = await this.prisma.chatAgent.findMany({
      orderBy: { createdAt: 'desc' },
      include: { knowledgeSources: { select: KNOWLEDGE_LIST_SELECT, orderBy: { createdAt: 'desc' } } },
    });
    return rows.map((row) => this.toApi(row));
  }

  /**
   * Active chatbots, presentation fields only — the gallery a tester sees.
   * With a `userId`, each one also carries that account's own thread on it
   * (`myThread`), which is what the chat list draws its preview line from.
   */
  async listAvailable(userId?: string) {
    const rows = await this.prisma.chatAgent.findMany({
      where: { status: 'active' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        heading: true,
        subheading: true,
        greeting: true,
        avatarUrl: true,
        publicKey: true,
        theme: true,
        model: true,
        updatedAt: true,
        _count: { select: { visitors: true } },
      },
    });
    const mine =
      userId && rows.length
        ? await this.prisma.chatWidgetVisitor.findMany({
            where: { userId, agentId: { in: rows.map((r) => r.id) } },
            orderBy: { lastSeenAt: 'desc' },
            select: {
              id: true,
              agentId: true,
              lastSeenAt: true,
              messageCount: true,
              rating: true,
              messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { role: true, content: true, createdAt: true } },
            },
          })
        : [];
    // Newest thread per chatbot wins - an account may hold one per browser.
    const threadByAgent = new Map<string, (typeof mine)[number]>();
    for (const v of mine) if (!threadByAgent.has(v.agentId)) threadByAgent.set(v.agentId, v);

    return rows.map(({ _count, theme, ...row }) => {
      const t = threadByAgent.get(row.id);
      const last = t?.messages[0];
      return {
        ...row,
        theme: resolveTheme(theme),
        conversationCount: _count.visitors,
        myThread: t
          ? {
              visitorId: t.id,
              lastSeenAt: t.lastSeenAt,
              messageCount: t.messageCount,
              rating: t.rating,
              lastMessage: last
                ? { role: last.role as 'user' | 'assistant', preview: previewText(last.content, 140), at: last.createdAt }
                : null,
            }
          : null,
      };
    });
  }

  async getOne(id: string) {
    const row = await this.prisma.chatAgent.findUnique({
      where: { id },
      include: { knowledgeSources: { select: KNOWLEDGE_LIST_SELECT, orderBy: { createdAt: 'desc' } } },
    });
    if (!row) throw new NotFoundException('Agent not found');
    return this.toApi(row);
  }

  async create(dto: CreateChatAgentDto, userId: string) {
    const fields = this.fieldsFromDto(dto);
    const row = await this.prisma.chatAgent.create({
      data: {
        name: dto.name.trim(),
        publicKey: `pk_${randomBytes(12).toString('hex')}`,
        createdByUserId: userId,
        ...fields,
        theme: this.themeForWrite(dto.theme, null),
      },
      include: { knowledgeSources: { select: KNOWLEDGE_LIST_SELECT } },
    });
    return this.toApi(row);
  }

  async update(id: string, dto: UpdateChatAgentDto) {
    const existing = await this.prisma.chatAgent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Agent not found');

    if (dto.status === 'active' && existing.status !== 'active') {
      await this.assertTrainedForPublish(id);
    }

    const fields = this.fieldsFromDto(dto);
    const row = await this.prisma.chatAgent.update({
      where: { id },
      data: {
        ...fields,
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        theme: this.themeForWrite(dto.theme, existing.theme),
      },
      include: { knowledgeSources: { select: KNOWLEDGE_LIST_SELECT, orderBy: { createdAt: 'desc' } } },
    });
    return this.toApi(row);
  }

  /**
   * Delete an agent and everything that only existed because of it.
   *
   * The knowledge base goes with it — sources, their chunks, every compiled pack,
   * and the uploaded files behind any `file` source. So do the widget
   * conversations: visitors, their messages, and the rate-limit counters keyed on
   * them. Nothing here is recoverable, which is why an `active` agent is refused
   * rather than quietly taken off a customer's website mid-visit.
   *
   * Most of the cascade is the database's — `onDelete: Cascade` on every child of
   * `chat_agents`. Two things it cannot reach are handled here: files on disk
   * (outside Postgres) and `chat_widget_rate_limits`, which is keyed by an opaque
   * (scope, key) pair with no foreign key to follow.
   */
  async remove(id: string) {
    const agent = await this.prisma.chatAgent.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        knowledgeSources: { select: { id: true, storageKey: true } },
        _count: { select: { packs: true, visitors: true } },
      },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    if (agent.status === 'active') {
      throw new ConflictException({
        message:
          'This agent is live on a website. Pause it first, then delete — so the widget stops serving before its knowledge disappears.',
        error: 'agent_active',
      });
    }

    // Read before the cascade removes them: the rate-limit rows are keyed by
    // visitor id with no foreign key, so after the delete there is nothing left
    // to find them by.
    const visitorIds = (
      await this.prisma.chatWidgetVisitor.findMany({ where: { agentId: id }, select: { id: true } })
    ).map((v) => v.id);

    const [messages, chunks] = await Promise.all([
      this.prisma.chatWidgetMessage.count({ where: { visitor: { agentId: id } } }),
      this.prisma.chatAgentKnowledgeChunk.count({ where: { source: { agentId: id } } }),
    ]);

    // Row first, files second — the same order as deleting a single knowledge
    // source. A deleted row with an orphaned file is untidy; a deleted file with
    // a surviving row is a source that renders as broken.
    await this.prisma.chatAgent.delete({ where: { id } });

    await Promise.all(
      agent.knowledgeSources.map((source) => this.storage.discard(source.storageKey)),
    );

    // Best-effort, and after the fact on purpose: a stranded counter costs a row
    // and expires on its own, whereas failing here would report a delete that
    // already happened as an error.
    await this.prisma.chatWidgetRateLimit
      .deleteMany({
        where: {
          OR: [
            { scope: 'agent', key: id },
            ...(visitorIds.length ? [{ scope: 'visitor', key: { in: visitorIds } }] : []),
          ],
        },
      })
      .catch(() => undefined);

    return {
      id: agent.id,
      name: agent.name,
      deleted: {
        knowledgeSources: agent.knowledgeSources.length,
        knowledgeChunks: chunks,
        knowledgePacks: agent._count.packs,
        visitors: agent._count.visitors,
        messages,
      },
    };
  }

  /**
   * Save the admin-authored guided chip flow tree for an agent.
   *
   * Two-tier validation on purpose. Zod (`GuidedFlowSchema.safeParse`) catches
   * shape drift — missing fields, wrong types, over-length strings. The
   * semantic validator (`validateGuidedFlow`) catches everything zod cannot
   * express: cycles beyond depth, orphan nodes, `next[]` entries pointing at
   * nothing, reserved ids used as regular nodes. Both fire before any write,
   * so a save either lands the whole tree cleanly or returns the FULL list of
   * problems for the accordion editor to render inline (no partial save, ever).
   *
   * `null` clears the flow — the widget then falls back to today's preset-chip
   * behaviour, which is a supported off-state, not a bug.
   */
  async updateGuidedFlow(agentId: string, flow: UpdateGuidedFlowDto | null) {
    const agent = await this.prisma.chatAgent.findUnique({ where: { id: agentId }, select: { id: true } });
    if (!agent) throw new NotFoundException('Agent not found');

    if (flow === null) {
      await this.prisma.chatAgent.update({
        where: { id: agentId },
        data: { guidedFlow: Prisma.DbNull },
      });
      return { agentId, guidedFlow: null, cleared: true };
    }

    const parsed = GuidedFlowSchema.safeParse(flow);
    if (!parsed.success) {
      throw validationFailed(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.') || 'guidedFlow',
          message: `${issue.path.join('.') || 'guidedFlow'}: ${issue.message}`,
        })),
      );
    }

    const issues = validateGuidedFlow(parsed.data);
    if (issues.length > 0) {
      throw new BadRequestException({
        message: 'Guided flow validation failed',
        error: 'guided_flow_invalid',
        details: issues.map((issue) => issue.message),
        issues,
      });
    }

    const stored: GuidedFlow = parsed.data;
    await this.prisma.chatAgent.update({
      where: { id: agentId },
      data: { guidedFlow: stored as unknown as Prisma.InputJsonValue },
    });
    return { agentId, guidedFlow: stored, cleared: false };
  }

  /**
   * An agent may not go live knowing nothing, and may not stay live on knowledge
   * its author has since rewritten. This is the rule that makes training more
   * than a green checkmark.
   *
   * Only guards the transition *into* `active`. An already-live agent that goes
   * stale keeps serving its last good pack — going stale must never take a
   * working widget offline; it only blocks a new activation.
   */
  private async assertTrainedForPublish(agentId: string) {
    const state = await this.training.getTrainingState(agentId);
    if (state.hasPack && !state.needed) return;

    throw new ConflictException({
      message: state.hasPack
        ? 'This agent’s knowledge has changed since it was last trained. Train it before going live.'
        : 'Train this agent before going live — it has no knowledge to answer from yet.',
      error: 'training_required',
      training: state,
    });
  }

  private fieldsFromDto(dto: CreateChatAgentDto | UpdateChatAgentDto) {
    if (dto.model !== undefined && !isAllowedModel(dto.model)) {
      throw validationFailed([{ path: 'model', message: 'Model is not on the allowlist' }]);
    }

    let allowedOrigins: string[] | undefined;
    if (dto.allowedOrigins !== undefined) {
      try {
        allowedOrigins = normalizeOrigins(dto.allowedOrigins);
      } catch (err) {
        if (err instanceof ChatAgentValidationError) throw validationFailed(err.issues);
        throw err;
      }
    }

    return {
      description: emptyToNull(dto.description),
      instructions: emptyToNull(dto.instructions),
      avatarUrl: emptyToNull(dto.avatarUrl),
      heading: emptyToNull(dto.heading),
      subheading: emptyToNull(dto.subheading),
      greeting: emptyToNull(dto.greeting),
      messagePresets: dto.messagePresets,
      inputPlaceholder: emptyToNull(dto.inputPlaceholder),
      tone: dto.tone,
      responseLength: dto.responseLength,
      language: dto.language,
      useEmoji: dto.useEmoji,
      knowledgeMode: dto.knowledgeMode,
      fallbackMessage: emptyToNull(dto.fallbackMessage),
      restrictedTopics: dto.restrictedTopics,
      handoffTriggers: dto.handoffTriggers,
      handoffMessage: emptyToNull(dto.handoffMessage),
      handoffOnFallback: dto.handoffOnFallback,
      leadCapture: dto.leadCapture,
      leadFields: dto.leadFields,
      leadSoftAfter: dto.leadSoftAfter,
      leadGateAfter: dto.leadGateAfter,
      qualificationEnabled: dto.qualificationEnabled,
      model: dto.model,
      effort: dto.effort,
      maxTokens: dto.maxTokens,
      allowedOrigins,
    };
  }

  /**
   * Merge a theme edit over what is stored, then keep only the overrides.
   *
   * Merged rather than replaced so the editor can send one changed colour
   * without having to resend the whole object — a replace would silently drop
   * every other override the author had set. Compacted on the way in so unset
   * values keep tracking the product defaults instead of freezing today's
   * palette into the row. `null` clears everything.
   */
  private themeForWrite(
    incoming: WidgetThemeDto | null | undefined,
    existing: Prisma.JsonValue | null,
  ): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
    if (incoming === undefined) return undefined;
    if (incoming === null) return Prisma.DbNull;

    const merged = resolveTheme({
      ...(existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}),
      ...incoming,
    });
    return compactTheme(merged) as Prisma.InputJsonValue;
  }

  private toApi(row: ChatAgentWithKnowledge) {
    const { createdByUserId: _createdBy, knowledgeSources, ...agent } = row;
    return {
      ...agent,
      // Always a complete theme, never the sparse row. Consumers should not have
      // to know which fields were overridden or reimplement the defaults.
      theme: resolveTheme(agent.theme),
      knowledgeSources: knowledgeSources.map((source) => ({
        id: source.id,
        name: source.name,
        type: source.type,
        status: source.status,
        lastSynced: source.lastSynced,
        chunks: source.chunkCount,
      })),
    };
  }
}

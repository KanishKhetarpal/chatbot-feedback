import type Anthropic from '@anthropic-ai/sdk';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AnthropicService, type ChatUsage } from '../ai/anthropic.service';
import type { AiAttribution } from '../ai/ai-usage.types';
import { isFrontendOrigin } from '../../common/origins';
import { resolveEffort } from './chat-agent-models';
import { buildPersona, buildSystemBlocks, ENGINE_PREAMBLE } from './prompt.util';
import { TrainingService } from './training.service';
import { DEFAULT_LIMIT_MESSAGE } from './widget-limits.constants';
import { resolveTheme } from './widget-theme';
import { buildVisitorContext } from './visitor-context.util';
import { GuidedFlowRuntimeService } from './guided-flow-runtime.service';
import { formatKnownFacts, type VisitorFacts } from './qualifier.util';
import { WidgetRateLimitService } from './widget-rate-limit.service';
import { InvalidVisitorTokenError, issueVisitorToken, readVisitorToken } from './widget-token.util';
import type { TestChatAgentDto } from './dto/test-chat-agent.dto';
import type {
  WidgetChatDto,
  WidgetChatMessageDto,
  WidgetLeadDto,
  WidgetSessionDto,
  WidgetStepDto,
} from './dto/widget-chat.dto';
import type { WidgetConversationFeedbackDto, WidgetMessageFeedbackDto } from './dto/widget-feedback.dto';

/** The parts of the HTTP request a visitor's profile is read from. */
export interface RequestContext {
  ip?: string;
  forwardedFor?: string;
  userAgent?: string;
  acceptLanguage?: string;
  /** The signed-in account, when the chat happens inside the app. */
  userId?: string;
}

/** Turns sent to the model. The knowledge pack, not the transcript, answers the question. */
const MAX_HISTORY = 20;

type VisitorIdentity = {
  visitorToken?: string;
  publicKey?: string;
  timezone?: string;
  pageUrl?: string;
  referrer?: string;
};

/** Everything the prompt builder and the API call need, and nothing else. */
const AGENT_SELECT = {
  id: true,
  name: true,
  status: true,
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
  leadFields: true,
  guidedFlow: true,
  model: true,
  effort: true,
  maxTokens: true,
  allowedOrigins: true,
  activePackId: true,
} as const;

/** Chrome the widget renders itself. None of this reaches the model. */
const WIDGET_CONFIG_SELECT = {
  heading: true,
  subheading: true,
  greeting: true,
  messagePresets: true,
  inputPlaceholder: true,
  avatarUrl: true,
  theme: true,
  leadCapture: true,
  leadFields: true,
  guidedFlow: true,
} as const;

/** What the widget needs to redraw a thread, including the feedback already left on it. */
const HISTORY_SELECT = {
  id: true,
  role: true,
  content: true,
  chipNodeId: true,
  rating: true,
  feedbackNote: true,
  createdAt: true,
} as const;

/**
 * The public answer path — what a share link, the in-app chat page and an
 * embedded widget all talk to. Every turn is recorded.
 */
@Injectable()
export class WidgetService {
  private readonly logger = new Logger(WidgetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly limits: WidgetRateLimitService,
    private readonly training: TrainingService,
    private readonly guidedFlow: GuidedFlowRuntimeService,
  ) {}

  // ── Config ─────────────────────────────────────────────────────────────────

  async config(publicKey: string, origin?: string) {
    const agent = await this.prisma.chatAgent.findUnique({
      where: { publicKey },
      select: { status: true, allowedOrigins: true, name: true, ...WIDGET_CONFIG_SELECT },
    });
    if (!agent) throw new NotFoundException({ message: 'Unknown chatbot key.', error: 'unknown_key' });

    this.assertOriginAllowed(agent.allowedOrigins, origin);
    this.assertActive(agent.status);

    return {
      agent: this.presentation(agent),
      guidedFlow: agent.guidedFlow ?? null,
    };
  }

  // ── Session ────────────────────────────────────────────────────────────────

  async session(dto: WidgetSessionDto, origin?: string, request?: RequestContext) {
    const agent = await this.prisma.chatAgent.findUnique({
      where: { publicKey: dto.publicKey },
      select: { ...AGENT_SELECT, ...WIDGET_CONFIG_SELECT },
    });
    if (!agent) throw new NotFoundException({ message: 'Unknown chatbot key.', error: 'unknown_key' });

    this.assertOriginAllowed(agent.allowedOrigins, origin);
    this.assertActive(agent.status);

    // Resume only. Opening the widget creates nothing — see `chat()`.
    const visitor = await this.resumeVisitor(dto.visitorToken, agent.id, request?.userId);
    const limit = await this.limits.peek(agent.id, visitor?.id ?? null);
    const messages = visitor ? await this.loadHistory(visitor.id) : [];

    return {
      visitorToken: visitor ? issueVisitorToken(visitor.id, agent.id) : null,
      messages,
      agent: this.presentation(agent),
      guidedFlow: agent.guidedFlow ?? null,
      visitor: visitor
        ? {
            id: visitor.id,
            currentNodeId: visitor.currentNodeId,
            guidedFlowExitedAt: visitor.guidedFlowExitedAt,
            handoffAt: visitor.handoffAt,
            name: visitor.name,
            rating: visitor.rating,
            ratingComment: visitor.ratingComment,
            captured: Boolean(visitor.phone || visitor.email),
          }
        : null,
      limited: !limit.allowed,
      retryAt: limit.retryAt ?? null,
    };
  }

  private presentation(agent: {
    name: string;
    heading: string | null;
    subheading: string | null;
    greeting: string | null;
    messagePresets: string[];
    inputPlaceholder: string | null;
    avatarUrl: string | null;
    theme: unknown;
    leadCapture: string;
    leadFields: string[];
  }) {
    return {
      name: agent.name,
      heading: agent.heading,
      subheading: agent.subheading,
      greeting: agent.greeting,
      messagePresets: agent.messagePresets,
      inputPlaceholder: agent.inputPlaceholder,
      avatarUrl: agent.avatarUrl,
      theme: resolveTheme(agent.theme),
      leadCapture: agent.leadCapture,
      leadFields: agent.leadFields,
    };
  }

  private async resumeVisitor(token: string | undefined, agentId: string, userId?: string) {
    if (!token) return null;
    try {
      const payload = readVisitorToken(token);
      if (payload.a !== agentId) return null;
      const existing = await this.prisma.chatWidgetVisitor.findUnique({ where: { id: payload.v } });
      if (!existing || existing.agentId !== agentId) return null;
      return await this.prisma.chatWidgetVisitor.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          // A thread started anonymously and continued after signing in is
          // attributed to the account from then on. Never re-pointed once set.
          ...(userId && !existing.userId ? { userId } : {}),
        },
      });
    } catch (error) {
      if (error instanceof InvalidVisitorTokenError) return null;
      throw error;
    }
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  async chat(dto: WidgetChatDto, origin?: string, request?: RequestContext) {
    const agent = await this.resolveChatAgent(dto);

    this.assertOriginAllowed(agent.allowedOrigins, origin);
    this.assertActive(agent.status);

    // Agent scope first, before any visitor exists — the ceiling that bounds spend.
    const agentVerdict = await this.limits.consumeAgent(agent.id);
    if (!agentVerdict.allowed) {
      this.logger.warn(`Refused by agent limit: agent=${agent.id}`);
      return {
        reply: agent.handoffMessage?.trim() || DEFAULT_LIMIT_MESSAGE,
        limited: true,
        retryAt: agentVerdict.retryAt ?? null,
        usage: null,
        visitorToken: null,
        assistantMessageId: null,
      };
    }

    const [pack, { visitor, issued, history }] = await Promise.all([
      this.loadPack(agent.activePackId),
      this.resolveOrCreateVisitor(dto, agent.id, request),
    ]);

    const verdict = await this.limits.consumeVisitor(visitor.id);
    if (!verdict.allowed) {
      this.logger.warn(`Refused by visitor limit: agent=${agent.id} visitor=${visitor.id}`);
      return {
        reply: agent.handoffMessage?.trim() || DEFAULT_LIMIT_MESSAGE,
        limited: true,
        retryAt: verdict.retryAt ?? null,
        usage: null,
        visitorToken: issued,
        assistantMessageId: null,
      };
    }

    const facts = agent.qualificationEnabled ? await this.loadVisitorFacts(visitor.id) : null;

    const askedAt = new Date();
    const { result, latencyMs } = await this.runTurn(
      agent,
      pack.content,
      history,
      dto.message,
      {
        feature: 'chat_widget',
        actorType: request?.userId ? 'user' : 'visitor',
        trigger: 'automatic',
        userId: request?.userId ?? null,
        visitorId: visitor.id,
        entityType: 'chat_agent',
        entityId: agent.id,
        endpoint: 'widget.chat',
      },
      facts,
    );

    const stored = await this.recordTurn(
      visitor.id,
      dto.message,
      result,
      latencyMs,
      pack.version,
      agent.model,
      askedAt,
    );

    this.logger.log(
      `agent=${agent.id} visitor=${visitor.id} pack=v${pack.version} ${latencyMs}ms ` +
        `in=${result.usage.inputTokens} out=${result.usage.outputTokens} ` +
        `cacheRead=${result.usage.cacheReadTokens} cacheWrite=${result.usage.cacheWriteTokens}`,
    );

    return {
      reply: result.text,
      limited: false,
      retryAt: null,
      usage: result.usage,
      visitorToken: issued,
      /** So the widget can attach a thumbs-up/down to this exact reply. */
      assistantMessageId: stored?.assistantMessageId ?? null,
    };
  }

  private async resolveChatAgent(dto: VisitorIdentity) {
    if (dto.visitorToken) {
      const payload = this.readToken(dto.visitorToken);
      const agent = await this.prisma.chatAgent.findUnique({ where: { id: payload.a }, select: AGENT_SELECT });
      if (!agent) throw new NotFoundException({ message: 'Unknown chatbot.', error: 'unknown_key' });
      return agent;
    }
    if (!dto.publicKey) {
      throw new BadRequestException({
        message: 'Send publicKey with the first message, or a visitorToken after that.',
        error: 'identity_missing',
      });
    }
    const agent = await this.prisma.chatAgent.findUnique({ where: { publicKey: dto.publicKey }, select: AGENT_SELECT });
    if (!agent) throw new NotFoundException({ message: 'Unknown chatbot key.', error: 'unknown_key' });
    return agent;
  }

  private async resolveOrCreateVisitor(
    dto: VisitorIdentity,
    agentId: string,
    request?: RequestContext,
  ): Promise<{ visitor: { id: string }; issued: string | null; history: WidgetChatMessageDto[] }> {
    if (dto.visitorToken) {
      const payload = this.readToken(dto.visitorToken);
      const existing = await this.prisma.chatWidgetVisitor.findUnique({
        where: { id: payload.v },
        select: {
          id: true,
          agentId: true,
          userId: true,
          messages: { orderBy: { createdAt: 'desc' }, take: MAX_HISTORY, select: { role: true, content: true } },
        },
      });
      if (existing && existing.agentId === agentId) {
        if (request?.userId && !existing.userId) {
          await this.prisma.chatWidgetVisitor.update({ where: { id: existing.id }, data: { userId: request.userId } });
        }
        const history: WidgetChatMessageDto[] = existing.messages
          .reverse()
          .map((row) => ({ role: row.role as WidgetChatMessageDto['role'], content: row.content }));
        return { visitor: { id: existing.id }, issued: null, history };
      }
    }

    const context = buildVisitorContext({
      ...request,
      timezone: dto.timezone,
      pageUrl: dto.pageUrl,
      referrer: dto.referrer,
    });

    // A signed-in tester's own name is a fact worth having on the thread from
    // the first turn — it is what `{{firstName}}` and the KNOWN FACTS block use.
    const account = request?.userId
      ? await this.prisma.user.findUnique({ where: { id: request.userId }, select: { name: true, email: true, isGuest: true } })
      : null;

    const created = await this.prisma.chatWidgetVisitor.create({
      data: {
        agentId,
        ...context,
        ...(request?.userId ? { userId: request.userId } : {}),
        // A guest's row carries a placeholder email; only its name is worth keeping.
        ...(account ? (account.isGuest ? { name: account.name } : { name: account.name, email: account.email }) : {}),
      },
      select: { id: true },
    });
    return { visitor: created, issued: issueVisitorToken(created.id, agentId), history: [] };
  }

  // ── Guided flow step ───────────────────────────────────────────────────────

  async step(dto: WidgetStepDto, origin?: string, request?: RequestContext) {
    const agent = await this.resolveChatAgent(dto);
    this.assertOriginAllowed(agent.allowedOrigins, origin);
    this.assertActive(agent.status);

    const agentVerdict = await this.limits.consumeAgent(agent.id);
    if (!agentVerdict.allowed) {
      throw new ForbiddenException({
        error: 'rate_limited',
        message: 'The chatbot is temporarily unavailable — please try again shortly.',
        retryAt: agentVerdict.retryAt ?? null,
      });
    }

    const { visitor: resolved, issued } = await this.resolveOrCreateVisitor(dto, agent.id, request);

    const stepVerdict = await this.limits.consumeStep(resolved.id);
    if (!stepVerdict.allowed) {
      throw new ForbiddenException({
        error: 'rate_limited',
        message: 'Too many clicks — please try again shortly.',
        retryAt: stepVerdict.retryAt ?? null,
      });
    }

    const visitor = await this.prisma.chatWidgetVisitor.findUniqueOrThrow({
      where: { id: resolved.id },
      select: {
        id: true,
        agentId: true,
        handoffAt: true,
        guidedFlowExitedAt: true,
        custom: true,
        fieldSources: true,
        timezone: true,
        name: true,
      },
    });

    const result = await this.guidedFlow.resolveStep({
      agent: { id: agent.id, name: agent.name, guidedFlow: agent.guidedFlow ?? null, handoffMessage: agent.handoffMessage },
      visitor,
      nodeId: dto.nodeId,
    });

    return { ...result, visitorToken: issued };
  }

  // ── Feedback ───────────────────────────────────────────────────────────────

  /** Thumbs up / down (or clear) on one of the bot's replies in the caller's own thread. */
  async rateMessage(dto: WidgetMessageFeedbackDto) {
    const payload = this.readToken(dto.visitorToken);
    const message = await this.prisma.chatWidgetMessage.findUnique({
      where: { id: dto.messageId },
      select: { id: true, role: true, visitorId: true },
    });
    if (!message || message.visitorId !== payload.v) {
      throw new NotFoundException({ message: 'Message not found in this conversation.', error: 'message_not_found' });
    }
    if (message.role !== 'assistant') {
      throw new BadRequestException({ message: 'Only the chatbot’s replies can be rated.', error: 'not_assistant' });
    }
    const rating = dto.rating ?? null;
    const updated = await this.prisma.chatWidgetMessage.update({
      where: { id: message.id },
      data: {
        rating,
        feedbackNote: dto.note?.trim() || null,
        ratedAt: rating || dto.note?.trim() ? new Date() : null,
      },
      select: { id: true, rating: true, feedbackNote: true, ratedAt: true },
    });
    return { ok: true, message: updated };
  }

  /** A star rating and optional comment on the whole conversation. */
  async rateConversation(dto: WidgetConversationFeedbackDto) {
    const payload = this.readToken(dto.visitorToken);
    const visitor = await this.prisma.chatWidgetVisitor.findUnique({ where: { id: payload.v }, select: { id: true } });
    if (!visitor) throw new NotFoundException({ message: 'Conversation not found.', error: 'visitor_not_found' });
    const updated = await this.prisma.chatWidgetVisitor.update({
      where: { id: visitor.id },
      data: { rating: dto.rating, ratingComment: dto.comment?.trim() || null, ratedAt: new Date() },
      select: { id: true, rating: true, ratingComment: true, ratedAt: true },
    });
    return { ok: true, visitor: updated };
  }

  // ── Staff preview ──────────────────────────────────────────────────────────

  async preview(agentId: string, dto: TestChatAgentDto, userId?: string) {
    const agent = await this.prisma.chatAgent.findUnique({ where: { id: agentId }, select: AGENT_SELECT });
    if (!agent) throw new NotFoundException('Chatbot not found');

    const pack = await this.loadPack(agent.activePackId);
    const [{ result, latencyMs }, training] = await Promise.all([
      this.runTurn(agent, pack.content, dto.history, dto.message, {
        feature: 'chat_widget',
        actorType: 'user',
        trigger: 'manual',
        userId,
        entityType: 'chat_agent',
        entityId: agent.id,
        endpoint: 'widget.test',
      }),
      this.training.getTrainingState(agentId),
    ]);

    return {
      reply: result.text,
      agent: {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        model: agent.model,
        effort: resolveEffort(agent.model, agent.effort) ?? null,
        knowledgeMode: agent.knowledgeMode,
      },
      pack: { version: pack.version, tokenCount: pack.tokenCount, builtAt: pack.builtAt },
      training: {
        needed: training.needed,
        added: training.added,
        removed: training.removed,
        changed: training.changed,
      },
      usage: result.usage,
      latencyMs,
      ...(dto.includePrompt
        ? { prompt: { preamble: ENGINE_PREAMBLE, persona: buildPersona(agent), knowledgeChars: pack.content.length } }
        : {}),
    };
  }

  // ── Shared turn ────────────────────────────────────────────────────────────

  private async loadHistory(visitorId: string) {
    const rows = await this.prisma.chatWidgetMessage.findMany({
      where: { visitorId },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: HISTORY_SELECT,
    });
    return rows.reverse();
  }

  private async recordTurn(
    visitorId: string,
    question: string,
    result: { text: string; usage: ChatUsage },
    latencyMs: number,
    packVersion: number,
    model: string,
    askedAt: Date,
  ): Promise<{ userMessageId: string; assistantMessageId: string } | null> {
    try {
      const [userMsg, assistantMsg] = await this.prisma.$transaction([
        this.prisma.chatWidgetMessage.create({
          data: { visitorId, role: 'user', content: question, createdAt: askedAt },
          select: { id: true },
        }),
        this.prisma.chatWidgetMessage.create({
          data: {
            visitorId,
            role: 'assistant',
            content: result.text,
            model,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            cacheReadTokens: result.usage.cacheReadTokens,
            cacheWriteTokens: result.usage.cacheWriteTokens,
            latencyMs,
            packVersion,
            createdAt: new Date(),
          },
          select: { id: true },
        }),
        this.prisma.chatWidgetVisitor.update({
          where: { id: visitorId },
          data: { lastSeenAt: new Date(), messageCount: { increment: 1 } },
        }),
      ]);
      return { userMessageId: userMsg.id, assistantMessageId: assistantMsg.id };
    } catch (error) {
      this.logger.error(`Answered but could not store the turn for visitor ${visitorId}: ${(error as Error)?.message}`);
      return null;
    }
  }

  private async loadPack(activePackId: string | null) {
    const pack = activePackId
      ? await this.prisma.chatAgentKnowledgePack.findUnique({
          where: { id: activePackId },
          select: { content: true, version: true, tokenCount: true, builtAt: true },
        })
      : null;
    if (!pack) {
      throw new ConflictException({
        message: 'This chatbot has no knowledge to answer from. Train it first.',
        error: 'not_trained',
      });
    }
    return pack;
  }

  private async runTurn(
    agent: Parameters<typeof buildSystemBlocks>[0] & { model: string; effort: string; maxTokens: number },
    packContent: string,
    history: WidgetChatMessageDto[] | undefined,
    message: string,
    attribution: AiAttribution & { endpoint: string },
    facts: VisitorFacts | null = null,
  ) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException({
        message: 'The assistant is not available right now.',
        error: 'ai_not_configured',
      });
    }

    // KNOWN FACTS goes into the LAST user message, never the system prompt —
    // the system prefix is what the prompt cache keys on.
    const composedMessage = facts ? `${formatKnownFacts(facts)}\n\n---\n\n${message}` : message;

    const started = Date.now();
    const result = await this.anthropic.chat(
      {
        model: agent.model,
        system: buildSystemBlocks(agent, packContent),
        messages: this.buildMessages(history, composedMessage),
        maxTokens: agent.maxTokens,
        effort: resolveEffort(agent.model, agent.effort),
      },
      attribution,
    );
    return { result, latencyMs: Date.now() - started };
  }

  private async loadVisitorFacts(visitorId: string): Promise<VisitorFacts | null> {
    return this.prisma.chatWidgetVisitor.findUnique({
      where: { id: visitorId },
      select: { name: true, phone: true, email: true, location: true, courseInterest: true, custom: true },
    });
  }

  // ── Contact capture ────────────────────────────────────────────────────────

  /**
   * The visitor filled the details card. Stored on the visitor row so a
   * reviewer knows who was chatting; no CRM lead is created in this app.
   */
  async captureLead(dto: WidgetLeadDto, origin?: string, request?: RequestContext) {
    const agent = await this.resolveChatAgent(dto);
    this.assertOriginAllowed(agent.allowedOrigins, origin);
    this.assertActive(agent.status);

    const { visitor: resolved, issued } = await this.resolveOrCreateVisitor(dto, agent.id, request);

    const name = dto.name?.trim() || undefined;
    const phone = dto.phone ? this.normalizePhone(dto.phone) : undefined;
    const email = dto.email?.trim().toLowerCase() || undefined;

    await this.prisma.chatWidgetVisitor.update({
      where: { id: resolved.id },
      data: {
        lastSeenAt: new Date(),
        ...(name ? { name } : {}),
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        fieldSources: {
          ...(name ? { name: 'form' } : {}),
          ...(phone ? { phone: 'form' } : {}),
          ...(email ? { email: 'form' } : {}),
        },
      },
    });

    this.logger.log(`widget-lead agent=${agent.id} visitor=${resolved.id} name="${name ?? ''}" phone=${phone ?? ''}`);

    return { ok: true, leadCreated: false, deduped: false, visitorToken: issued };
  }

  /** Keeps digits and a leading `+`; the widget already validated the shape. */
  private normalizePhone(input: string): string {
    const trimmed = input.trim();
    const digits = trimmed.replace(/[^\d]/g, '');
    return trimmed.startsWith('+') ? `+${digits}` : digits;
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  private readToken(token: string) {
    try {
      return readVisitorToken(token);
    } catch (error) {
      if (error instanceof InvalidVisitorTokenError) {
        throw new UnauthorizedException({ message: 'Session has expired. Start a new one.', error: 'invalid_token' });
      }
      throw error;
    }
  }

  private assertActive(status: string) {
    if (status !== 'active') {
      throw new ForbiddenException({ message: 'This chatbot is not live.', error: 'agent_not_active' });
    }
  }

  /**
   * The app's own origin (share links, the in-app chat page, the builder
   * preview) is always allowed. Anything else must be on the bot's list — that
   * is what lets a bot be embedded on an external site with a script tag.
   */
  private assertOriginAllowed(allowed: string[], origin?: string) {
    if (isFrontendOrigin(origin)) return;
    if (process.env.NODE_ENV !== 'production' && origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return;
    }
    if (!origin) {
      throw new ForbiddenException({ message: 'Request did not come from an allowed website.', error: 'origin_missing' });
    }
    if (!allowed.includes(origin.trim().toLowerCase().replace(/\/+$/, ''))) {
      throw new ForbiddenException({
        message: 'Request did not come from an allowed website. Add the site to the chatbot’s allowed origins.',
        error: 'origin_not_allowed',
      });
    }
  }

  private buildMessages(history: WidgetChatMessageDto[] | undefined, message: string): Anthropic.MessageParam[] {
    const recent = (history ?? []).slice(-MAX_HISTORY);
    while (recent.length > 0 && recent[0].role !== 'user') recent.shift();
    return [...recent.map((m) => ({ role: m.role, content: m.content })), { role: 'user' as const, content: message }];
  }
}

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
import { detectPhone, extractFactsTag, looksLikeName, type ExtractedFacts } from './lead-extract.util';
import { composeStored, extractReplyParts } from './ui-block.util';
import {
  AUTO_MARKER,
  autoLeadMessage,
  detectName,
  isLeadForm,
  requireContact,
  LEAD_GATE_AFTER,
  LEAD_SOFT_AFTER,
  withoutKnownFields,
} from './lead-flow.util';
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

/** Follow-ups a quiet visitor can receive in one conversation. */
const NUDGE_LIMIT = 2;

/** What a rule-based bot says if a typed message reaches it anyway. Never stored, never sent to the model. */
const NO_AI_REPLY = 'I answer from the options below. Pick the one closest to your question.';

function isNoAiFlow(flow: unknown): boolean {
  return Boolean(flow && typeof flow === 'object' && (flow as { noAi?: unknown }).noAi === true);
}

/** Sent in place of a visitor message when the widget asks for a follow-up. Never stored. */
const NUDGE_INSTRUCTION = [
  '[NO NEW MESSAGE: the visitor has been quiet for about a minute after your last reply.]',
  'Send ONE short follow-up that re-engages them, in your own persona. Do not repeat your last reply. Do not mention the silence at all: no "still there", "still around", "no pressure" or similar; just continue as if with a fresh, useful thought.',
  'Open a loop they will want to close: one concrete, useful thing that fits the conversation so far (something about the topic they cared about that they have not seen yet, a comparison, a check you can run for them) and end with one easy question. Do not ask for their name or number in this message, and use a photo only if seeing the place is the point.',
  'One or two short lines of text, then suggested replies in <next>. No element unless it directly serves that next step.',
].join('\n');

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
  feedbackReason: true,
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
      // Another signed-in person's thread (same browser, new tester): start fresh.
      if (existing.userId && userId && existing.userId !== userId) return null;
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

    // A rule-based bot never reaches the model: no typed questions, no AI follow-ups.
    if (isNoAiFlow(agent.guidedFlow)) {
      return {
        reply: dto.nudge ? null : NO_AI_REPLY,
        limited: false,
        retryAt: null,
        usage: null,
        visitorToken: null,
        assistantMessageId: null,
        ...(dto.nudge ? { nudgeRefused: 'rule_based' } : {}),
      };
    }

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
    const contact = facts ?? (await this.loadVisitorFacts(visitor.id));
    const botReplies = await this.countBotReplies(visitor.id);

    // Compulsory details: once the gate form has been shown, nothing more until a number is left.
    const leadState = await this.leadState(visitor.id);
    if (!contact?.phone && leadState.gateShown) {
      return {
        reply: dto.nudge ? null : autoLeadMessage('gate', contact),
        limited: false,
        retryAt: null,
        usage: null,
        visitorToken: issued,
        assistantMessageId: null,
        ...(dto.nudge ? { nudgeRefused: 'details_required' } : {}),
      };
    }

    // A follow-up to a quiet visitor: allowed only after a bot turn, once per
    // silence, and at most NUDGE_LIMIT times in a conversation.
    if (dto.nudge) {
      const refused = await this.refuseNudge(visitor.id, history);
      if (refused) {
        return {
          reply: null,
          limited: false,
          retryAt: null,
          usage: null,
          visitorToken: issued,
          assistantMessageId: null,
          nudgeRefused: refused,
        };
      }
    }
    const turnMessage = dto.nudge ? NUDGE_INSTRUCTION : dto.message;

    const askedAt = new Date();
    const { result, latencyMs } = await this.runTurn(
      agent,
      pack.content,
      history,
      turnMessage,
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

    // The model reports what it learned in a hidden tag at the end of its reply.
    // Strip it before anything is stored or shown, and keep the facts.
    const { text: factFree, facts: learned } = extractFactsTag(result.text);
    // Then the element, photos and follow-ups, validated and stored in canonical form.
    const parts = extractReplyParts(factFree);
    this.logger.log(
      `agent=${agent.id} reply tags: ui=${/<ui>/.test(result.text) ? 1 : 0} media=${/<media>/.test(result.text) ? 1 : 0} ` +
        `next=${/<next>/.test(result.text) ? 1 : 0} out=${result.usage.outputTokens}${dto.nudge ? ' (nudge)' : ''}`,
    );
    if (parts.rejected) this.logger.warn(`agent=${agent.id} dropped an invalid <ui> block: ${parts.reason}`);
    if (!dto.nudge) {
      const fallbackPhone = detectPhone(dto.message);
      if (fallbackPhone && !learned.mobile) learned.mobile = fallbackPhone;
      const fallbackName = detectName(dto.message);
      if (fallbackName && !learned.name && !contact?.name) learned.name = fallbackName;
    }
    // Never ask again for what the visitor already gave (this message included).
    const knownNow = {
      name: contact?.name || learned.name || null,
      phone: contact?.phone || learned.mobile || null,
      email: contact?.email || learned.email || null,
    };
    parts.ui = requireContact(withoutKnownFields(parts.ui, knownNow), knownNow);
    if (isLeadForm(parts.ui)) parts.next = [];
    const cleanReply = composeStored(parts);
    if (agent.qualificationEnabled && !dto.nudge) {
      await this.persistFacts(visitor.id, learned, facts);
    }

    // The lead rules: after the 3rd reply a details form (skippable, once);
    // from the 6th, a compulsory one. Each arrives as its own message.
    // Exactly at the 3rd reply (skippable) and the 6th (compulsory). If the reply
    // is itself a question (a quiz step), the widget keeps that question
    // answerable beside the skippable form; the compulsory one replaces it.
    let followup: string | null = null;
    if (!knownNow.phone && !dto.nudge) {
      const replies = botReplies + 1;
      if (replies >= LEAD_GATE_AFTER) {
        followup = autoLeadMessage('gate', knownNow);
        await this.markLead(visitor.id, 'leadGateShown');
      } else if (replies >= LEAD_SOFT_AFTER && !leadState.softShown) {
        await this.markLead(visitor.id, 'leadSoftShown');
        if (!isLeadForm(parts.ui)) followup = autoLeadMessage('soft', knownNow);
      }
    }
    const cleaned = { ...result, text: cleanReply };

    const stored = await this.recordTurn(
      visitor.id,
      dto.nudge ? null : dto.message,
      cleaned,
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

    // Stored after the reply, so a reloaded thread shows it in the same place.
    const followupRow = followup
      ? await this.prisma.chatWidgetMessage.create({
          data: { visitorId: visitor.id, role: 'assistant', content: followup, createdAt: new Date(Date.now() + 1) },
          select: { id: true },
        })
      : null;

    return {
      reply: cleaned.text,
      limited: false,
      retryAt: null,
      usage: result.usage,
      visitorToken: issued,
      /** So the widget can attach a thumbs-up/down to this exact reply. */
      assistantMessageId: stored?.assistantMessageId ?? null,
      /** A second bot message (the lead form), shown right after the reply. */
      followup: followup && followupRow ? { id: followupRow.id, content: followup } : null,
    };
  }

  /** Bot replies so far, leaving out the lead forms the server adds itself. */
  private countBotReplies(visitorId: string) {
    return this.prisma.chatWidgetMessage.count({
      where: { visitorId, role: 'assistant', NOT: { content: { contains: AUTO_MARKER } } },
    });
  }

  private async leadState(visitorId: string) {
    const row = await this.prisma.chatWidgetVisitor.findUnique({ where: { id: visitorId }, select: { custom: true } });
    const custom = ((row?.custom ?? {}) as Record<string, unknown>) || {};
    return { softShown: Boolean(custom.leadSoftShown), gateShown: Boolean(custom.leadGateShown) };
  }

  private async markLead(visitorId: string, flag: 'leadSoftShown' | 'leadGateShown') {
    const row = await this.prisma.chatWidgetVisitor.findUnique({ where: { id: visitorId }, select: { custom: true } });
    const custom = ((row?.custom ?? {}) as Record<string, unknown>) || {};
    await this.prisma.chatWidgetVisitor.update({ where: { id: visitorId }, data: { custom: { ...custom, [flag]: true } as object } });
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
      // A thread belonging to a different signed-in person is never continued.
      const otherUser = Boolean(existing?.userId && request?.userId && existing.userId !== request.userId);
      if (existing && existing.agentId === agentId && !otherUser) {
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
        // The source is recorded so the counsellor prompt still asks the person
        // who they are — an account label ("Guest 3f2a", "Admin") is not a lead.
        ...(account ? (account.isGuest ? { name: account.name } : { name: account.name, email: account.email }) : {}),
        ...(account ? { fieldSources: { name: 'account', ...(account.isGuest ? {} : { email: 'account' }) } } : {}),
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
        phone: true,
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
        // A reason only means something next to a vote. Omitted = keep what is stored.
        ...(rating ? (dto.reason !== undefined ? { feedbackReason: dto.reason } : {}) : { feedbackReason: null }),
        ratedAt: rating || dto.note?.trim() ? new Date() : null,
      },
      select: { id: true, rating: true, feedbackNote: true, feedbackReason: true, ratedAt: true },
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

    const { text: factFree, facts: learned } = extractFactsTag(result.text);
    const reply = composeStored(extractReplyParts(factFree));
    return {
      reply,
      learned,
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
    /** Null for a nudge: the bot speaks without a visitor message before it. */
    question: string | null,
    result: { text: string; usage: ChatUsage },
    latencyMs: number,
    packVersion: number,
    model: string,
    askedAt: Date,
  ): Promise<{ userMessageId: string | null; assistantMessageId: string } | null> {
    try {
      if (question === null) {
        const [assistantMsg] = await this.prisma.$transaction([
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
          this.prisma.chatWidgetVisitor.update({ where: { id: visitorId }, data: { lastSeenAt: new Date() } }),
        ]);
        return { userMessageId: null, assistantMessageId: assistantMsg.id };
      }
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

  /** Why a nudge may not be sent now, or null when it may. */
  private async refuseNudge(visitorId: string, history: WidgetChatMessageDto[]): Promise<string | null> {
    const last = history[history.length - 1];
    if (!last || last.role !== 'assistant') return 'not_after_bot_turn';
    if (history.length >= 2 && history[history.length - 2].role === 'assistant') return 'already_nudged';
    const row = await this.prisma.chatWidgetVisitor.findUnique({ where: { id: visitorId }, select: { custom: true } });
    const custom = ((row?.custom ?? {}) as Record<string, unknown>) || {};
    const count = Number(custom.nudges ?? 0);
    if (count >= NUDGE_LIMIT) return 'limit_reached';
    await this.prisma.chatWidgetVisitor.update({
      where: { id: visitorId },
      data: { custom: { ...custom, nudges: count + 1 } as object },
    });
    return null;
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
    const row = await this.prisma.chatWidgetVisitor.findUnique({
      where: { id: visitorId },
      select: { name: true, phone: true, email: true, location: true, courseInterest: true, custom: true, fieldSources: true },
    });
    if (!row) return null;
    const sources = ((row.fieldSources ?? {}) as Record<string, string>) || {};
    // A name copied from the tester's account is not something the visitor told
    // us, so the bot should still ask. Same for the account email.
    return {
      name: sources.name === 'account' ? null : row.name,
      phone: row.phone,
      email: sources.email === 'account' ? null : row.email,
      location: row.location,
      courseInterest: row.courseInterest,
      custom: row.custom,
    };
  }

  /**
   * Write what the bot learned this turn onto the visitor row. Columns for the
   * fields the inbox shows (name, phone, email, course, location); everything
   * else goes into `custom` so the KNOWN FACTS block carries it next turn.
   * A value already given by the visitor is never overwritten by the model's
   * paraphrase — only by the visitor saying something new (later turn wins).
   */
  private async persistFacts(visitorId: string, learned: ExtractedFacts, known: VisitorFacts | null) {
    const entries = Object.entries(learned).filter(([, v]) => v && v.trim());
    if (entries.length === 0) return;

    const row = await this.prisma.chatWidgetVisitor.findUnique({
      where: { id: visitorId },
      select: { custom: true, fieldSources: true, name: true },
    });
    if (!row) return;
    const custom = { ...(((row.custom ?? {}) as Record<string, unknown>) || {}) };
    const sources = { ...(((row.fieldSources ?? {}) as Record<string, string>) || {}) };
    const data: Record<string, unknown> = {};

    for (const [key, raw] of entries) {
      const value = raw!.trim();
      switch (key) {
        case 'name':
          if (!looksLikeName(value)) break;
          data.name = value;
          custom.firstName = value.split(/\s+/)[0];
          sources.name = 'chat';
          break;
        case 'mobile':
          data.phone = value;
          sources.phone = 'chat';
          break;
        case 'email':
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) break;
          data.email = value.toLowerCase();
          sources.email = 'chat';
          break;
        case 'courseInterest':
          data.courseInterest = value;
          custom.courseInterest = value;
          sources.courseInterest = 'chat';
          break;
        case 'city':
          data.location = value;
          custom.city = value;
          sources.city = 'chat';
          break;
        default:
          custom[key] = value;
          sources[`custom.${key}`] = 'chat';
      }
    }

    await this.prisma.chatWidgetVisitor.update({
      where: { id: visitorId },
      data: { ...data, custom: custom as object, fieldSources: sources as object },
    });
    this.logger.log(
      `facts agent-visitor=${visitorId} learned=${Object.keys(learned).join(',')}` +
        (known ? '' : ' (no prior facts)'),
    );
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

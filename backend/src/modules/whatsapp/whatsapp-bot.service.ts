import type Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AnthropicService } from '../ai/anthropic.service';
import { resolveEffort } from '../chat-agents/chat-agent-models';
import { formatKnownFacts } from '../chat-agents/qualifier.util';
import { looksLikeName, type ExtractedFacts } from '../chat-agents/lead-extract.util';
import { readEnvelope, type InboundMessage, type StatusUpdate } from './mcube-payload';
import { buildWhatsappSystem } from './whatsapp-prompt';
import { aiOptions, composeInteractive, optionsOf, parseWhatsappReply, transcriptOf, type HandoffReason } from './whatsapp-render';
import {
  applyMessages,
  audienceMessages,
  chatHandoffMessages,
  deptHandoffMessages,
  deptPassedMessages,
  isEnrolled,
  OTHER_TEXT,
  studentMenuMessages,
  unclearMessages,
  handoffStartMessages,
  openerInstruction,
  MAIN_MENU,
  menuMessages,
  OPT_IN_TEXT,
  OPT_OUT_TEXT,
  resolveByTitle,
  resolveNumbered,
  route,
  SNOOZE_TEXT,
  templateButtonId,
  slotConfirmMessages,
  slotMessages,
  welcomeMessages,
  type Decision,
} from './whatsapp-router';
import { captureTransport, liveTransport, WhatsappSenderService, type TransportContext } from './whatsapp-sender.service';
import type { OutboundMessage, OutboundSource, WaOption } from './whatsapp.types';
import { CrmLeadLookupService } from './crm-lead-lookup.service';
import { WhatsappScoreService } from './whatsapp-score.service';

const HOUR = 60 * 60 * 1000;
const MAX_HISTORY = 20;
/** The worker's beat. */
const TICK_MS = 1000;
/** Answer once they have been quiet this long, so "hi" "ok" "??" gets one reply. */
const QUIET_MS = 3000;
/** How long one process may hold a person before another may take over. */
const LEASE_MS = 90_000;
/** Never answer a question older than this: a person should pick it up instead. */
const STALE_MS = 30 * 60 * 1000;
/** How long the bot stays quiet after a person chooses "Chat here" with a counsellor. */
const CHAT_HANDOFF_PAUSE = 12 * HOUR;

/**
 * The follow-up ladder, measured from their last message.
 *
 * Steps 1 and 2 are free-form AI nudges and must land inside the 24h window.
 * Steps 3 to 5 are approved templates (`WHATSAPP_FOLLOWUP_TEMPLATES`) and only
 * run when some are configured. Any message from them resets the ladder.
 */
const LADDER = [3 * HOUR, 22 * HOUR, 48 * HOUR, 96 * HOUR, 168 * HOUR];

type ContactRow = Prisma.WhatsappContactGetPayload<{ include: { visitor: true } }>;

export interface TurnResult {
  duplicate?: boolean;
  decision?: Decision['type'];
  handoff?: HandoffReason | null;
  outbound: Array<OutboundMessage & { messageId: string }>;
}

/**
 * The WhatsApp bot: one inbound message in, the right messages out.
 *
 *   webhook → dedupe → contact → tap resolution → router → (AI turn) → sender
 *
 * Receiving only stores; one worker answers each person under a database lease
 * (see "The core" below), so a reply is never sent twice.
 */
@Injectable()
export class WhatsappBotService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WhatsappBotService.name);
  /** Set by the follow-up engine at boot; the worker runs it after answering. */
  followups: { runDue(): Promise<unknown>; plan?(contactId: string): Promise<unknown> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly sender: WhatsappSenderService,
    private readonly crm: CrmLeadLookupService,
    private readonly scores: WhatsappScoreService,
  ) {}

  // ── The core: receive, then one worker answers ────────────────────────────
  //
  // Receiving never replies. The webhook and the Mcube poller only STORE a
  // message (deduped on its wamid). One loop, `tick()`, finds people with
  // unhandled messages, takes a lease on that person in the database, and
  // answers everything they sent since the last reply in ONE turn.
  //
  // Why this shape: bursts ("hi" "ok" "??"), restarts, recovery and a second
  // server process overlapping during a deploy are all the same case here, a
  // person with unhandled messages, and the lease means only one process can
  // ever answer them. There is no in-memory queue to lose and nothing to race.
  //
  // At most once: a message is CLAIMED before the turn and HANDLED after it. A
  // turn that fails before sending anything releases its claim (it is retried);
  // a turn that sent anything is handled even if it failed later (never twice).

  private ticking = false;
  private timer: NodeJS.Timeout | null = null;

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass: answer everyone who is waiting, then send what follow-ups are due. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const waiting = await this.prisma.$queryRaw<Array<{ contactId: string }>>`
        SELECT m."contactId"
          FROM whatsapp_messages m
          JOIN whatsapp_contacts c ON c.id = m."contactId"
         WHERE m.direction = 'in' AND m."handledAt" IS NULL AND c.simulated = false
           AND (m."claimedAt" IS NULL OR m."claimedAt" < now() - interval '3 minutes')
         GROUP BY m."contactId"
        HAVING max(m."createdAt") < now() - (${QUIET_MS / 1000} * interval '1 second')`;
      for (const { contactId } of waiting) {
        await this.withLease(contactId, () => this.answerWaiting(contactId, liveTransport())).catch((err) =>
          this.logger.error(`Turn for contact ${contactId} failed: ${(err as Error)?.stack ?? err}`),
        );
      }
      if (process.env.WHATSAPP_FOLLOWUPS_ENABLED !== 'false') await this.followups?.runDue();
    } catch (err) {
      this.logger.error(`Tick failed: ${(err as Error)?.message}`);
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Run `fn` holding this person's lease. The lease is a conditional UPDATE, so
   * two processes (an old one finishing during a restart, a new one starting)
   * can never both hold it. Returns null when someone else holds it.
   */
  async withLease<T>(contactId: string, fn: () => Promise<T>, waitMs = 0): Promise<T | null> {
    const token = randomUUID();
    const deadline = Date.now() + waitMs;
    for (;;) {
      const now = new Date();
      const got = await this.prisma.whatsappContact.updateMany({
        where: { id: contactId, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
        data: { lockedUntil: new Date(now.getTime() + LEASE_MS), lockToken: token },
      });
      if (got.count) break;
      if (Date.now() >= deadline) return null;
      await new Promise((r) => setTimeout(r, 500));
    }
    try {
      return await fn();
    } finally {
      await this.prisma.whatsappContact.updateMany({ where: { id: contactId, lockToken: token }, data: { lockedUntil: null, lockToken: null } });
    }
  }

  /** Receipts and messages from the webhook or the Mcube poller: stored, answered by the worker. */
  async ingestParsed(messages: InboundMessage[], statuses: StatusUpdate[]): Promise<{ messages: number; statuses: number; applied: number }> {
    let applied = 0;
    for (const status of statuses) {
      if (await this.sender.applyStatus(status)) applied++;
    }
    let stored = 0;
    for (const message of messages) {
      if (await this.storeInbound(message, false)) stored++;
    }
    return { messages: stored, statuses: statuses.length, applied };
  }

  async ingest(payload: unknown): Promise<{ messages: number; statuses: number; applied: number }> {
    const { messages, statuses } = readEnvelope(payload);
    if (!messages.length && !statuses.length) {
      this.logger.warn(
        `Webhook carried nothing readable. Keys: [${Object.keys((payload ?? {}) as object).join(', ')}]. If Mcube changed its shape, mcube-payload.ts is where to teach it.`,
      );
    }
    return this.ingestParsed(messages, statuses);
  }

  /**
   * Store one inbound message. Never replies. Returns the contact id, or null for
   * a duplicate (the wamid unique index) or our own number echoing back.
   */
  private async storeInbound(msg: InboundMessage, simulated: boolean): Promise<string | null> {
    const own = (process.env.WHATSAPP_BUSINESS_NUMBER ?? '').replace(/\D/g, '');
    if (own && msg.waId === own) return null;

    const agent = await this.resolveAgent();
    const contact = await this.upsertContact(msg, agent.id, simulated);

    // Resolve a tap now, against what their phone shows at this moment.
    const pending = this.pendingOf(contact);
    let optionId = msg.optionId;
    let tapped: WaOption | null = optionId ? (pending.find((o) => o.id === optionId) ?? null) : null;
    if (!optionId) {
      tapped = resolveNumbered(msg.text, pending) ?? resolveByTitle(msg.text, pending);
      optionId = tapped?.id ?? null;
    }
    const text = tapped?.title ?? msg.text;

    try {
      await this.prisma.whatsappMessage.create({
        data: {
          contactId: contact.id,
          direction: 'in',
          kind: msg.kind,
          body: text,
          payload: { ...(msg.raw as object), ...(tapped?.rest ? { rest: tapped.rest } : {}) } as object,
          source: 'user',
          provider: simulated || msg.providerMessageId?.startsWith('sim.') ? 'simulator' : 'mcube',
          providerMessageId: msg.providerMessageId,
          inReplyToId: msg.inReplyTo,
          optionId,
          optionTitle: tapped?.title ?? (optionId ? text : null),
          status: 'received',
          statusRank: 0,
          createdAt: msg.timestamp,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }

    const hadReply = await this.prisma.whatsappMessage.count({ where: { contactId: contact.id, direction: 'out' } });
    await this.prisma.whatsappContact.update({
      where: { id: contact.id },
      data: {
        lastInboundAt: new Date(),
        // Any message from them restarts the follow-up ladder.
        followupCount: 0,
        followupAnchorAt: new Date(),
        nextFollowupAt: null,
        ...(contact.stage === 'new' && hadReply ? { stage: 'engaged' } : {}),
      },
    });
    await this.prisma.chatWidgetMessage.create({
      data: { visitorId: contact.visitorId, role: 'user', content: text?.trim() || `[${msg.kind}]`, createdAt: msg.timestamp },
    });
    await this.prisma.chatWidgetVisitor.update({
      where: { id: contact.visitorId },
      data: { lastSeenAt: new Date(), messageCount: { increment: 1 } },
    });
    if (this.isCoach(msg.waId)) this.logger.log(`[coach ${msg.waId}] in: ${JSON.stringify(text)}`);
    return contact.id;
  }

  /**
   * Answer everything this person sent since the last reply, as one turn.
   * Callers hold the lease.
   */
  private async answerWaiting(contactId: string, transport: TransportContext): Promise<TurnResult> {
    const waiting = await this.prisma.whatsappMessage.findMany({
      where: {
        contactId,
        direction: 'in',
        handledAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - 3 * 60 * 1000) } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!waiting.length) return { outbound: [] };
    const ids = waiting.map((m) => m.id);
    const last = waiting[waiting.length - 1];

    // A turn that died after sending (a crash between send and "handled"): it WAS answered.
    const stale = waiting.find((m) => m.claimedAt);
    if (stale) {
      const sentSince = await this.prisma.whatsappMessage.count({
        where: { contactId, direction: 'out', createdAt: { gte: stale.claimedAt! } },
      });
      if (sentSince) {
        await this.prisma.whatsappMessage.updateMany({ where: { id: { in: ids } }, data: { handledAt: new Date() } });
        return { outbound: [] };
      }
    }

    const done = (at = new Date()) => this.prisma.whatsappMessage.updateMany({ where: { id: { in: ids } }, data: { handledAt: at } });

    // A late answer to an old question reads worse than none: leave it for a person.
    if (Date.now() - last.createdAt.getTime() > STALE_MS) {
      this.logger.warn(`Not answering ${contactId}: newest waiting message is older than ${STALE_MS / 60000} min.`);
      await done();
      return { outbound: [] };
    }
    if (transport.mode === 'live' && process.env.WHATSAPP_BOT_ENABLED === 'false') {
      await done();
      return { outbound: [] };
    }

    const claimedAt = new Date();
    await this.prisma.whatsappMessage.updateMany({ where: { id: { in: ids } }, data: { claimedAt } });

    try {
      const agent = await this.resolveAgent();
      let contact = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contactId }, include: { visitor: true } });
      contact = await this.enrichFromCrm(contact);

      // The latest message decides the turn (a tap, a command); the rest is context the model sees.
      const tapped: WaOption | null = last.optionId
        ? (this.pendingOf(contact).find((o) => o.id === last.optionId) ??
          { id: last.optionId, title: last.optionTitle ?? last.body ?? '', ...((last.payload as unknown as { rest?: WaOption[] } | null)?.rest ? { rest: (last.payload as unknown as { rest: WaOption[] }).rest } : {}) })
        : null;
      const texts = waiting.map((m) => m.body?.trim()).filter((t): t is string => !!t);
      const combined = texts.length > 1 && !tapped ? texts.join('\n') : (last.body ?? '');

      const sent = await this.prisma.whatsappMessage.findMany({ where: { contactId, direction: 'out' }, select: { kind: true } });
      const decision = route({
        afterTemplateOnly: sent.length > 0 && sent.every((m) => m.kind === 'template'),
        audience: this.audienceOf(contact),
        coach: this.isCoach(contact.waId),
        text: tapped ? last.body : combined,
        optionId: last.optionId,
        firstContact: sent.length === 0,
        paused: !!contact.botPausedUntil && contact.botPausedUntil > new Date(),
        optedOut: !!contact.optedOutAt,
        applicationFeeKnown: this.knows(contact, 'applicationFee'),
        awaitingDeptPass: await this.awaitingDeptPass(contact.id),
        unclearRun: await this.unclearRun(contact.id),
      });

      let result: TurnResult;
      if (sent.length > 0 && sent.every((m) => m.kind === 'template') && decision.type === 'ai') {
        const intro = `[This is your first real message to them after our template. Start with who you are in a few words (Tara from Acharya), then answer.]\n\n${decision.message}`;
        result = await this.act({ type: 'ai', message: intro }, contact, agent, transport, tapped, combined);
      } else {
        result = await this.act(decision, contact, agent, transport, tapped, combined);
      }
      await done();
      // Their conversion score moves with what they just said.
      await this.scores.rescore(contactId);
      return result;
    } catch (err) {
      const sentSince = await this.prisma.whatsappMessage.count({ where: { contactId, direction: 'out', createdAt: { gte: claimedAt } } });
      if (sentSince) await done();
      else await this.prisma.whatsappMessage.updateMany({ where: { id: { in: ids } }, data: { claimedAt: null } });
      throw err;
    }
  }

  /**
   * The in-app simulator: the same pipeline, answered synchronously. Nothing is
   * sent unless `live` (allowlist and 24h window still apply).
   */
  async simulate(input: { waId: string; text?: string; optionId?: string; profileName?: string; live?: boolean }): Promise<TurnResult> {
    const message: InboundMessage = {
      waId: input.waId,
      profileName: input.profileName ?? null,
      providerMessageId: `sim.in.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      kind: input.optionId ? 'interactive_reply' : 'text',
      text: input.text ?? null,
      optionId: input.optionId ?? null,
      inReplyTo: null,
      raw: {},
    };
    const contactId = await this.storeInbound(message, !input.live);
    if (!contactId) return { duplicate: true, outbound: [] };
    const transport = input.live ? liveTransport() : captureTransport();
    return (await this.withLease(contactId, () => this.answerWaiting(contactId, transport), 60_000)) ?? { outbound: [] };
  }

  /** Run `fn` holding the person's lease, waiting for it (admin actions: start, restart, menu, follow-up). */
  private async leased<T>(waId: string, fn: () => Promise<T>): Promise<T> {
    const contact = await this.prisma.whatsappContact.findUnique({ where: { waId }, select: { id: true } });
    if (!contact) return fn();
    const out = await this.withLease(contact.id, fn, 60_000);
    if (out === null) throw new Error('This conversation is busy; try again in a moment.');
    return out;
  }

  /**
   * Open a conversation the only way WhatsApp allows: an approved template.
   *
   * Free-form messages need a message FROM the person in the last 24 hours, so
   * every outreach (a new lead from an ad or the website, a follow-up after the
   * window closed) starts here. The template's quick-reply buttons become the
   * pending options, so the lead's first tap routes like any other tap, and that
   * reply is what opens the window for the bot.
   */
  async startConversation(input: {
    waId: string;
    name?: string;
    /** What they enquired about (from the ad or the website form), for the opener. */
    course?: string;
    template: { name: string; language: string; body: string; quickReplies: string[] };
    bodyParams: string[];
    live: boolean;
  }): Promise<TurnResult> {
    return this.leased(input.waId, async () => {
      const agent = await this.resolveAgent();
      const contact = await this.upsertContact(
        { waId: input.waId, profileName: input.name ?? null } as InboundMessage,
        agent.id,
        !input.live,
      );
      if (input.name && !contact.visitor.name) await this.persistFacts(contact.visitorId, { name: input.name });
      if (!this.audienceOf(contact)) await this.persistFacts(contact.visitorId, { audience: 'prospective' });
      if (input.course) await this.persistFacts(contact.visitorId, { courseInterest: input.course });

      let rendered = input.template.body;
      input.bodyParams.forEach((p, i) => (rendered = rendered.split(`{{${i + 1}}}`).join(p)));
      const options: WaOption[] = input.template.quickReplies.map((title) => ({ id: templateButtonId(title), title }));

      const transport = input.live ? liveTransport() : captureTransport();
      const fresh = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contact.id }, include: { visitor: true } });
      const turn = await this.reply(
        fresh,
        [
          {
            kind: 'template',
            name: input.template.name,
            language: input.template.language,
            bodyParams: input.bodyParams,
            body: rendered,
            quickReplies: input.template.quickReplies,
          },
        ],
        'system',
        transport,
        'welcome',
        { followup: false },
      );
      // The quick replies are what they will tap. Set after `reply`, which only records interactive options.
      await this.prisma.whatsappContact.update({
        where: { id: contact.id },
        data: { pendingOptions: options.length ? (options as object[]) : Prisma.DbNull },
      });
      return turn;
    });
  }

  /**
   * Testing: wipe a contact's conversation but keep its open 24h window, then
   * let Tara open with her own first message instead of a template. Only
   * possible while they have written to us in the last 24 hours; a real lead
   * still has to be opened with an approved template.
   */
  async restartConversation(contactId: string, course: string | null): Promise<TurnResult> {
    const contact = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contactId } });
    if (!this.sender.windowOpen(contact.lastInboundAt)) {
      throw new Error('Their 24h window is closed: they must message us first, or be opened with a template.');
    }
    return this.leased(contact.waId, () => this.restartInQueue(contactId, course));
  }

  /** The restart itself; callers must already hold this person's queue. */
  private async restartInQueue(contactId: string, course: string | null): Promise<TurnResult> {
    const contact = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contactId } });
    // A name they gave in the chat beats whatever the CRM holds, so it survives a restart.
    const before = await this.prisma.chatWidgetVisitor.findUnique({ where: { id: contact.visitorId }, select: { name: true, fieldSources: true } });
    const keptName = ((before?.fieldSources ?? {}) as Record<string, string>).name === 'whatsapp' ? before?.name ?? null : null;
    {
      // Their inbound rows stay: the wamid on each is what stops the Mcube poller
      // re-reading an old message as new and answering it a second time.
      await this.prisma.whatsappMessage.deleteMany({ where: { contactId, direction: 'out' } });
      await this.prisma.chatWidgetMessage.deleteMany({ where: { visitorId: contact.visitorId } });
      await this.prisma.chatWidgetVisitor.update({
        where: { id: contact.visitorId },
        data: {
          name: keptName,
          email: null,
          location: null,
          courseInterest: course,
          handoffAt: null,
          custom: {
            ...(course ? { audience: 'prospective', courseInterest: course } : {}),
            ...(keptName ? { firstName: keptName.split(/\s+/)[0] } : {}),
          },
          fieldSources: { phone: 'whatsapp', ...(keptName ? { name: 'whatsapp' } : {}) },
        },
      });
      const fresh = await this.prisma.whatsappContact.update({
        where: { id: contactId },
        data: { stage: 'new', handoffAt: null, handoffReason: null, botPausedUntil: null, pendingOptions: Prisma.DbNull, followupCount: 0, nextFollowupAt: null },
        include: { visitor: true },
      });
      const agent = await this.resolveAgent();
      const known = await this.enrichFromCrm(fresh);
      const transport = known.simulated ? captureTransport() : liveTransport();
      const knownCourse = course ?? known.visitor.courseInterest;
      if (!knownCourse && !known.visitor.name) return this.reply(known, audienceMessages(null), 'system', transport, 'welcome');
      return this.aiTurn(known, agent, transport, openerInstruction('(no reply yet: you are writing first)', knownCourse), null);
    }
  }

  /** The menu for who they are, as a fresh message (hand-back from a counsellor). The 24h window still applies. */
  async sendMenu(contactId: string): Promise<TurnResult> {
    const contact = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contactId }, include: { visitor: true } });
    const transport = contact.simulated ? captureTransport() : liveTransport();
    const audience = this.audienceOf(contact);
    const messages = !audience
      ? audienceMessages(contact.visitor.name ?? contact.profileName)
      : isEnrolled(audience)
        ? studentMenuMessages()
        : welcomeMessages(contact.visitor.name ?? contact.profileName);
    return this.leased(contact.waId, () => this.reply(contact, messages, 'system', transport, 'menu'));
  }

  private async act(
    decision: Decision,
    contact: ContactRow,
    agent: AgentRow,
    transport: TransportContext,
    tapped: WaOption | null,
    text: string | null = null,
  ): Promise<TurnResult> {
    const name = contact.visitor.name ?? contact.profileName;
    switch (decision.type) {
      case 'ignore':
      case 'paused':
        return { decision: decision.type, outbound: [] };

      case 'opt_out':
        await this.prisma.whatsappContact.update({
          where: { id: contact.id },
          data: { optedOutAt: new Date(), nextFollowupAt: null, stage: 'lost' },
        });
        return this.reply(contact, [{ kind: 'text', body: OPT_OUT_TEXT }], 'system', transport, decision.type, { followup: false });

      case 'opt_in':
        await this.prisma.whatsappContact.update({ where: { id: contact.id }, data: { optedOutAt: null, stage: 'engaged' } });
        return this.reply(contact, [{ kind: 'text', body: OPT_IN_TEXT }, ...menuMessages()], 'system', transport, decision.type);

      case 'welcome': {
        const audience = this.audienceOf(contact);
        if (isEnrolled(audience)) return this.reply(contact, studentMenuMessages(), 'system', transport, decision.type);
        // Our template opened the chat: the first real message is a counsellor's hook, written by the AI.
        const opened = await this.prisma.whatsappMessage.count({ where: { contactId: contact.id, direction: 'out', kind: 'template' } });
        if (opened) {
          if (!audience) await this.persistFacts(contact.visitorId, { audience: 'prospective' });
          const fresh = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contact.id }, include: { visitor: true } });
          const reply = tapped?.title ?? text ?? 'hi';
          return this.aiTurn(fresh, agent, transport, openerInstruction(reply, fresh.visitor.courseInterest), null);
        }
        // They wrote first.
        return this.reply(contact, audienceMessages(name), 'system', transport, decision.type);
      }

      case 'course': {
        await this.persistFacts(contact.visitorId, { audience: 'prospective', courseInterest: decision.course });
        const fresh = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contact.id }, include: { visitor: true } });
        return this.aiTurn(fresh, agent, transport, `I'm looking at ${decision.course}.`, tapped);
      }

      case 'menu': {
        if (contact.botPausedUntil) {
          await this.prisma.whatsappContact.update({ where: { id: contact.id }, data: { botPausedUntil: null } });
        }
        // Someone Tara already knows gets next steps built from the conversation, not a canned menu.
        const known = await this.prisma.chatWidgetMessage.count({ where: { visitorId: contact.visitorId, role: 'assistant' } });
        if (known >= 2) {
          const fresh = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contact.id }, include: { visitor: true } });
          return this.aiTurn(
            fresh,
            agent,
            transport,
            '[They asked for the menu, or to keep exploring. From everything you know about them in this chat, offer the 2 or 3 most useful next steps for THEM as buttons, with one short line. Not a generic menu.]',
            null,
          );
        }
        return this.reply(
          contact,
          !this.audienceOf(contact)
            ? audienceMessages(name)
            : isEnrolled(this.audienceOf(contact))
              ? studentMenuMessages()
              : menuMessages(),
          'system',
          transport,
          decision.type,
        );
      }

      case 'audience':
        await this.persistFacts(contact.visitorId, { audience: decision.audience });
        if (decision.audience === 'student') return this.reply(contact, studentMenuMessages(), 'system', transport, decision.type);
        if (decision.audience === 'other') return this.reply(contact, [{ kind: 'text', body: OTHER_TEXT }], 'system', transport, decision.type);
        // Already introduced: straight to a counsellor's first question, not a menu.
        return this.reply(
          contact,
          composeInteractive('What are you hoping to study?', [
            { id: 'course:Engineering', title: 'Engineering' },
            { id: 'course:Management', title: 'Management' },
            { id: 'course:Something else', title: 'Something else' },
          ]),
          'system',
          transport,
          decision.type,
        );

      case 'dept_handoff':
        await this.recordHandoff(contact, `dept:${decision.dept}`, null);
        return this.reply(contact, deptHandoffMessages(decision.dept), 'handoff', transport, decision.type, { followup: false });

      case 'dept_pass': {
        const key = contact.handoffReason?.startsWith('dept:') ? contact.handoffReason.slice(5) : 'student_affairs';
        await this.recordHandoff(contact, `dept:${key}`, 'request');
        return this.reply(contact, deptPassedMessages(key), 'handoff', transport, decision.type, { followup: false });
      }

      case 'style_note':
        await this.saveStyleNote(decision.note, decision.note, contact.waId);
        return this.reply(
          contact,
          [{ kind: 'text', body: `Got it. From my next reply: ${decision.note.replace(/\s+/g, ' ').slice(0, 200)}` }],
          'system',
          transport,
          decision.type,
          { followup: false },
        );

      case 'more':
        return this.reply(contact, composeInteractive('Or one of these:', tapped?.rest?.length ? tapped.rest : this.pendingOf(contact)), 'system', transport, decision.type);

      case 'restart':
        return this.restartInQueue(contact.id, null);

      case 'unclear':
        return this.reply(
          contact,
          unclearMessages(this.pendingOf(contact), await this.unclearRun(contact.id)),
          'system',
          transport,
          decision.type,
        );

      case 'snooze':
        return this.reply(contact, [{ kind: 'text', body: SNOOZE_TEXT }], 'system', transport, decision.type);

      case 'apply':
        await this.setStage(contact.id, 'qualified');
        return this.reply(contact, applyMessages(), 'system', transport, decision.type);

      case 'handoff_start':
        if (this.bookedSlot(contact)) {
          return this.reply(
            contact,
            [{ kind: 'text', body: `Your call is already booked for *${this.bookedSlot(contact)!.toLowerCase()}*. The counsellor can cover this too.` }],
            'handoff',
            transport,
            decision.type,
            { followup: false },
          );
        }
        await this.recordHandoff(contact, decision.reason, null);
        return { ...(await this.reply(contact, handoffStartMessages(decision.reason), 'handoff', transport, decision.type, { followup: false })), handoff: decision.reason };

      case 'handoff_call':
        if (!contact.handoffReason) await this.recordHandoff(contact, 'callback', null);
        return this.reply(contact, slotMessages(), 'handoff', transport, decision.type, { followup: false });

      case 'handoff_slot':
        await this.recordHandoff(contact, contact.handoffReason ?? 'callback', decision.slot);
        return this.reply(contact, slotConfirmMessages(decision.slot, contact.waId), 'handoff', transport, decision.type, { followup: false });

      case 'handoff_chat':
        await this.recordHandoff(contact, contact.handoffReason ?? 'asked_for_human', 'chat');
        await this.prisma.whatsappContact.update({
          where: { id: contact.id },
          data: { botPausedUntil: new Date(Date.now() + CHAT_HANDOFF_PAUSE) },
        });
        return this.reply(contact, chatHandoffMessages(), 'handoff', transport, decision.type, { followup: false });

      case 'ai':
        return this.aiTurn(contact, agent, transport, decision.message, tapped);
    }
  }

  // ── The AI turn ──────────────────────────────────────────────────────────

  private async aiTurn(
    contact: ContactRow,
    agent: AgentRow,
    transport: TransportContext,
    message: string,
    tapped: WaOption | null,
    followup?: { instruction: string; ruleId: string; step: number },
  ): Promise<TurnResult> {
    const pack = await this.prisma.chatAgentKnowledgePack.findUnique({
      where: { id: agent.activePackId ?? '' },
      select: { content: true, version: true },
    });
    if (!pack) throw new Error(`WhatsApp agent ${agent.id} has no trained knowledge pack.`);

    const rows = await this.prisma.chatWidgetMessage.findMany({
      where: { visitorId: contact.visitorId },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY + 1,
      select: { role: true, content: true },
    });
    const history = rows.reverse();
    // The newest row is this turn's own message (not for a follow-up); it goes last, with the facts.
    if (!followup && history[history.length - 1]?.role === 'user') history.pop();
    while (history.length && history[0].role !== 'user') history.shift();

    const v = contact.visitor;
    const known = formatKnownFacts({
      name: v.name,
      phone: v.phone,
      email: v.email,
      location: v.location,
      courseInterest: v.courseInterest,
      custom: v.custom,
    });
    const context =
      (tapped ? `\n[They tapped the option "${tapped.title}".]` : '') +
      // Coaching is explicit only ("feedback: ...", caught by the router). Letting the model
      // guess which messages were feedback turned ordinary taps into style rules.
      '';
    const composed = `${known}${context}\n\n---\n\n${followup ? followup.instruction : message}`;

    const messages: Anthropic.MessageParam[] = [
      ...this.merged(history),
      { role: 'user', content: composed },
    ];
    // Consecutive user turns (a follow-up after their message) are merged above; the API wants alternation.
    if (messages.length >= 2 && messages[messages.length - 2].role === 'user') {
      const prev = messages.splice(messages.length - 2, 1)[0];
      messages[messages.length - 1] = { role: 'user', content: `${prev.content as string}\n\n${composed}` };
    }

    const started = Date.now();
    const result = await this.anthropic.chat(
      {
        model: agent.model,
        system: buildWhatsappSystem(agent, pack.content, await this.activeStyleNotes()),
        messages,
        maxTokens: Math.min(agent.maxTokens, 900),
        effort: resolveEffort(agent.model, agent.effort),
      },
      {
        feature: 'whatsapp_bot',
        actorType: 'visitor',
        trigger: 'automatic',
        visitorId: contact.visitorId,
        entityType: 'chat_agent',
        entityId: agent.id,
        endpoint: followup ? 'whatsapp.followup' : 'whatsapp.turn',
      },
    );

    const reply = parseWhatsappReply(result.text);
    for (const claim of reply.claimsRemoved) this.logger.warn(`${contact.waId}: cut an unsupported claim: "${claim}"`);
    await this.persistFacts(contact.visitorId, reply.facts);
    if (reply.styleNote) {
      await this.saveStyleNote(reply.styleNote, message, contact.waId);
      return this.reply(contact, [{ kind: 'text', body: reply.text || 'Got it, changing that from my next reply.' }], 'system', transport, 'style_note', {
        followup: false,
      });
    }

    let outbound: OutboundMessage[] = [];
    for (const m of reply.media) outbound.push({ kind: 'image', url: m.url, caption: m.caption });
    const admissionsHandoff = reply.handoff === 'visit' || reply.handoff === 'callback' || reply.handoff === 'fees';
    if (
      reply.handoff === 'department' ||
      (reply.handoff === 'complaint' && reply.dept) ||
      (reply.handoff && !admissionsHandoff && isEnrolled(this.audienceOf(contact)))
    ) {
      const key = reply.dept ?? 'student_affairs';
      await this.recordHandoff(contact, `dept:${key}`, null);
      outbound.push(...deptHandoffMessages(key, reply.text));
    } else if (reply.handoff && this.bookedSlot(contact)) {
      outbound.push({
        kind: 'text',
        body: `${reply.text ? `${reply.text}\n\n` : ''}Your call is already booked for *${this.bookedSlot(contact)!.toLowerCase()}*; the counsellor will have your details.`,
      });
    } else if (reply.handoff) {
      await this.recordHandoff(contact, reply.handoff, null);
      const opener = handoffStartMessages(reply.handoff);
      // The model's own line leads, the scripted choice follows as one message.
      const lead = reply.text ? `${reply.text}\n\n` : '';
      outbound.push(...composeInteractive(`${lead}How would you like to reach them?`, optionsOf(opener)));
    } else {
      const recent = await this.prisma.whatsappMessage.findMany({
        where: { contactId: contact.id, direction: 'out', kind: { not: 'template' } },
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: { kind: true },
      });
      // The owner: "lots of clickables coming at one time". After two replies with buttons, the third has none.
      const buttonTired = recent.length === 2 && recent.every((m) => m.kind === 'buttons' || m.kind === 'list');
      outbound.push(...composeInteractive(reply.text || 'Pick one:', buttonTired ? [] : aiOptions(reply.options)));
    }
    if (!outbound.length) outbound = [{ kind: 'text', body: reply.text || "Let me get a counsellor to answer that properly." }];
    // A document comes after the line that introduces it (and before any buttons would read oddly, so after all).
    for (const d of reply.documents) outbound.push({ kind: 'document', url: d.url, filename: d.filename });

    const turn = await this.reply(
      contact,
      outbound,
      followup ? 'followup' : reply.handoff ? 'handoff' : 'bot',
      transport,
      'ai',
      {
        tag: followup ? { ruleId: followup.ruleId, step: followup.step } : undefined,
        usage: { model: agent.model, ...result.usage, latencyMs: Date.now() - started, packVersion: pack.version },
      },
    );
    if (!reply.handoff && Object.keys(reply.facts).some((k) => k === 'courseInterest')) await this.setStage(contact.id, 'qualified');
    return { ...turn, handoff: reply.handoff };
  }

  /** Stored transcript rows (user/assistant) as API messages, consecutive same-role rows merged. */
  private merged(history: Array<{ role: string; content: string }>): Anthropic.MessageParam[] {
    const out: Anthropic.MessageParam[] = [];
    for (const row of history) {
      const role = row.role === 'assistant' ? 'assistant' : 'user';
      const last = out[out.length - 1];
      if (last && last.role === role) last.content = `${last.content as string}\n\n${row.content}`;
      else out.push({ role, content: row.content });
    }
    return out;
  }

  // ── Sending a turn ───────────────────────────────────────────────────────

  private async reply(
    contact: ContactRow,
    outbound: OutboundMessage[],
    source: OutboundSource,
    transport: TransportContext,
    decision: Decision['type'],
    opts: {
      /** Legacy flag, ignored: the follow-up engine decides. */
      followup?: boolean;
      /** Set on a follow-up: which rule and step sent it. */
      tag?: { ruleId: string; step: number };
      usage?: { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; latencyMs: number; packVersion: number };
    } = {},
  ): Promise<TurnResult> {
    const u = opts.usage;
    const transcript = await this.prisma.chatWidgetMessage.create({
      data: {
        visitorId: contact.visitorId,
        role: 'assistant',
        content: transcriptOf(outbound),
        ...(u
          ? {
              model: u.model,
              inputTokens: u.inputTokens,
              outputTokens: u.outputTokens,
              cacheReadTokens: u.cacheReadTokens,
              cacheWriteTokens: u.cacheWriteTokens,
              latencyMs: u.latencyMs,
              packVersion: u.packVersion,
            }
          : {}),
      },
      select: { id: true },
    });

    const fresh = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contact.id }, select: { lastInboundAt: true } });
    // The options are saved BEFORE the send: if the process dies between the two,
    // their tap must still resolve to what their phone shows.
    const offeredFirst = optionsOf(outbound);
    if (offeredFirst.length) {
      await this.prisma.whatsappContact.update({ where: { id: contact.id }, data: { pendingOptions: offeredFirst as object[] } });
    }
    const result = await this.sender.deliver(
      { id: contact.id, waId: contact.waId, lastInboundAt: fresh.lastInboundAt },
      outbound,
      source,
      transport,
      transcript.id,
    );

    const offered = optionsOf(outbound);
    await this.prisma.whatsappContact.update({
      where: { id: contact.id },
      data: {
        ...(offered.length ? { pendingOptions: offered as object[] } : { pendingOptions: Prisma.DbNull }),
        // A conversational reply restarts the follow-up ladder: its delays count from now.
        ...(!opts.tag && result.sent && source !== 'followup' ? { followupCount: 0, followupAnchorAt: new Date(), nextFollowupAt: null } : {}),
      },
    });
    if (opts.tag && result.messageIds.length) {
      await this.prisma.whatsappMessage.updateMany({
        where: { id: { in: result.messageIds } },
        data: { followupRuleId: opts.tag.ruleId, followupStep: opts.tag.step },
      });
    }
    if (!opts.tag && result.sent) {
      // Score first, then plan: a score-gated rule (the hot-lead ladder) would
      // otherwise be chosen from the score this turn has just changed.
      await this.scores.rescore(contact.id);
      await this.followups?.plan?.(contact.id);
    }
    return { decision, outbound: transport.captured.slice() };
  }

  // ── Follow-ups (the engine calls these) ─────────────────────────────────

  /** An AI follow-up toward a rule step's goal. The engine holds the lease. */
  async sendFollowupAi(contactId: string, instruction: string, tag: { ruleId: string; step: number }): Promise<TurnResult> {
    const contact = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contactId }, include: { visitor: true } });
    const transport = contact.simulated ? captureTransport() : liveTransport();
    return this.aiTurn(contact, await this.resolveAgent(), transport, '', null, { instruction, ...tag });
  }

  /** A template follow-up (the only kind allowed once their 24h window has closed). */
  async sendFollowupTemplate(
    contactId: string,
    template: { name: string; language: string; body: string; params: string[]; quickReplies: string[] },
    tag: { ruleId: string; step: number },
  ): Promise<TurnResult> {
    const contact = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contactId }, include: { visitor: true } });
    const transport = contact.simulated ? captureTransport() : liveTransport();
    let body = template.body;
    template.params.forEach((p, i) => (body = body.split(`{{${i + 1}}}`).join(p)));
    const turn = await this.reply(
      contact,
      [{ kind: 'template', name: template.name, language: template.language, bodyParams: template.params, body, quickReplies: template.quickReplies }],
      'followup',
      transport,
      'ai',
      { tag },
    );
    const options: WaOption[] = template.quickReplies.map((title) => ({ id: templateButtonId(title), title }));
    await this.prisma.whatsappContact.update({ where: { id: contactId }, data: { pendingOptions: options.length ? (options as object[]) : Prisma.DbNull } });
    return turn;
  }

  /** Values a template's {{n}} tokens resolve to for this person. */
  async templateTokens(contactId: string): Promise<Record<string, string>> {
    const c = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contactId }, include: { visitor: true } });
    const custom = (c.visitor.custom ?? {}) as Record<string, unknown>;
    const first = (c.visitor.name ?? '').trim().split(/\s+/)[0];
    return {
      first_name: first && looksLikeName(first) ? first : 'there',
      course: c.visitor.courseInterest ?? 'your course',
      city: c.visitor.location ?? '',
      counsellor: typeof custom.counsellor === 'string' ? custom.counsellor : 'your counsellor',
    };
  }

  /** The stage the follow-up rules match on: the CRM status when known, else the bot's own. */
  stageOf(contact: { stage: string; visitor: { custom: Prisma.JsonValue } }): string {
    const custom = (contact.visitor.custom ?? {}) as Record<string, unknown>;
    return typeof custom.crmStatus === 'string' && custom.crmStatus ? custom.crmStatus : `bot:${contact.stage}`;
  }

  /** Re-read the CRM status (it changes outside this app). Returns true when it changed. */
  async refreshCrmStatus(contactId: string): Promise<boolean> {
    const c = await this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contactId }, include: { visitor: true } });
    await this.prisma.whatsappContact.update({ where: { id: contactId }, data: { crmCheckedAt: new Date() } });
    if (c.simulated || !this.crm.isConfigured()) return false;
    const lead = await this.crm.findByWaId(c.waId);
    const custom = (c.visitor.custom ?? {}) as Record<string, unknown>;
    if (!lead) return false;
    const application = await this.applicationFacts(lead.leadId);
    const next = { ...custom, crmLeadId: lead.leadId, crmStatus: lead.status, ...(lead.counsellor ? { counsellor: lead.counsellor } : {}), ...application };
    const changed = Object.entries(next).some(([k, v]) => custom[k] !== v);
    if (!changed) return false;
    await this.prisma.chatWidgetVisitor.update({ where: { id: c.visitorId }, data: { custom: next as object } });
    await this.scores.rescore(contactId);
    // Only a stage change reshuffles the follow-up ladder; fee news alone does not.
    return lead.status !== custom.crmStatus;
  }

  /**
   * Their application and its fee, as KNOWN-block facts.
   *
   * The fee figure is the CRM's own for THIS application: it is the only
   * application-fee amount the bot may ever say. Nothing here is invented, and
   * a missing figure simply means the counsellor confirms it.
   */
  private async applicationFacts(leadId: string): Promise<Record<string, string>> {
    const app = await this.crm.applicationForLead(leadId);
    if (!app) return {};
    const money = (n: number) => `Rs ${n.toLocaleString('en-IN')}`;
    const facts: Record<string, string> = {};
    if (app.status) facts.applicationStatus = app.status;
    if (typeof app.completionPercent === 'number') facts.applicationProgress = `${app.completionPercent}% of the form filled`;
    if (app.programme) facts.applicationProgramme = app.programme;
    if (app.feePayable !== null) {
      facts.applicationFee =
        app.feeDiscountPercent && app.feeAmount !== null && app.feeDiscountPercent > 0
          ? `${money(app.feePayable)} (${app.feeDiscountPercent}% off ${money(app.feeAmount)})`
          : money(app.feePayable);
    }
    facts.applicationFeeStatus =
      app.feeStatus === 'completed'
        ? 'paid'
        : app.feeStatus
          ? `started but ${app.feeStatus}`
          : 'not paid yet';
    return facts;
  }

  async lastOutboundState(contactId: string): Promise<{ read: boolean; failed: boolean } | null> {
    const last = await this.prisma.whatsappMessage.findFirst({
      where: { contactId, direction: 'out' },
      orderBy: { createdAt: 'desc' },
      select: { readAt: true, status: true },
    });
    return last ? { read: !!last.readAt, failed: last.status === 'failed' } : null;
  }

  windowOpen(lastInboundAt: Date | null): boolean {
    return this.sender.windowOpen(lastInboundAt);
  }

  private async lastOutboundRead(contactId: string): Promise<boolean> {
    const last = await this.prisma.whatsappMessage.findFirst({
      where: { contactId, direction: 'out' },
      orderBy: { createdAt: 'desc' },
      select: { readAt: true },
    });
    return !!last?.readAt;
  }

  // ── State ────────────────────────────────────────────────────────────────

  private async resolveAgent(): Promise<AgentRow> {
    const byId = process.env.WHATSAPP_AGENT_ID?.trim();
    const agent = byId
      ? await this.prisma.chatAgent.findUnique({ where: { id: byId }, select: AGENT_SELECT })
      : await this.prisma.chatAgent.findFirst({
          where: { name: { contains: 'WhatsApp', mode: 'insensitive' }, activePackId: { not: null } },
          orderBy: { updatedAt: 'desc' },
          select: AGENT_SELECT,
        });
    if (!agent) throw new Error('No WhatsApp bot: set WHATSAPP_AGENT_ID or seed a trained bot with "WhatsApp" in its name.');
    return agent;
  }

  private async upsertContact(msg: InboundMessage, agentId: string, simulated: boolean): Promise<ContactRow> {
    const existing = await this.prisma.whatsappContact.findUnique({ where: { waId: msg.waId }, include: { visitor: true } });
    if (existing) {
      const nameChanged = !!msg.profileName && msg.profileName !== existing.profileName;
      if (nameChanged || existing.simulated !== simulated) {
        return this.prisma.whatsappContact.update({
          where: { id: existing.id },
          data: { ...(nameChanged ? { profileName: msg.profileName } : {}), simulated },
          include: { visitor: true },
        });
      }
      return existing;
    }
    // Their number IS the lead: the transcript row starts with it, no asking.
    const visitor = await this.prisma.chatWidgetVisitor.create({
      data: {
        agentId,
        channel: 'whatsapp',
        phone: `+${msg.waId}`,
        fieldSources: { phone: 'whatsapp' },
        custom: msg.profileName ? { whatsappName: msg.profileName } : {},
        deviceType: 'whatsapp',
      },
      select: { id: true },
    });
    try {
      return await this.prisma.whatsappContact.create({
        data: { waId: msg.waId, profileName: msg.profileName, agentId, visitorId: visitor.id, simulated },
        include: { visitor: true },
      });
    } catch (err) {
      // Two first messages raced; the other one created the contact.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        await this.prisma.chatWidgetVisitor.delete({ where: { id: visitor.id } });
        return this.prisma.whatsappContact.findUniqueOrThrow({ where: { waId: msg.waId }, include: { visitor: true } });
      }
      throw err;
    }
  }

  /**
   * What the CRM already knows about this number, copied onto the conversation
   * once: their name, what they are interested in, their city, where they are in
   * admission and who their counsellor is. The KNOWN block carries it to Tara, so
   * she greets them by name and never asks for what the CRM already has.
   */
  private async enrichFromCrm(contact: ContactRow): Promise<ContactRow> {
    const custom = (contact.visitor.custom ?? {}) as Record<string, unknown>;
    if (custom.crmChecked || contact.simulated || !this.crm.isConfigured()) return contact;
    const lead = await this.crm.findByWaId(contact.waId);
    const facts: ExtractedFacts = {};
    if (lead?.name && looksLikeName(lead.name) && !contact.visitor.name) facts.name = lead.name;
    if (lead?.course && !contact.visitor.courseInterest) facts.courseInterest = lead.course;
    if (lead?.city && !contact.visitor.location) facts.city = lead.city;
    if (Object.keys(facts).length) await this.persistFacts(contact.visitorId, facts);
    const row = await this.prisma.chatWidgetVisitor.findUniqueOrThrow({ where: { id: contact.visitorId }, select: { custom: true, fieldSources: true } });
    // Facts copied from the CRM are marked as such: a name they type in the chat outranks them.
    const sources = { ...((row.fieldSources ?? {}) as Record<string, string>) };
    for (const key of Object.keys(facts)) sources[key] = 'crm';
    if (Object.keys(facts).length) {
      await this.prisma.chatWidgetVisitor.update({ where: { id: contact.visitorId }, data: { fieldSources: sources as object } });
    }
    const next = {
      ...((row.custom ?? {}) as Record<string, unknown>),
      crmChecked: true,
      ...(lead
        ? {
            crmLeadId: lead.leadId,
            crmStatus: lead.status,
            ...(lead.counsellor ? { counsellor: lead.counsellor } : {}),
            // Already admitted = a student; anything earlier = still joining.
            ...(!custom.audience ? { audience: /admit|enrol|confirm|joined/i.test(lead.status ?? '') ? 'student' : 'prospective' } : {}),
            ...(await this.applicationFacts(lead.leadId)),
          }
        : {}),
    };
    await this.prisma.chatWidgetVisitor.update({ where: { id: contact.visitorId }, data: { custom: next as object } });
    if (lead) this.logger.log(`${contact.waId} is CRM lead ${lead.leadId} (${lead.status}).`);
    return this.prisma.whatsappContact.findUniqueOrThrow({ where: { id: contact.id }, include: { visitor: true } });
  }

  /** The call-back slot they already picked, if any. */
  private bookedSlot(contact: { stage: string; visitor: { custom: Prisma.JsonValue } }): string | null {
    const custom = (contact.visitor.custom ?? {}) as Record<string, unknown>;
    return contact.stage === 'counsellor' && typeof custom.preferredCallTime === 'string' ? custom.preferredCallTime : null;
  }

  /**
   * Our last message offered to pass their request to an office. A plain "ok"
   * after that is a yes, not a new topic.
   */
  private async awaitingDeptPass(contactId: string): Promise<boolean> {
    const last = await this.prisma.whatsappMessage.findFirst({
      where: { contactId, direction: 'out' },
      orderBy: { createdAt: 'desc' },
      select: { payload: true },
    });
    const options = ((last?.payload as { options?: Array<{ id?: string }> } | null)?.options ?? []) as Array<{ id?: string }>;
    return options.some((o) => o.id === 'dept:pass');
  }

  /** How many of their most recent messages in a row we could not read. */
  private async unclearRun(contactId: string): Promise<number> {
    const recent = await this.prisma.whatsappMessage.findMany({
      where: { contactId, direction: 'out', source: { in: ['bot', 'system'] } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { payload: true, body: true },
    });
    let run = 0;
    for (const m of recent) {
      if (!/didn't get that|not sure what you mean|not following/i.test(m.body ?? '')) break;
      run++;
    }
    return run;
  }

  /** True when the KNOWN block carries this fact, so the bot may say it. */
  private knows(contact: { visitor: { custom: Prisma.JsonValue } }, key: string): boolean {
    const custom = (contact.visitor.custom ?? {}) as Record<string, unknown>;
    return typeof custom[key] === 'string' && !!custom[key];
  }

  private audienceOf(contact: { visitor: { custom: Prisma.JsonValue } }): string | null {
    const custom = (contact.visitor.custom ?? {}) as Record<string, unknown>;
    return typeof custom.audience === 'string' ? custom.audience : null;
  }

  private isCoach(waId: string): boolean {
    return (process.env.WHATSAPP_COACH_NUMBERS ?? '')
      .split(',')
      .map((n) => n.replace(/\D/g, ''))
      .includes(waId);
  }

  private async activeStyleNotes(): Promise<string[]> {
    const rows = await this.prisma.whatsappStyleNote.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      take: 40,
      select: { note: true },
    });
    return rows.map((r) => r.note);
  }

  private async saveStyleNote(note: string, original: string, fromWaId: string) {
    await this.prisma.whatsappStyleNote.create({ data: { note, original, fromWaId } });
    this.logger.log(`[coach ${fromWaId}] STYLE NOTE saved: ${JSON.stringify(note)}`);
  }

  private pendingOf(contact: { pendingOptions: Prisma.JsonValue }): WaOption[] {
    const raw = contact.pendingOptions;
    return Array.isArray(raw) ? (raw as unknown as WaOption[]).filter((o) => o && typeof o.id === 'string') : [];
  }

  private setStage(contactId: string, stage: string) {
    return this.prisma.whatsappContact.update({ where: { id: contactId }, data: { stage } });
  }

  /**
   * A counsellor is needed. Recorded on the contact and the transcript, and
   * announced to the CRM when `CRM_HANDOFF_WEBHOOK_URL` is set, so the lead's
   * counsellor gets a task instead of the person waiting on nobody.
   */
  private async recordHandoff(contact: ContactRow, reason: HandoffReason | string, detail: string | null) {
    const now = new Date();
    await this.prisma.whatsappContact.update({
      where: { id: contact.id },
      data: { handoffAt: now, handoffReason: reason, stage: detail ? 'counsellor' : contact.stage, nextFollowupAt: null },
    });
    await this.prisma.chatWidgetVisitor.update({ where: { id: contact.visitorId }, data: { handoffAt: now } });
    if (detail && detail !== 'chat' && detail !== 'request') await this.persistFacts(contact.visitorId, { preferredCallTime: detail });

    const url = process.env.CRM_HANDOFF_WEBHOOK_URL?.trim();
    if (!url || contact.simulated || !detail) return;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': process.env.CRM_HANDOFF_WEBHOOK_SECRET ?? '' },
        body: JSON.stringify({
          event: 'whatsapp.handoff',
          waId: contact.waId,
          name: contact.visitor.name ?? contact.profileName,
          reason,
          department: reason.startsWith('dept:') ? reason.slice(5) : 'admissions',
          question: (
            await this.prisma.chatWidgetMessage.findFirst({
              where: { visitorId: contact.visitorId, role: 'user' },
              orderBy: { createdAt: 'desc' },
              select: { content: true },
            })
          )?.content,
          mode: detail === 'chat' ? 'chat' : detail === 'request' ? 'request' : 'callback',
          slot: detail === 'chat' ? null : detail,
          courseInterest: contact.visitor.courseInterest,
          at: now.toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.warn(`CRM handoff notice for ${contact.waId} failed: ${(err as Error)?.message}`);
    }
  }

  /** Same rules as the web widget: whitelisted keys, a name must look like one, never overwrite with blank. */
  private async persistFacts(visitorId: string, learned: ExtractedFacts) {
    const entries = Object.entries(learned).filter(([, v]) => v && v.trim());
    if (!entries.length) return;
    const row = await this.prisma.chatWidgetVisitor.findUnique({ where: { id: visitorId }, select: { custom: true, fieldSources: true } });
    if (!row) return;
    const custom = { ...((row.custom ?? {}) as Record<string, unknown>) };
    const sources = { ...((row.fieldSources ?? {}) as Record<string, string>) };
    const data: Record<string, unknown> = {};
    for (const [key, raw] of entries) {
      const value = raw!.trim();
      if (key === 'mobile') continue; // their WhatsApp number is the number
      if (key === 'name') {
        if (!looksLikeName(value)) continue;
        data.name = value;
        custom.firstName = value.split(/\s+/)[0];
      } else if (key === 'email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) continue;
        data.email = value.toLowerCase();
      } else if (key === 'courseInterest') {
        data.courseInterest = value;
        custom.courseInterest = value;
      } else if (key === 'city') {
        data.location = value;
        custom.city = value;
      } else custom[key] = value;
      sources[key] = 'whatsapp';
    }
    await this.prisma.chatWidgetVisitor.update({
      where: { id: visitorId },
      data: { ...data, custom: custom as object, fieldSources: sources as object },
    });
  }
}

const AGENT_SELECT = {
  id: true,
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
  model: true,
  effort: true,
  maxTokens: true,
  activePackId: true,
} as const;

type AgentRow = Prisma.ChatAgentGetPayload<{ select: typeof AGENT_SELECT }>;

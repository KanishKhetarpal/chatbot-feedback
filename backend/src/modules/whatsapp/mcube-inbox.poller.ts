import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { InboundMessage, StatusUpdate } from './mcube-payload';
import { toWaId } from './mcube-payload';
import { McubeClient } from './mcube.client';
import { WhatsappBotService } from './whatsapp-bot.service';
import { WhatsappSenderService } from './whatsapp-sender.service';

/**
 * Reading the inbox from Mcube instead of waiting for its webhook.
 *
 * Mcube posts to ONE webhook per account, and that one belongs to the CRM
 * (Converse). Until the CRM forwards to this bot (or Mcube adds a second hook),
 * this poller is how the bot hears replies: `GET /api/wpbox/getConversations?phone=`
 * returns that person's chat with its messages embedded (newest first),
 * including `is_message_by_contact`, the wamid, and `delivered_at` / `read_at`
 * for what we sent. That is everything the webhook would have told us.
 *
 * `WHATSAPP_INBOUND_SOURCE=poll` turns it on. Only numbers on the allowlist are
 * read, only messages newer than the moment polling started are answered (so a
 * restart never replies to history), and the wamid unique index makes a message
 * seen twice a no-op. Receipts are applied to any of our own messages it finds.
 *
 * Which numbers: every allowlisted one, plus (when the allowlist is `*`) every
 * live contact we messaged or heard from in the last 48 hours. Without `?phone`
 * Mcube returns only three chats, so each number is asked for by name.
 *
 * Caveats, written down because they matter at scale: a 5 second delay and one
 * request per active number per tick. It is a bridge for testing and a pilot,
 * not the production path (see docs/whatsapp-phase-2.md, section 5).
 */
@Injectable()
export class McubeInboxPoller implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('McubeInboxPoller');
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private since = new Date();
  private warnedAiBot = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mcube: McubeClient,
    private readonly bot: WhatsappBotService,
    private readonly sender: WhatsappSenderService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.WHATSAPP_INBOUND_SOURCE !== 'poll' || !this.mcube.isConfigured()) return;
    // Look back a little: a message sent while the server restarted must still be answered.
    // Anything already stored is a no-op (wamid unique), so this never replies twice.
    this.since = new Date(Date.now() - 5 * 60 * 1000);
    const every = Math.max(3, Number(process.env.WHATSAPP_POLL_SECONDS ?? 5)) * 1000;
    this.timer = setInterval(() => void this.tick(), every);
    this.logger.log(`Polling Mcube conversations every ${every / 1000}s for allowlisted numbers.`);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async numbersToWatch(): Promise<string[]> {
    const raw = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '').trim();
    const listed = raw === '*' ? [] : raw.split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean);
    if (raw !== '*') return listed;
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const active = await this.prisma.whatsappContact.findMany({
      where: { simulated: false, OR: [{ lastOutboundAt: { gte: since } }, { lastInboundAt: { gte: since } }] },
      select: { waId: true },
      take: 200,
    });
    return active.map((c) => c.waId);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const conversations: any[] = [];
      for (const phone of await this.numbersToWatch()) {
        conversations.push(...(await this.mcube.getConversations(phone)));
      }
      const inbound: InboundMessage[] = [];
      const statuses: StatusUpdate[] = [];

      for (const c of conversations) {
        const waId = toWaId(c?.phone);
        if (!waId || !this.sender.isAllowed(waId)) continue;
        if (Number(c?.enabled_ai_bot) === 1 && !this.warnedAiBot.has(waId)) {
          this.warnedAiBot.add(waId);
          this.logger.warn(`Mcube's own AI bot is ON for ${waId}: it may answer alongside this bot. Turn it off for this contact in Mcube.`);
        }
        for (const m of (c?.messages ?? []) as any[]) {
          const created = parseUtc(m?.created_at);
          if (Number(m?.is_message_by_contact) === 1) {
            if (!created || created < this.since) continue;
            inbound.push({
              waId,
              profileName: c?.name && c.name !== c.phone ? String(c.name) : null,
              providerMessageId: m?.fb_message_id ? String(m.fb_message_id) : `mcube.${m?.id}`,
              timestamp: created,
              kind: 'text',
              text: m?.value != null ? String(m.value) : null,
              optionId: null,
              inReplyTo: null,
              raw: { mcubeMessageId: m?.id, messageType: m?.message_type },
            });
          } else if (m?.fb_message_id) {
            const delivered = parseIst(m?.delivered_at);
            const read = parseIst(m?.read_at);
            if (delivered) statuses.push({ providerMessageId: String(m.fb_message_id), status: 'delivered', timestamp: delivered, error: null });
            if (read) statuses.push({ providerMessageId: String(m.fb_message_id), status: 'read', timestamp: read, error: null });
            if (m?.error) statuses.push({ providerMessageId: String(m.fb_message_id), status: 'failed', timestamp: new Date(), error: String(m.error) });
          }
        }
      }

      inbound.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      if (inbound.length || statuses.length) await this.bot.ingestParsed(inbound, statuses);
    } catch (err) {
      this.logger.warn(`Poll failed: ${(err as Error)?.message}`);
    } finally {
      this.running = false;
    }
  }
}

/** `2026-09-21T09:21:52.000000Z` */
function parseUtc(raw: unknown): Date | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Mcube's `delivered_at` / `read_at` are IST wall-clock strings: `2026-09-16 03:11:33`. */
function parseIst(raw: unknown): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const d = new Date(`${raw.replace(' ', 'T')}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

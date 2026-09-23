import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { McubeClient, renderOptionsAsText } from './mcube.client';
import type { StatusUpdate } from './mcube-payload';
import type { DeliveryResult, OutboundMessage, OutboundSource } from './whatsapp.types';

/** queued 1 < sent 2 < delivered 3 < read 4 < failed 5. A receipt only ever moves a message up. */
export const STATUS_RANK: Record<string, number> = { queued: 1, sent: 2, delivered: 3, read: 4, failed: 5 };

/**
 * Where a turn's messages go.
 *
 *  - `live`: to the phone, through Mcube.
 *  - `capture`: nowhere. The simulator and tests read them from `captured`;
 *    they are stored like real ones (provider `simulator`) so analytics and
 *    the transcript can be exercised without sending anything.
 */
export interface TransportContext {
  mode: 'live' | 'capture';
  captured: Array<OutboundMessage & { messageId: string }>;
}

export const liveTransport = (): TransportContext => ({ mode: 'live', captured: [] });
export const captureTransport = (): TransportContext => ({ mode: 'capture', captured: [] });

/**
 * Every outbound WhatsApp goes through here, in a fixed order:
 *
 *   1. the 24h window (free-form only; templates may go any time)
 *   2. the allowlist
 *   3. a `queued` row written BEFORE the network call, so a crash leaves evidence
 *   4. the send, then `sent` with the wamid, or `failed` with Mcube's own words
 *
 * Receipts then walk the row up the ladder (delivered, read) and never down.
 */
@Injectable()
export class WhatsappSenderService {
  private readonly logger = new Logger(WhatsappSenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mcube: McubeClient,
  ) {}

  /**
   * `WHATSAPP_ALLOWED_NUMBERS`: comma-separated digits, or `*` for everyone.
   * Unlike the CRM, EMPTY MEANS NOBODY: this app talks to real students on the
   * university's number, so opening it to everyone has to be written down.
   */
  isAllowed(waId: string): boolean {
    const raw = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '').trim();
    if (raw === '*') return true;
    const allowed = raw.split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean);
    return allowed.includes(waId.replace(/\D/g, ''));
  }

  windowOpen(lastInboundAt: Date | null): boolean {
    return !!lastInboundAt && Date.now() - lastInboundAt.getTime() < 24 * 60 * 60 * 1000;
  }

  async deliver(
    contact: { id: string; waId: string; lastInboundAt: Date | null },
    messages: OutboundMessage[],
    source: OutboundSource,
    transport: TransportContext,
    chatMessageId: string | null,
  ): Promise<{ sent: number; failed: number; messageIds: string[] }> {
    let sent = 0;
    let failed = 0;
    const messageIds: string[] = [];

    for (const message of messages) {
      const row = await this.prisma.whatsappMessage.create({
        data: {
          contactId: contact.id,
          direction: 'out',
          kind: message.kind,
          body: this.bodyOf(message),
          payload: message as object,
          source,
          provider: transport.mode === 'live' ? 'mcube' : 'simulator',
          status: 'queued',
          statusRank: STATUS_RANK.queued,
          chatMessageId,
        },
        select: { id: true },
      });
      messageIds.push(row.id);

      const result = await this.attempt(contact, message, transport);
      if (result.ok) {
        sent++;
        await this.prisma.whatsappMessage.update({
          where: { id: row.id },
          data: { status: 'sent', statusRank: STATUS_RANK.sent, sentAt: new Date(), providerMessageId: result.providerMessageId },
        });
        if (transport.mode === 'capture') transport.captured.push({ ...message, messageId: row.id });
      } else {
        failed++;
        await this.prisma.whatsappMessage.update({
          where: { id: row.id },
          data: { status: 'failed', statusRank: STATUS_RANK.failed, failedAt: new Date(), error: result.error },
        });
        this.logger.warn(`WhatsApp to ${contact.waId} not sent (${message.kind}): ${result.error}`);
        // Later messages in the turn assume this one arrived; stop rather than send them out of context.
        break;
      }
    }

    if (sent) {
      await this.prisma.whatsappContact.update({ where: { id: contact.id }, data: { lastOutboundAt: new Date() } });
    }
    return { sent, failed, messageIds };
  }

  private async attempt(
    contact: { waId: string; lastInboundAt: Date | null },
    message: OutboundMessage,
    transport: TransportContext,
  ): Promise<DeliveryResult> {
    if (message.kind !== 'template' && !this.windowOpen(contact.lastInboundAt)) {
      return { ok: false, providerMessageId: null, error: 'session_closed', delivery: 'refused' };
    }
    if (transport.mode === 'capture') {
      return { ok: true, providerMessageId: `sim.${randomUUID()}`, error: null };
    }
    if (!this.isAllowed(contact.waId)) {
      return { ok: false, providerMessageId: null, error: 'blocked_by_allowlist', delivery: 'refused' };
    }
    if (!this.mcube.isConfigured()) {
      return { ok: false, providerMessageId: null, error: 'mcube_not_configured', delivery: 'refused' };
    }
    try {
      return await this.mcube.send(contact.waId, message);
    } catch (err) {
      // Timeout or connection reset: it may have gone through. Never retried.
      return { ok: false, providerMessageId: null, error: `transport: ${(err as Error)?.message}`, delivery: 'unknown' };
    }
  }

  private bodyOf(message: OutboundMessage): string {
    switch (message.kind) {
      case 'text':
        return message.body;
      case 'buttons':
      case 'list':
        return renderOptionsAsText(message);
      case 'image':
        return [message.caption, message.url].filter(Boolean).join('\n');
      case 'document':
        return `${message.filename} ${message.url}`;
      case 'template':
        return message.body;
    }
  }

  /** One receipt. The `statusRank < rank` predicate is the whole ordering guarantee. */
  async applyStatus(update: StatusUpdate, provider = 'mcube'): Promise<boolean> {
    const rank = STATUS_RANK[update.status];
    const at = update.timestamp;
    const result = await this.prisma.whatsappMessage.updateMany({
      where: { provider, providerMessageId: update.providerMessageId, statusRank: { lt: rank } },
      data: {
        status: update.status,
        statusRank: rank,
        ...(update.status === 'sent' ? { sentAt: at } : {}),
        ...(update.status === 'delivered' ? { deliveredAt: at } : {}),
        // A read implies delivered; Meta sometimes skips straight to it.
        ...(update.status === 'read' ? { readAt: at } : {}),
        ...(update.status === 'failed' ? { failedAt: at, error: update.error ?? 'Delivery failed' } : {}),
      },
    });
    if (update.status === 'read' && result.count) {
      await this.prisma.whatsappMessage.updateMany({
        where: { provider, providerMessageId: update.providerMessageId, deliveredAt: null },
        data: { deliveredAt: at },
      });
    }
    return result.count > 0;
  }
}

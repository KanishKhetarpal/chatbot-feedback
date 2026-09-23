import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { scoreLead, type LeadScore } from './whatsapp-score';

/**
 * Keeps every WhatsApp contact's conversion score up to date.
 *
 * Recomputed after each turn we answer, after a follow-up goes out and
 * whenever the CRM status is re-read, so the contacts list and the follow-up
 * rules always read the same number. Never throws: a scoring failure must not
 * cost someone their reply.
 */
@Injectable()
export class WhatsappScoreService implements OnApplicationBootstrap {
  private readonly logger = new Logger('WhatsappScore');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Conversations that existed before scoring did get their first score at
   * boot, so the contacts list is not a column of dashes. Database work only:
   * no model call, no message sent.
   */
  async onApplicationBootstrap() {
    const unscored = await this.prisma.whatsappContact.findMany({ where: { scoredAt: null }, select: { id: true }, take: 500 });
    if (!unscored.length) return;
    for (const { id } of unscored) await this.rescore(id);
    this.logger.log(`Scored ${unscored.length} conversation(s) that had no score yet.`);
  }

  async rescore(contactId: string): Promise<LeadScore | null> {
    try {
      const contact = await this.prisma.whatsappContact.findUnique({
        where: { id: contactId },
        include: { visitor: { select: { name: true, courseInterest: true, location: true, custom: true } } },
      });
      if (!contact) return null;

      const [inbound, outboundCount, lastOut] = await Promise.all([
        this.prisma.whatsappMessage.findMany({
          where: { contactId, direction: 'in' },
          orderBy: { createdAt: 'desc' },
          take: 40,
          select: { body: true, createdAt: true },
        }),
        this.prisma.whatsappMessage.count({ where: { contactId, direction: 'out' } }),
        this.prisma.whatsappMessage.findFirst({
          where: { contactId, direction: 'out' },
          orderBy: { createdAt: 'desc' },
          select: { readAt: true },
        }),
      ]);

      const custom = (contact.visitor.custom ?? {}) as Record<string, unknown>;
      const str = (key: string) => (typeof custom[key] === 'string' ? (custom[key] as string) : null);

      const result = scoreLead({
        audience: str('audience'),
        stage: contact.stage,
        optedOut: !!contact.optedOutAt,
        inbound,
        outboundCount,
        lastInboundAt: contact.lastInboundAt,
        followupCount: contact.followupCount,
        lastOutboundRead: !!lastOut?.readAt,
        facts: {
          name: contact.visitor.name,
          courseInterest: contact.visitor.courseInterest,
          city: contact.visitor.location,
          educationLevel: str('educationLevel'),
          preferredCallTime: str('preferredCallTime'),
        },
        crmStatus: str('crmStatus'),
        applicationStatus: str('applicationStatus'),
        applicationProgress: str('applicationProgress'),
        applicationFeeStatus: str('applicationFeeStatus'),
        handoffReason: contact.handoffReason,
      });

      await this.prisma.whatsappContact.update({
        where: { id: contactId },
        data: {
          score: result.score,
          scoreBand: result.band,
          scoreSignals: result.signals as unknown as Prisma.InputJsonValue,
          scoredAt: new Date(),
        },
      });
      return result;
    } catch (err) {
      this.logger.warn(`Scoring ${contactId} failed: ${(err as Error)?.message}`);
      return null;
    }
  }
}

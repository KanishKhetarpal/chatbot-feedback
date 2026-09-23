import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { previewText } from './ui-block.util';
import type { ListInboxQueryDto } from './dto/list-inbox-query.dto';
import type { ReviewThreadDto } from './dto/review-thread.dto';

type LastMessageRow = { visitor_id: string; role: string; content: string; created_at: Date };

/**
 * Reading the recorded conversations — the whole point of this app.
 *
 * The unit is the **visitor** (one continuous thread per browser/tester per
 * chatbot). Visitors who opened the chat and never typed are included unless
 * the reader asks otherwise: "opened and said nothing" is itself feedback.
 */
@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  async listThreads(query: ListInboxQueryDto) {
    const agent = query.agentId
      ? await this.prisma.chatAgent.findUnique({ where: { id: query.agentId }, select: { id: true, name: true } })
      : null;
    if (query.agentId && !agent) throw new NotFoundException('Chatbot not found');

    const take = query.limit ?? 50;
    const where: Prisma.ChatWidgetVisitorWhereInput = {
      ...(query.agentId ? { agentId: query.agentId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
      ...(query.withMessagesOnly ? { messages: { some: {} } } : {}),
      ...(query.withFeedbackOnly
        ? { OR: [{ rating: { not: null } }, { messages: { some: { rating: { not: null } } } }] }
        : {}),
    };

    const visitors = await this.prisma.chatWidgetVisitor.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        firstSeenAt: true,
        lastSeenAt: true,
        name: true,
        email: true,
        phone: true,
        rating: true,
        ratingComment: true,
        reviewStatus: true,
        deviceType: true,
        channel: true,
        custom: true,
        agent: { select: { id: true, name: true, avatarUrl: true } },
        user: { select: { id: true, name: true, email: true } },
        whatsapp: { select: { waId: true, profileName: true } },
        _count: { select: { messages: true } },
      },
    });

    const hasMore = visitors.length > take;
    const page = hasMore ? visitors.slice(0, take) : visitors;
    const visitorIds = page.map((v) => v.id);

    const [lastMessages, thumbs] = await Promise.all([
      visitorIds.length === 0
        ? Promise.resolve([] as LastMessageRow[])
        : this.prisma.$queryRaw<LastMessageRow[]>`
            SELECT DISTINCT ON ("visitorId")
              "visitorId" AS visitor_id, role, content, "createdAt" AS created_at
            FROM chat_widget_messages
            WHERE "visitorId" IN (${Prisma.join(visitorIds)})
            ORDER BY "visitorId", "createdAt" DESC
          `,
      visitorIds.length === 0
        ? Promise.resolve([] as { visitorId: string; rating: string | null; _count: number }[])
        : this.prisma.chatWidgetMessage
            .groupBy({
              by: ['visitorId', 'rating'],
              where: { visitorId: { in: visitorIds }, rating: { not: null } },
              _count: true,
            })
            .then((rows) => rows.map((r) => ({ visitorId: r.visitorId, rating: r.rating, _count: r._count }))),
    ]);
    const lastByVisitor = new Map(lastMessages.map((row) => [row.visitor_id, row]));
    const thumbsByVisitor = new Map<string, { up: number; down: number }>();
    for (const row of thumbs) {
      const entry = thumbsByVisitor.get(row.visitorId) ?? { up: 0, down: 0 };
      if (row.rating === 'up') entry.up += row._count;
      if (row.rating === 'down') entry.down += row._count;
      thumbsByVisitor.set(row.visitorId, entry);
    }

    return {
      agent,
      threads: page.map((visitor) => {
        const last = lastByVisitor.get(visitor.id) ?? null;
        return {
          visitorId: visitor.id,
          agent: visitor.agent,
          user: visitor.user,
          name: this.displayNameOf(visitor),
          email: visitor.email,
          /** The number they are reachable on, so a nameless thread is still a person. */
          phone: visitor.phone ?? (visitor.whatsapp ? `+${visitor.whatsapp.waId}` : null),
          channel: visitor.channel,
          /** Whether the visitor gave a mobile number - the sales test's own success flag. */
          hasPhone: Boolean(visitor.phone || visitor.whatsapp),
          deviceType: visitor.deviceType,
          firstSeenAt: visitor.firstSeenAt,
          lastSeenAt: visitor.lastSeenAt,
          messageCount: visitor._count.messages,
          rating: visitor.rating,
          ratingComment: visitor.ratingComment,
          reviewStatus: visitor.reviewStatus,
          thumbs: thumbsByVisitor.get(visitor.id) ?? { up: 0, down: 0 },
          lastMessage: last ? { role: last.role, preview: previewText(last.content, 160), at: last.created_at } : null,
        };
      }),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * Who this conversation is with, from every name we hold: what they typed,
   * the first name the bot recorded, or their WhatsApp profile name. Null when
   * we genuinely never learned one, and the list falls back to their number.
   */
  private displayNameOf(visitor: {
    name: string | null;
    custom: Prisma.JsonValue;
    whatsapp?: { profileName: string | null } | null;
  }): string | null {
    const custom = (visitor.custom ?? {}) as Record<string, unknown>;
    const first = typeof custom.firstName === 'string' ? custom.firstName.trim() : '';
    return visitor.name?.trim() || first || visitor.whatsapp?.profileName?.trim() || null;
  }

  async getThread(visitorId: string) {
    const visitor = await this.prisma.chatWidgetVisitor.findUnique({
      where: { id: visitorId },
      select: {
        id: true,
        agentId: true,
        firstSeenAt: true,
        lastSeenAt: true,
        name: true,
        phone: true,
        email: true,
        location: true,
        courseInterest: true,
        ipAddress: true,
        browser: true,
        os: true,
        deviceType: true,
        timezone: true,
        language: true,
        pageUrl: true,
        referrer: true,
        custom: true,
        handoffAt: true,
        currentNodeId: true,
        guidedFlowExitedAt: true,
        rating: true,
        ratingComment: true,
        ratedAt: true,
        reviewStatus: true,
        reviewNote: true,
        reviewedAt: true,
        reviewedBy: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
        agent: { select: { id: true, name: true, avatarUrl: true, model: true } },
      },
    });
    if (!visitor) throw new NotFoundException('Conversation not found');

    const messages = await this.prisma.chatWidgetMessage.findMany({
      where: { visitorId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
        latencyMs: true,
        packVersion: true,
        chipNodeId: true,
        rating: true,
        feedbackNote: true,
        feedbackReason: true,
        ratedAt: true,
      },
    });

    const totals = messages.reduce(
      (acc, m) => ({
        inputTokens: acc.inputTokens + (m.inputTokens ?? 0),
        outputTokens: acc.outputTokens + (m.outputTokens ?? 0),
        cacheReadTokens: acc.cacheReadTokens + (m.cacheReadTokens ?? 0),
        cacheWriteTokens: acc.cacheWriteTokens + (m.cacheWriteTokens ?? 0),
        thumbsUp: acc.thumbsUp + (m.rating === 'up' ? 1 : 0),
        thumbsDown: acc.thumbsDown + (m.rating === 'down' ? 1 : 0),
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thumbsUp: 0, thumbsDown: 0 },
    );

    return {
      visitor: {
        id: visitor.id,
        firstSeenAt: visitor.firstSeenAt,
        lastSeenAt: visitor.lastSeenAt,
        currentNodeId: visitor.currentNodeId,
        guidedFlowExitedAt: visitor.guidedFlowExitedAt,
        handoffAt: visitor.handoffAt,
        user: visitor.user,
      },
      collected: {
        name: visitor.name,
        phone: visitor.phone,
        email: visitor.email,
        location: visitor.location,
        courseInterest: visitor.courseInterest,
      },
      custom: (visitor.custom ?? {}) as Record<string, unknown>,
      feedback: {
        rating: visitor.rating,
        ratingComment: visitor.ratingComment,
        ratedAt: visitor.ratedAt,
      },
      review: {
        status: visitor.reviewStatus,
        note: visitor.reviewNote,
        reviewedAt: visitor.reviewedAt,
        reviewedBy: visitor.reviewedBy,
      },
      context: {
        ipAddress: visitor.ipAddress,
        browser: visitor.browser,
        os: visitor.os,
        deviceType: visitor.deviceType,
        timezone: visitor.timezone,
        language: visitor.language,
        pageUrl: visitor.pageUrl,
        referrer: visitor.referrer,
      },
      agent: visitor.agent,
      messages,
      usage: totals,
    };
  }

  async review(visitorId: string, dto: ReviewThreadDto, reviewerId: string) {
    const visitor = await this.prisma.chatWidgetVisitor.findUnique({ where: { id: visitorId }, select: { id: true } });
    if (!visitor) throw new NotFoundException('Conversation not found');
    const updated = await this.prisma.chatWidgetVisitor.update({
      where: { id: visitorId },
      data: {
        ...(dto.reviewStatus ? { reviewStatus: dto.reviewStatus } : {}),
        ...(dto.reviewNote !== undefined ? { reviewNote: dto.reviewNote?.trim() || null } : {}),
        reviewedAt: new Date(),
        reviewedByUserId: reviewerId,
      },
      select: {
        id: true,
        reviewStatus: true,
        reviewNote: true,
        reviewedAt: true,
        reviewedBy: { select: { id: true, name: true } },
      },
    });
    return { review: updated };
  }

  async remove(visitorId: string) {
    const visitor = await this.prisma.chatWidgetVisitor.findUnique({ where: { id: visitorId }, select: { id: true } });
    if (!visitor) throw new NotFoundException('Conversation not found');
    await this.prisma.chatWidgetVisitor.delete({ where: { id: visitorId } });
    return { id: visitorId, deleted: true };
  }

  /** Headline numbers for the feedback dashboard, optionally for one chatbot. */
  async stats(agentId?: string) {
    const where = agentId ? { agentId } : {};
    const [conversations, withMessages, rated, ratingAgg, thumbs, reviewStatus, perAgent] = await Promise.all([
      this.prisma.chatWidgetVisitor.count({ where }),
      this.prisma.chatWidgetVisitor.count({ where: { ...where, messages: { some: {} } } }),
      this.prisma.chatWidgetVisitor.count({ where: { ...where, rating: { not: null } } }),
      this.prisma.chatWidgetVisitor.aggregate({ where: { ...where, rating: { not: null } }, _avg: { rating: true } }),
      this.prisma.chatWidgetMessage.groupBy({
        by: ['rating'],
        where: { rating: { not: null }, visitor: where },
        _count: true,
      }),
      this.prisma.chatWidgetVisitor.groupBy({ by: ['reviewStatus'], where, _count: true }),
      this.prisma.chatWidgetVisitor.groupBy({
        by: ['agentId'],
        where,
        _count: true,
        _avg: { rating: true },
      }),
    ]);

    const agents = perAgent.length
      ? await this.prisma.chatAgent.findMany({
          where: { id: { in: perAgent.map((row) => row.agentId) } },
          select: { id: true, name: true, status: true },
        })
      : [];
    const agentById = new Map(agents.map((a) => [a.id, a]));

    return {
      conversations,
      withMessages,
      rated,
      averageRating: ratingAgg._avg.rating,
      thumbsUp: thumbs.find((t) => t.rating === 'up')?._count ?? 0,
      thumbsDown: thumbs.find((t) => t.rating === 'down')?._count ?? 0,
      reviewStatus: Object.fromEntries(reviewStatus.map((r) => [r.reviewStatus, r._count])),
      perAgent: perAgent.map((row) => ({
        agent: agentById.get(row.agentId) ?? { id: row.agentId, name: 'Deleted chatbot', status: 'deleted' },
        conversations: row._count,
        averageRating: row._avg.rating,
      })),
    };
  }

  /** Every conversation for one chatbot (or all), messages included — for offline review. */
  async exportThreads(agentId?: string) {
    const visitors = await this.prisma.chatWidgetVisitor.findMany({
      where: agentId ? { agentId } : {},
      orderBy: { firstSeenAt: 'asc' },
      select: {
        id: true,
        firstSeenAt: true,
        lastSeenAt: true,
        name: true,
        email: true,
        phone: true,
        rating: true,
        ratingComment: true,
        reviewStatus: true,
        reviewNote: true,
        deviceType: true,
        browser: true,
        os: true,
        agent: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
            chipNodeId: true,
            rating: true,
            feedbackNote: true,
            model: true,
            latencyMs: true,
          },
        },
      },
    });
    return { exportedAt: new Date(), count: visitors.length, conversations: visitors };
  }
}

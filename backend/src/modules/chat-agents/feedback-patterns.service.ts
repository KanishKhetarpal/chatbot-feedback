import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedbackPatternsQueryDto } from './dto/feedback-patterns-query.dto';
import { FEEDBACK_REASONS, SALES_REASONS } from './dto/widget-feedback.dto';

/** Words that say nothing about what a question was about. */
const STOP_WORDS = new Set(
  (
    'the a an is are was were be been i me my mine you your yours it its this that these those to of and or in on for ' +
    'with at from by as if so do does did can could would should will shall may might have has had what how when where ' +
    'which who whom why there their they them we us our ours am not no yes ok okay hi hello hey thanks thank please ' +
    'tell want need know get got give about any some more most much many also just like than then into over under ' +
    'up down out off again very really s t m re ve ll d u im ive dont cant wont isnt arent didnt doesnt'
  ).split(/\s+/),
);

function termsOf(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (raw.length < 3 || STOP_WORDS.has(raw) || /^\d+$/.test(raw)) continue;
    seen.add(raw);
  }
  return [...seen];
}

function topTerms(texts: string[], limit = 12) {
  const counts = new Map<string, number>();
  for (const t of texts) for (const term of termsOf(t)) counts.set(term, (counts.get(term) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

const HOUR_IN_IST = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' });
const hourOf = (d: Date) => Number(HOUR_IN_IST.format(d)) % 24;

type Tally = { likes: number; dislikes: number; notes: number };
const tally = (): Tally => ({ likes: 0, dislikes: 0, notes: 0 });
const rate = (t: Tally) => (t.likes + t.dislikes ? Math.round((t.likes / (t.likes + t.dislikes)) * 1000) / 1000 : null);

/**
 * The "patterns" behind the likes: which chatbots, replies, reasons, hours and
 * testers the thumbs cluster around. Read-only, admin-only, computed from the
 * feedback columns on `chat_widget_messages` and `chat_widget_visitors`.
 */
@Injectable()
export class FeedbackPatternsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(query: FeedbackPatternsQueryDto) {
    const days = query.days ?? 30;
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
    const visitorScope = query.agentId ? { agentId: query.agentId } : {};

    const [rated, replies, stars, starsByAgent, repliesByAgent] = await Promise.all([
      this.prisma.chatWidgetMessage.findMany({
        where: {
          role: 'assistant',
          ratedAt: { gte: from },
          OR: [{ rating: { not: null } }, { feedbackNote: { not: null } }],
          visitor: visitorScope,
        },
        orderBy: { ratedAt: 'desc' },
        take: 1000,
        select: {
          id: true,
          visitorId: true,
          content: true,
          model: true,
          rating: true,
          feedbackReason: true,
          feedbackNote: true,
          ratedAt: true,
          createdAt: true,
          visitor: {
            select: {
              id: true,
              agentId: true,
              name: true,
              rating: true,
              user: { select: { id: true, name: true, isGuest: true } },
            },
          },
        },
      }),
      this.prisma.chatWidgetMessage.count({ where: { role: 'assistant', createdAt: { gte: from }, visitor: visitorScope } }),
      this.prisma.chatWidgetVisitor.aggregate({
        where: { ...visitorScope, rating: { not: null }, ratedAt: { gte: from } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.chatWidgetVisitor.groupBy({
        by: ['agentId'],
        where: { ...visitorScope, rating: { not: null }, ratedAt: { gte: from } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ agentId: string; replies: number }[]>`
        SELECT v."agentId" AS "agentId", count(*)::int AS replies
        FROM chat_widget_messages m
        JOIN chat_widget_visitors v ON v.id = m."visitorId"
        WHERE m.role = 'assistant' AND m."createdAt" >= ${from}
          ${query.agentId ? Prisma.sql`AND v."agentId" = ${query.agentId}` : Prisma.empty}
        GROUP BY 1`,
    ]);

    // ── The question each rated reply answered ───────────────────────────────
    const visitorIds = [...new Set(rated.map((m) => m.visitorId))];
    const userMessages = visitorIds.length
      ? await this.prisma.chatWidgetMessage.findMany({
          where: { visitorId: { in: visitorIds }, role: 'user' },
          orderBy: { createdAt: 'asc' },
          select: { visitorId: true, content: true, createdAt: true },
        })
      : [];
    const userByVisitor = new Map<string, { content: string; createdAt: Date }[]>();
    for (const u of userMessages) {
      if (!userByVisitor.has(u.visitorId)) userByVisitor.set(u.visitorId, []);
      userByVisitor.get(u.visitorId)!.push(u);
    }
    const questionFor = (m: { visitorId: string; createdAt: Date }) => {
      let q: string | null = null;
      for (const u of userByVisitor.get(m.visitorId) ?? []) {
        if (u.createdAt < m.createdAt) q = u.content;
        else break;
      }
      return q;
    };

    // ── Folds ────────────────────────────────────────────────────────────────
    const totals = tally();
    const byAgentT = new Map<string, Tally>();
    const byModelT = new Map<string, Tally>();
    const byDayT = new Map<string, Tally>();
    const byHourT = new Map<number, Tally>();
    const byUserT = new Map<string, Tally & { label: string; user: { id: string; name: string } | null }>();
    const byReasonC = new Map<string, number>();
    const likedQuestions: string[] = [];
    const dislikedQuestions: string[] = [];

    for (let i = 0; i < days; i++) byDayT.set(new Date(from.getTime() + i * 86_400_000).toISOString().slice(0, 10), tally());
    for (let h = 0; h < 24; h++) byHourT.set(h, tally());

    const bump = (t: Tally, m: { rating: string | null; feedbackNote: string | null }) => {
      if (m.rating === 'up') t.likes += 1;
      else if (m.rating === 'down') t.dislikes += 1;
      if (m.feedbackNote) t.notes += 1;
    };

    for (const m of rated) {
      bump(totals, m);
      const agentKey = m.visitor.agentId;
      if (!byAgentT.has(agentKey)) byAgentT.set(agentKey, tally());
      bump(byAgentT.get(agentKey)!, m);

      const modelKey = m.model ?? 'unknown';
      if (!byModelT.has(modelKey)) byModelT.set(modelKey, tally());
      bump(byModelT.get(modelKey)!, m);

      if (m.ratedAt) {
        const day = m.ratedAt.toISOString().slice(0, 10);
        if (!byDayT.has(day)) byDayT.set(day, tally());
        bump(byDayT.get(day)!, m);
        bump(byHourT.get(hourOf(m.ratedAt))!, m);
      }

      const userKey = m.visitor.user ? `user:${m.visitor.user.id}` : `visitor:${m.visitor.id}`;
      if (!byUserT.has(userKey)) {
        byUserT.set(userKey, {
          ...tally(),
          label: m.visitor.user?.name ?? m.visitor.name ?? `Visitor ${m.visitor.id.slice(0, 8)}`,
          user: m.visitor.user ? { id: m.visitor.user.id, name: m.visitor.user.name } : null,
        });
      }
      bump(byUserT.get(userKey)!, m);

      if (m.rating && m.feedbackReason) byReasonC.set(`${m.rating}:${m.feedbackReason}`, (byReasonC.get(`${m.rating}:${m.feedbackReason}`) ?? 0) + 1);

      const q = questionFor(m);
      if (q) (m.rating === 'up' ? likedQuestions : m.rating === 'down' ? dislikedQuestions : []).push(q);
    }

    // ── Names ────────────────────────────────────────────────────────────────
    const agentIds = [...new Set([...byAgentT.keys(), ...repliesByAgent.map((r) => r.agentId), ...starsByAgent.map((s) => s.agentId)])];
    const agents = agentIds.length
      ? await this.prisma.chatAgent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true, status: true, avatarUrl: true, model: true } })
      : [];
    const agentById = new Map(agents.map((a) => [a.id, a]));
    const agentOf = (id: string) => agentById.get(id) ?? { id, name: 'Deleted chatbot', status: 'deleted', avatarUrl: null, model: null };
    const repliesFor = new Map(repliesByAgent.map((r) => [r.agentId, r.replies]));
    const starsFor = new Map(starsByAgent.map((s) => [s.agentId, { average: s._avg.rating, count: s._count._all }]));

    const byAgent = agentIds
      .map((id) => {
        const t = byAgentT.get(id) ?? tally();
        const replyCount = repliesFor.get(id) ?? 0;
        const rated = t.likes + t.dislikes;
        return {
          agent: agentOf(id),
          ...t,
          likeRate: rate(t),
          replies: replyCount,
          /** Share of replies that got a thumb at all — how much signal this chatbot is generating. */
          ratedShare: replyCount ? Math.round((rated / replyCount) * 1000) / 1000 : null,
          averageStars: starsFor.get(id)?.average ?? null,
          starRatings: starsFor.get(id)?.count ?? 0,
        };
      })
      .sort((a, b) => b.likes + b.dislikes - (a.likes + a.dislikes));

    const item = (m: (typeof rated)[number]) => ({
      messageId: m.id,
      visitorId: m.visitorId,
      agent: agentOf(m.visitor.agentId),
      user: m.visitor.user ? { id: m.visitor.user.id, name: m.visitor.user.name, isGuest: m.visitor.user.isGuest } : null,
      visitorName: m.visitor.name,
      question: questionFor(m),
      reply: m.content,
      model: m.model,
      rating: m.rating,
      reason: m.feedbackReason,
      note: m.feedbackNote,
      ratedAt: m.ratedAt,
      createdAt: m.createdAt,
      conversationStars: m.visitor.rating,
    });

    const leads = await this.leadCapture(from, query.agentId, agentOf);

    const ratedCount = totals.likes + totals.dislikes;
    return {
      range: { from, to: now, days },
      leads,
      totals: {
        ...totals,
        likeRate: rate(totals),
        replies,
        /** Share of all replies in range that got a thumb. */
        ratedShare: replies ? Math.round((ratedCount / replies) * 1000) / 1000 : null,
        conversationsRated: stars._count._all,
        averageStars: stars._avg.rating,
      },
      byAgent,
      byModel: [...byModelT.entries()].map(([model, t]) => ({ model, ...t, likeRate: rate(t) })).sort((a, b) => b.likes + b.dislikes - (a.likes + a.dislikes)),
      byReason: {
        up: FEEDBACK_REASONS.up.map((reason) => ({ reason, count: byReasonC.get(`up:${reason}`) ?? 0 })),
        down: FEEDBACK_REASONS.down.map((reason) => ({ reason, count: byReasonC.get(`down:${reason}`) ?? 0 })),
      },
      byDay: [...byDayT.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, t]) => ({ date, ...t })),
      /** Hour of day in IST, where the testers are. */
      byHour: [...byHourT.entries()].map(([hour, t]) => ({ hour, ...t })),
      byUser: [...byUserT.values()].sort((a, b) => b.likes + b.dislikes + b.notes - (a.likes + a.dislikes + a.notes)).slice(0, 25),
      themes: { liked: topTerms(likedQuestions), disliked: topTerms(dislikedQuestions) },
      liked: rated.filter((m) => m.rating === 'up').slice(0, 100).map(item),
      disliked: rated.filter((m) => m.rating === 'down').slice(0, 100).map(item),
      notes: rated.filter((m) => m.feedbackNote).slice(0, 100).map(item),
    };
  }

  /**
   * Lead capture per chatbot: of the conversations started in range, how many
   * yielded a name, how many a mobile number, and how many visitor messages it
   * took before the number appeared. This is what the sales personas are
   * being judged on, so it sits at the top of the report.
   */
  private async leadCapture(
    from: Date,
    agentId: string | undefined,
    agentOf: (id: string) => { id: string; name: string; status: string; avatarUrl: string | null; model: string | null },
  ) {
    const visitors = await this.prisma.chatWidgetVisitor.findMany({
      where: { firstSeenAt: { gte: from }, messageCount: { gt: 0 }, ...(agentId ? { agentId } : {}) },
      select: {
        id: true,
        agentId: true,
        name: true,
        phone: true,
        fieldSources: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { role: true, content: true, rating: true, feedbackReason: true },
        },
      },
    });

    type Row = {
      conversations: number;
      withName: number;
      withPhone: number;
      turns: number[];
      convincingLikes: number;
      pushyDislikes: number;
    };
    const rows = new Map<string, Row>();
    const up = new Set<string>(SALES_REASONS.up);
    const down = new Set<string>(SALES_REASONS.down);

    for (const v of visitors) {
      if (!rows.has(v.agentId)) rows.set(v.agentId, { conversations: 0, withName: 0, withPhone: 0, turns: [], convincingLikes: 0, pushyDislikes: 0 });
      const row = rows.get(v.agentId)!;
      row.conversations += 1;

      const sources = ((v.fieldSources ?? {}) as Record<string, string>) || {};
      // A name copied from the tester's account does not count - the bot had to earn it.
      if (v.name && sources.name !== 'account') row.withName += 1;

      if (v.phone) {
        row.withPhone += 1;
        const digits = v.phone.replace(/\D/g, '').slice(-10);
        let userTurns = 0;
        for (const m of v.messages) {
          if (m.role !== 'user') continue;
          userTurns += 1;
          if (digits && m.content.replace(/\D/g, '').includes(digits)) {
            row.turns.push(userTurns);
            break;
          }
        }
      }

      for (const m of v.messages) {
        if (m.role !== 'assistant' || !m.feedbackReason) continue;
        if (m.rating === 'up' && up.has(m.feedbackReason)) row.convincingLikes += 1;
        if (m.rating === 'down' && down.has(m.feedbackReason)) row.pushyDislikes += 1;
      }
    }

    // A chatbot can have leads without a single thumb, so it may be missing from the
    // feedback-derived lookup - resolve those here.
    const ids = [...rows.keys()];
    const named = ids.length ? await this.prisma.chatAgent.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, status: true, avatarUrl: true, model: true } }) : [];
    const namedById = new Map(named.map((a) => [a.id, a]));
    const resolve = (id: string) => namedById.get(id) ?? agentOf(id);

    return [...rows.entries()]
      .map(([id, r]) => ({
        agent: resolve(id),
        conversations: r.conversations,
        withName: r.withName,
        withPhone: r.withPhone,
        captureRate: r.conversations ? Math.round((r.withPhone / r.conversations) * 1000) / 1000 : null,
        avgTurnsToPhone: r.turns.length ? Math.round((r.turns.reduce((a, b) => a + b, 0) / r.turns.length) * 10) / 10 : null,
        convincingLikes: r.convincingLikes,
        pushyDislikes: r.pushyDislikes,
      }))
      .sort((a, b) => (b.captureRate ?? -1) - (a.captureRate ?? -1) || b.conversations - a.conversations);
  }
}

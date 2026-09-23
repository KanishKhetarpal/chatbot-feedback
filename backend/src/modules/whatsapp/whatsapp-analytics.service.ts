import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * What the read receipts are for.
 *
 * Every outbound row carries sent / delivered / read timestamps from Meta's
 * receipts; every inbound row knows which option was tapped. From those:
 *
 *  - the delivery funnel (sent → delivered → read → replied), per source, so
 *    the follow-up ladder is judged on reads and replies, not on sends;
 *  - time to read, which tells when people actually look at WhatsApp;
 *  - which options get tapped, which is how the menu and the bot's suggestions
 *    get tuned;
 *  - handoffs by reason, opt-outs, and the contact funnel by stage.
 *
 * Simulator traffic is excluded unless asked for.
 */
@Injectable()
export class WhatsappAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(params: { from?: Date; to?: Date; includeSimulated?: boolean }) {
    const from = params.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = params.to ?? new Date();
    const sim = params.includeSimulated ? Prisma.sql`` : Prisma.sql`AND c.simulated = false`;

    const [funnel, bySource, readTimes, taps, interactiveSent, handoffs, stages, contacts, daily, hours] = await Promise.all([
      this.prisma.$queryRaw<Array<Record<string, bigint>>>`
        SELECT count(*) FILTER (WHERE m."sentAt" IS NOT NULL) AS sent,
               count(*) FILTER (WHERE m."deliveredAt" IS NOT NULL) AS delivered,
               count(*) FILTER (WHERE m."readAt" IS NOT NULL) AS read,
               count(*) FILTER (WHERE m.status = 'failed') AS failed,
               count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM whatsapp_messages r WHERE r."contactId" = m."contactId" AND r.direction = 'in'
                   AND r."createdAt" > m."createdAt" AND r."createdAt" < m."createdAt" + interval '24 hours')) AS replied
        FROM whatsapp_messages m JOIN whatsapp_contacts c ON c.id = m."contactId"
        WHERE m.direction = 'out' AND m."createdAt" BETWEEN ${from} AND ${to} ${sim}`,
      this.prisma.$queryRaw<Array<Record<string, bigint | string>>>`
        SELECT m.source,
               count(*) FILTER (WHERE m."sentAt" IS NOT NULL) AS sent,
               count(*) FILTER (WHERE m."deliveredAt" IS NOT NULL) AS delivered,
               count(*) FILTER (WHERE m."readAt" IS NOT NULL) AS read,
               count(*) FILTER (WHERE m.status = 'failed') AS failed,
               count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM whatsapp_messages r WHERE r."contactId" = m."contactId" AND r.direction = 'in'
                   AND r."createdAt" > m."createdAt" AND r."createdAt" < m."createdAt" + interval '24 hours')) AS replied
        FROM whatsapp_messages m JOIN whatsapp_contacts c ON c.id = m."contactId"
        WHERE m.direction = 'out' AND m."createdAt" BETWEEN ${from} AND ${to} ${sim}
        GROUP BY m.source ORDER BY sent DESC`,
      this.prisma.$queryRaw<Array<{ p50: number | null; p90: number | null }>>`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM m."readAt" - m."sentAt")) AS p50,
               percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM m."readAt" - m."sentAt")) AS p90
        FROM whatsapp_messages m JOIN whatsapp_contacts c ON c.id = m."contactId"
        WHERE m.direction = 'out' AND m."readAt" IS NOT NULL AND m."sentAt" IS NOT NULL
          AND m."createdAt" BETWEEN ${from} AND ${to} ${sim}`,
      this.prisma.$queryRaw<Array<{ optionId: string; title: string; taps: bigint }>>`
        SELECT m."optionId" AS "optionId",
               max(m."optionTitle") AS title, count(*) AS taps
        FROM whatsapp_messages m JOIN whatsapp_contacts c ON c.id = m."contactId"
        WHERE m.direction = 'in' AND m."optionId" IS NOT NULL AND m."optionId" NOT LIKE 'ai:%'
          AND m."createdAt" BETWEEN ${from} AND ${to} ${sim}
        GROUP BY 1 ORDER BY taps DESC LIMIT 20`,
      this.prisma.$queryRaw<Array<{ offered: bigint; tapped: bigint; aiTapped: bigint }>>`
        SELECT (SELECT count(*) FROM whatsapp_messages m JOIN whatsapp_contacts c ON c.id = m."contactId"
                 WHERE m.direction = 'out' AND m.kind IN ('buttons','list') AND m."sentAt" IS NOT NULL
                   AND m."createdAt" BETWEEN ${from} AND ${to} ${sim}) AS offered,
               (SELECT count(*) FROM whatsapp_messages m JOIN whatsapp_contacts c ON c.id = m."contactId"
                 WHERE m.direction = 'in' AND m."optionId" IS NOT NULL
                   AND m."createdAt" BETWEEN ${from} AND ${to} ${sim}) AS tapped,
               (SELECT count(*) FROM whatsapp_messages m JOIN whatsapp_contacts c ON c.id = m."contactId"
                 WHERE m.direction = 'in' AND m."optionId" LIKE 'ai:%'
                   AND m."createdAt" BETWEEN ${from} AND ${to} ${sim}) AS "aiTapped"`,
      this.prisma.$queryRaw<Array<{ reason: string; contacts: bigint; booked: bigint }>>`
        SELECT c."handoffReason" AS reason, count(*) AS contacts,
               count(*) FILTER (WHERE c.stage = 'counsellor') AS booked
        FROM whatsapp_contacts c
        WHERE c."handoffAt" BETWEEN ${from} AND ${to} ${sim}
        GROUP BY 1 ORDER BY contacts DESC`,
      this.prisma.$queryRaw<Array<{ stage: string; contacts: bigint }>>`
        SELECT c.stage, count(*) AS contacts FROM whatsapp_contacts c
        WHERE c."createdAt" BETWEEN ${from} AND ${to} ${sim} GROUP BY 1`,
      this.prisma.$queryRaw<Array<Record<string, bigint>>>`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE c."optedOutAt" IS NOT NULL) AS "optedOut",
               count(*) FILTER (WHERE c."handoffAt" IS NOT NULL) AS "handedOff",
               count(*) FILTER (WHERE v.name IS NOT NULL) AS named,
               count(*) FILTER (WHERE v."courseInterest" IS NOT NULL) AS "withCourse"
        FROM whatsapp_contacts c JOIN chat_widget_visitors v ON v.id = c."visitorId"
        WHERE c."createdAt" BETWEEN ${from} AND ${to} ${sim}`,
      this.prisma.$queryRaw<Array<{ day: Date; sent: bigint; read: bigint; inbound: bigint }>>`
        SELECT date_trunc('day', m."createdAt" AT TIME ZONE 'Asia/Kolkata') AS day,
               count(*) FILTER (WHERE m.direction = 'out' AND m."sentAt" IS NOT NULL) AS sent,
               count(*) FILTER (WHERE m.direction = 'out' AND m."readAt" IS NOT NULL) AS read,
               count(*) FILTER (WHERE m.direction = 'in') AS inbound
        FROM whatsapp_messages m JOIN whatsapp_contacts c ON c.id = m."contactId"
        WHERE m."createdAt" BETWEEN ${from} AND ${to} ${sim}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ hour: number; reads: bigint }>>`
        SELECT extract(hour FROM m."readAt" AT TIME ZONE 'Asia/Kolkata')::int AS hour, count(*) AS reads
        FROM whatsapp_messages m JOIN whatsapp_contacts c ON c.id = m."contactId"
        WHERE m.direction = 'out' AND m."readAt" IS NOT NULL AND m."createdAt" BETWEEN ${from} AND ${to} ${sim}
        GROUP BY 1 ORDER BY 1`,
    ]);

    const n = (v: unknown) => Number(v ?? 0);
    const f = funnel[0] ?? {};
    const rate = (a: unknown, b: unknown) => (n(b) ? Math.round((n(a) / n(b)) * 1000) / 10 : null);
    const i = interactiveSent[0];

    return {
      range: { from, to },
      funnel: {
        sent: n(f.sent),
        delivered: n(f.delivered),
        read: n(f.read),
        replied: n(f.replied),
        failed: n(f.failed),
        deliveryRate: rate(f.delivered, f.sent),
        readRate: rate(f.read, f.delivered),
        replyRate: rate(f.replied, f.read),
      },
      timeToReadSeconds: { p50: readTimes[0]?.p50 ?? null, p90: readTimes[0]?.p90 ?? null },
      bySource: bySource.map((r) => ({
        source: String(r.source),
        sent: n(r.sent),
        delivered: n(r.delivered),
        read: n(r.read),
        replied: n(r.replied),
        failed: n(r.failed),
        readRate: rate(r.read, r.delivered),
        replyRate: rate(r.replied, r.read),
      })),
      options: {
        interactiveSent: n(i?.offered),
        taps: n(i?.tapped),
        tapRate: rate(i?.tapped, i?.offered),
        aiSuggestionTaps: n(i?.aiTapped),
        top: taps.map((t) => ({ optionId: t.optionId, title: t.title, taps: n(t.taps) })),
      },
      handoffs: handoffs.map((h) => ({ reason: h.reason, contacts: n(h.contacts), booked: n(h.booked) })),
      stages: Object.fromEntries(stages.map((s) => [s.stage, n(s.contacts)])),
      contacts: Object.fromEntries(Object.entries(contacts[0] ?? {}).map(([k, v]) => [k, n(v)])),
      daily: daily.map((d) => ({ day: d.day, sent: n(d.sent), read: n(d.read), inbound: n(d.inbound) })),
      readsByHourIst: hours.map((h) => ({ hour: n(h.hour), reads: n(h.reads) })),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { estimateCostUsd, MODEL_PRICING } from '../../common/ai/ai-pricing';
import { PrismaService } from '../../prisma/prisma.service';
import { AiUsageQueryDto } from './dto/ai-usage-query.dto';

type Bucket = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
  latencySum: number;
  latencyCount: number;
};

type DayRow = {
  day: string;
  model: string;
  calls: number;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
};

const emptyBucket = (): Bucket => ({
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  latencySum: 0,
  latencyCount: 0,
});

function add(
  b: Bucket,
  model: string,
  row: { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number; latencyAvg?: number | null },
) {
  const usage = {
    inputTokens: row.input,
    outputTokens: row.output,
    cacheReadTokens: row.cacheRead,
    cacheWriteTokens: row.cacheWrite,
  };
  b.calls += row.calls;
  b.inputTokens += usage.inputTokens;
  b.outputTokens += usage.outputTokens;
  b.cacheReadTokens += usage.cacheReadTokens;
  b.cacheWriteTokens += usage.cacheWriteTokens;
  b.totalTokens += usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  b.costUsd += estimateCostUsd(model, usage);
  if (row.latencyAvg != null) {
    b.latencySum += row.latencyAvg * row.calls;
    b.latencyCount += row.calls;
  }
}

function finish(b: Bucket) {
  const { latencySum, latencyCount, ...rest } = b;
  const promptSide = b.inputTokens + b.cacheReadTokens + b.cacheWriteTokens;
  return {
    ...rest,
    costUsd: Math.round(b.costUsd * 10_000) / 10_000,
    avgLatencyMs: latencyCount ? Math.round(latencySum / latencyCount) : null,
    /** Share of the prompt that came out of the cache. Near zero across repeats means a broken prefix. */
    cacheHitRate: promptSide ? Math.round((b.cacheReadTokens / promptSide) * 1000) / 1000 : null,
  };
}

const SUM = { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true } as const;

/**
 * Reads the ledger `AiUsageRecorder` writes. Everything here is derived at
 * read time from token counts + the price table, so a price change re-prices
 * history and nothing is ever stale.
 */
@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async report(query: AiUsageQueryDto) {
    const days = query.days ?? 30;
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
    const scope = query.agentId ? { agentId: query.agentId } : {};
    const where: Prisma.AiUsageLogWhereInput = { createdAt: { gte: from }, billable: true, ...scope };

    const [byAgentModel, byOpModel, byModel, latency, recent, tokenCountCalls, dayRows] = await Promise.all([
      this.prisma.aiUsageLog.groupBy({
        by: ['agentId', 'model'],
        where,
        _count: { _all: true },
        _sum: SUM,
        _avg: { latencyMs: true },
      }),
      this.prisma.aiUsageLog.groupBy({
        by: ['operation', 'model'],
        where,
        _count: { _all: true },
        _sum: SUM,
        _avg: { latencyMs: true },
      }),
      this.prisma.aiUsageLog.groupBy({ by: ['model'], where, _count: { _all: true }, _sum: SUM, _avg: { latencyMs: true } }),
      this.prisma.aiUsageLog.aggregate({ where, _avg: { latencyMs: true }, _count: { _all: true } }),
      this.prisma.aiUsageLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 60 }),
      this.prisma.aiUsageLog.count({ where: { createdAt: { gte: from }, billable: false, ...scope } }),
      this.prisma.$queryRaw<DayRow[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
               model,
               count(*)::int                 AS calls,
               sum("inputTokens")::int       AS input,
               sum("outputTokens")::int      AS output,
               sum("cacheReadTokens")::int   AS cache_read,
               sum("cacheWriteTokens")::int  AS cache_write
        FROM ai_usage_logs
        WHERE "createdAt" >= ${from} AND billable = true
          ${query.agentId ? Prisma.sql`AND "agentId" = ${query.agentId}` : Prisma.empty}
        GROUP BY 1, 2
        ORDER BY 1`,
    ]);

    const fromGroup = (g: {
      _count: { _all: number };
      _sum: { inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null; cacheWriteTokens: number | null };
      _avg: { latencyMs: number | null };
    }) => ({
      calls: g._count._all,
      input: g._sum.inputTokens ?? 0,
      output: g._sum.outputTokens ?? 0,
      cacheRead: g._sum.cacheReadTokens ?? 0,
      cacheWrite: g._sum.cacheWriteTokens ?? 0,
      latencyAvg: g._avg.latencyMs,
    });

    // ── totals ───────────────────────────────────────────────────────────────
    const totals = emptyBucket();
    for (const g of byModel) add(totals, g.model, fromGroup(g));

    // ── by chatbot ───────────────────────────────────────────────────────────
    const agentBuckets = new Map<string, Bucket>();
    for (const g of byAgentModel) {
      const key = g.agentId ?? 'none';
      if (!agentBuckets.has(key)) agentBuckets.set(key, emptyBucket());
      add(agentBuckets.get(key)!, g.model, fromGroup(g));
    }
    const agentIds = [...agentBuckets.keys()].filter((k) => k !== 'none');
    const recentAgentIds = recent.map((r) => r.agentId).filter((id): id is string => Boolean(id));
    const allAgentIds = [...new Set([...agentIds, ...recentAgentIds])];
    const agents = allAgentIds.length
      ? await this.prisma.chatAgent.findMany({
          where: { id: { in: allAgentIds } },
          select: { id: true, name: true, status: true, avatarUrl: true, model: true },
        })
      : [];
    const agentById = new Map(agents.map((a) => [a.id, a]));
    const agentOf = (id: string | null) =>
      id ? (agentById.get(id) ?? { id, name: 'Deleted chatbot', status: 'deleted', avatarUrl: null, model: null }) : null;

    const byAgent = [...agentBuckets.entries()]
      .map(([id, b]) => ({ agent: agentOf(id === 'none' ? null : id), ...finish(b) }))
      .sort((a, b) => b.costUsd - a.costUsd);

    // ── by operation ─────────────────────────────────────────────────────────
    const opBuckets = new Map<string, Bucket>();
    for (const g of byOpModel) {
      if (!opBuckets.has(g.operation)) opBuckets.set(g.operation, emptyBucket());
      add(opBuckets.get(g.operation)!, g.model, fromGroup(g));
    }
    const byOperation = [...opBuckets.entries()]
      .map(([operation, b]) => ({ operation, ...finish(b) }))
      .sort((a, b) => b.costUsd - a.costUsd);

    // ── by model ─────────────────────────────────────────────────────────────
    const byModelOut = byModel
      .map((g) => {
        const b = emptyBucket();
        add(b, g.model, fromGroup(g));
        return { model: g.model, ...finish(b) };
      })
      .sort((a, b) => b.costUsd - a.costUsd);

    // ── by day (every day in range present, zero-filled) ─────────────────────
    const dayBuckets = new Map<string, Bucket>();
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getTime() + i * 86_400_000);
      dayBuckets.set(d.toISOString().slice(0, 10), emptyBucket());
    }
    for (const row of dayRows) {
      if (!dayBuckets.has(row.day)) dayBuckets.set(row.day, emptyBucket());
      add(dayBuckets.get(row.day)!, row.model, {
        calls: row.calls,
        input: row.input,
        output: row.output,
        cacheRead: row.cache_read,
        cacheWrite: row.cache_write,
      });
    }
    const byDay = [...dayBuckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, b]) => ({ date, ...finish(b) }));

    return {
      range: { from, to: now, days },
      totals: {
        ...finish(totals),
        avgLatencyMs: latency._avg.latencyMs ? Math.round(latency._avg.latencyMs) : null,
        avgTokensPerCall: totals.calls ? Math.round(totals.totalTokens / totals.calls) : null,
        /** `countTokens` calls in range — free, listed so the number of API round-trips is honest. */
        tokenCountCalls,
      },
      byDay,
      byAgent,
      byModel: byModelOut,
      byOperation,
      recent: recent.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        operation: r.operation,
        model: r.model,
        agent: agentOf(r.agentId),
        visitorId: r.visitorId,
        userId: r.userId,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheReadTokens: r.cacheReadTokens,
        cacheWriteTokens: r.cacheWriteTokens,
        latencyMs: r.latencyMs,
        costUsd:
          Math.round(
            estimateCostUsd(r.model, {
              inputTokens: r.inputTokens,
              outputTokens: r.outputTokens,
              cacheReadTokens: r.cacheReadTokens,
              cacheWriteTokens: r.cacheWriteTokens,
            }) * 1_000_000,
          ) / 1_000_000,
      })),
      pricing: MODEL_PRICING,
    };
  }
}

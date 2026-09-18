import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AGENT_LIMIT, STEP_LIMIT, VISITOR_LIMIT, type LimitRule } from './widget-limits.constants';

export type LimitScope = 'visitor' | 'agent' | 'visitor_step';

export interface LimitVerdict {
  allowed: boolean;
  /** Which scope refused. Only set when `allowed` is false. */
  scope?: LimitScope;
  /** When access returns. Only set when `allowed` is false. */
  retryAt?: Date;
}

/**
 * Rolling-window rate limiting for the public widget endpoint.
 *
 * One row per (scope, key), reused forever rather than one row per window — a
 * row-per-window table grows without bound and needs a sweeper nobody remembers
 * to write. The window is advanced in place when it has elapsed.
 *
 * Counted **before** the model is called, and a refusal short-circuits the API
 * call entirely, so a blocked visitor costs a single indexed upsert and nothing
 * else. That is the whole point: the limit has to be cheaper than the thing it
 * is protecting.
 */
@Injectable()
export class WidgetRateLimitService {
  private readonly logger = new Logger(WidgetRateLimitService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check both scopes and count the request against them.
   *
   * Agent first: it is the scope that actually bounds spend, and there is no
   * reason to spend a write on a per-visitor counter for an agent that is
   * already refusing everyone.
   */
  async consume(agentId: string, visitorId: string, now = new Date()): Promise<LimitVerdict> {
    const agent = await this.consumeAgent(agentId, now);
    if (!agent.allowed) return agent;
    return this.consumeVisitor(visitorId, now);
  }

  /**
   * The agent scope alone.
   *
   * Split out because a visitor is now created on their **first message**, not
   * when the widget opens — so on that first turn there is no visitor id to
   * count against yet, and the agent ceiling has to be checked *before* the row
   * exists. Doing it the other way round would let a script that is already
   * being refused keep inserting visitors, which is the row-growth vector the
   * lazy-creation change exists to close.
   */
  async consumeAgent(agentId: string, now = new Date()): Promise<LimitVerdict> {
    return this.tick('agent', agentId, AGENT_LIMIT, now);
  }

  /** The visitor scope alone — called once the visitor is known to exist. */
  async consumeVisitor(visitorId: string, now = new Date()): Promise<LimitVerdict> {
    return this.tick('visitor', visitorId, VISITOR_LIMIT, now);
  }

  /**
   * The guided-flow chip-click scope.
   *
   * Separate counter from `consumeVisitor` because a chip click costs no AI
   * money — the STEP_LIMIT ceiling is far higher, and sharing the counter
   * would let a burst of harmless clicks drain the AI budget the visitor
   * limit is protecting.
   */
  async consumeStep(visitorId: string, now = new Date()): Promise<LimitVerdict> {
    return this.tick('visitor_step', visitorId, STEP_LIMIT, now);
  }

  /**
   * How things stand without counting a request against the limit.
   *
   * `visitorId` is optional: the widget now opens without creating a visitor, so
   * on a first visit there is only an agent scope to report on.
   */
  async peek(
    agentId: string,
    visitorId: string | null,
    now = new Date(),
  ): Promise<LimitVerdict> {
    const rows = await this.prisma.chatWidgetRateLimit.findMany({
      where: {
        OR: [
          { scope: 'agent', key: agentId },
          ...(visitorId ? [{ scope: 'visitor', key: visitorId }] : []),
        ],
        blockedUntil: { gt: now },
      },
    });
    const blocked = rows.sort(
      (a, b) => (b.blockedUntil?.getTime() ?? 0) - (a.blockedUntil?.getTime() ?? 0),
    )[0];

    return blocked
      ? { allowed: false, scope: blocked.scope as LimitScope, retryAt: blocked.blockedUntil! }
      : { allowed: true };
  }

  private async tick(
    scope: LimitScope,
    key: string,
    rule: LimitRule,
    now: Date,
  ): Promise<LimitVerdict> {
    // Fetch-or-create. Created at zero, not one: this request is counted by the
    // increment below, and seeding at one would charge the very first caller twice.
    const existing = await this.prisma.chatWidgetRateLimit.upsert({
      where: { scope_key: { scope, key } },
      create: { scope, key, windowStart: now, count: 0 },
      update: {},
    });

    // Still serving a cooldown — refuse without touching the counter, so hammering
    // a blocked endpoint cannot extend the block.
    if (existing.blockedUntil && existing.blockedUntil > now) {
      return { allowed: false, scope, retryAt: existing.blockedUntil };
    }

    const windowExpired = now.getTime() - existing.windowStart.getTime() >= rule.windowMs;
    if (windowExpired) {
      // Fresh window; this request is the first in it.
      await this.prisma.chatWidgetRateLimit.update({
        where: { id: existing.id },
        data: { windowStart: now, count: 1, blockedUntil: null },
      });
      return { allowed: true };
    }

    // `increment` rather than count + 1 so two concurrent turns cannot both read
    // the same value and each write it back as one more.
    const updated = await this.prisma.chatWidgetRateLimit.update({
      where: { id: existing.id },
      data: { count: { increment: 1 } },
    });

    if (updated.count > rule.max) {
      const retryAt = new Date(now.getTime() + rule.cooldownMs);
      await this.prisma.chatWidgetRateLimit.update({
        where: { id: existing.id },
        data: { blockedUntil: retryAt },
      });
      this.logger.warn(
        `Rate limit tripped: scope=${scope} key=${key} count=${updated.count}/${rule.max}, blocked until ${retryAt.toISOString()}`,
      );
      return { allowed: false, scope, retryAt };
    }

    return { allowed: true };
  }
}

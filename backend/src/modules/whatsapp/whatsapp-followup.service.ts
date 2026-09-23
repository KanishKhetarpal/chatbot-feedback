import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrmLeadLookupService } from './crm-lead-lookup.service';
import { McubeClient } from './mcube.client';
import { WhatsappBotService } from './whatsapp-bot.service';
import { WhatsappScoreService } from './whatsapp-score.service';
import {
  BOT_STAGES,
  DEFAULT_RULES,
  FollowupRuleSchema,
  outOfQuietHours,
  PARAM_TOKENS,
  type FollowupRuleInput,
  type FollowupStep,
} from './whatsapp-followup-rules';

const HOUR = 3600_000;
/** The CRM status is re-read at most this often per person. */
const CRM_REFRESH_MS = 30 * 60_000;

type Rule = {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  stages: string[];
  minScore: number | null;
  maxScore: number | null;
  steps: FollowupStep[];
  quietStart: string;
  quietEnd: string;
};

/**
 * The follow-up engine.
 *
 * Every person has at most one ladder: the first active rule whose stages
 * include their current stage. `plan()` works out when the next step is due and
 * stores it on the contact (`nextFollowupAt`); the worker's tick calls
 * `runDue()`, which sends due steps under the same per-person lease the replies
 * use, so a follow-up can never cross a reply.
 *
 * The anchor is Tara's last conversational message: step delays count from it.
 * Their reply clears the plan (the worker answers them instead); Tara's answer
 * sets a new anchor and the ladder starts again from step 1. A stage change
 * (read from the CRM every 30 minutes) switches rule and restarts the ladder.
 */
@Injectable()
export class WhatsappFollowupService implements OnModuleInit {
  private readonly logger = new Logger('WhatsappFollowups');
  private lastCrmSweep = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: WhatsappBotService,
    private readonly crm: CrmLeadLookupService,
    private readonly mcube: McubeClient,
    private readonly scores: WhatsappScoreService,
  ) {}

  async onModuleInit() {
    this.bot.followups = this;
    // The page starts with the sales playbook; after that it is theirs. Seeding
    // only on an empty table is what makes a deletion stick: re-adding a rule
    // by name every boot would quietly undo the owner's edit.
    if ((await this.prisma.whatsappFollowupRule.count()) === 0) {
      for (const rule of DEFAULT_RULES) await this.prisma.whatsappFollowupRule.create({ data: this.toData(rule) });
      this.logger.log(`Created ${DEFAULT_RULES.length} default follow-up rules.`);
    }
  }

  // ── Rules (the admin page) ────────────────────────────────────────────────

  async listRules() {
    const rows = await this.prisma.whatsappFollowupRule.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
    return rows;
  }

  async saveRule(id: string | null, input: unknown) {
    const parsed = FollowupRuleSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`${issue.path.join('.') || 'rule'}: ${issue.message}`);
    }
    const data = this.toData(parsed.data);
    const row = id
      ? await this.prisma.whatsappFollowupRule.update({ where: { id }, data })
      : await this.prisma.whatsappFollowupRule.create({ data });
    await this.replanAll();
    return row;
  }

  async deleteRule(id: string) {
    await this.prisma.whatsappFollowupRule.delete({ where: { id } });
    await this.replanAll();
  }

  /** Stages the page offers: the bot's own, and every status the CRM uses. */
  async stages(): Promise<{ bot: string[]; crm: Array<{ status: string; leads: number }> }> {
    return { bot: [...BOT_STAGES], crm: await this.crm.statuses() };
  }

  /** Who is waiting for which step, soonest first. */
  async upcoming(limit = 100) {
    const rows = await this.prisma.whatsappContact.findMany({
      where: { nextFollowupAt: { not: null } },
      orderBy: { nextFollowupAt: 'asc' },
      take: limit,
      include: { visitor: { select: { name: true, courseInterest: true, custom: true } } },
    });
    const rules = new Map((await this.listRules()).map((r) => [r.id, r]));
    return rows.map((c) => {
      const rule = c.followupRuleId ? rules.get(c.followupRuleId) : undefined;
      const step = rule ? (rule.steps as FollowupStep[])[c.followupCount] : undefined;
      return {
        contactId: c.id,
        waId: c.waId,
        name: c.visitor.name ?? c.profileName,
        stage: c.followupStage,
        rule: rule?.name ?? null,
        step: c.followupCount + 1,
        action: step?.action ?? null,
        goal: step?.goal ?? step?.template?.name ?? null,
        dueAt: c.nextFollowupAt,
        simulated: c.simulated,
      };
    });
  }

  /** Sent, read and replied, per rule and step. */
  async stats() {
    const rows = await this.prisma.$queryRaw<Array<{ ruleId: string; step: number; sent: bigint; read: bigint; replied: bigint }>>`
      SELECT m."followupRuleId" AS "ruleId", m."followupStep" AS step,
             count(*) FILTER (WHERE m."sentAt" IS NOT NULL) AS sent,
             count(*) FILTER (WHERE m."readAt" IS NOT NULL) AS read,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM whatsapp_messages r WHERE r."contactId" = m."contactId" AND r.direction = 'in'
                 AND r."createdAt" > m."createdAt" AND r."createdAt" < m."createdAt" + interval '24 hours')) AS replied
        FROM whatsapp_messages m
       WHERE m."followupRuleId" IS NOT NULL
       GROUP BY 1, 2 ORDER BY 1, 2`;
    return rows.map((r) => ({ ruleId: r.ruleId, step: r.step, sent: Number(r.sent), read: Number(r.read), replied: Number(r.replied) }));
  }

  // ── Planning ──────────────────────────────────────────────────────────────

  /** Work out this person's next follow-up and store it. Never sends. */
  async plan(contactId: string): Promise<void> {
    const c = await this.prisma.whatsappContact.findUnique({ where: { id: contactId }, include: { visitor: true } });
    if (!c) return;
    const stop = () =>
      this.prisma.whatsappContact.update({ where: { id: contactId }, data: { nextFollowupAt: null, followupRuleId: null } });
    if (c.optedOutAt || !c.followupAnchorAt || (c.botPausedUntil && c.botPausedUntil > new Date())) return void (await stop());

    const stage = this.bot.stageOf(c);
    const rule = (await this.activeRules()).find((r) => this.fits(r, stage, c.score));
    if (!rule) {
      await this.prisma.whatsappContact.update({ where: { id: contactId }, data: { nextFollowupAt: null, followupRuleId: null, followupStage: stage } });
      return;
    }
    // A new rule (their stage moved) starts at step 1.
    const count = c.followupRuleId === rule.id ? c.followupCount : 0;
    const step = rule.steps[count];
    const due = step ? outOfQuietHours(new Date(c.followupAnchorAt.getTime() + step.delayHours * HOUR), rule.quietStart, rule.quietEnd) : null;
    await this.prisma.whatsappContact.update({
      where: { id: contactId },
      data: { followupRuleId: rule.id, followupStage: stage, followupCount: count, nextFollowupAt: due },
    });
  }

  /** After a rule edit: every person on a ladder is planned again. */
  private async replanAll() {
    const people = await this.prisma.whatsappContact.findMany({ where: { followupAnchorAt: { not: null }, optedOutAt: null }, select: { id: true } });
    for (const p of people) await this.plan(p.id);
  }

  // ── Sending ───────────────────────────────────────────────────────────────

  /** Called by the worker's tick. Sends every step that is due. */
  async runDue(): Promise<number> {
    await this.sweepCrmStages();
    const due = await this.prisma.whatsappContact.findMany({
      where: { nextFollowupAt: { lte: new Date() }, optedOutAt: null },
      select: { id: true },
      take: 20,
    });
    let sent = 0;
    for (const { id } of due) {
      const ok = await this.bot.withLease(id, () => this.runOne(id)).catch((err) => {
        this.logger.error(`Follow-up for ${id} failed: ${(err as Error)?.message}`);
        return false;
      });
      if (ok) sent++;
    }
    return sent;
  }

  /** Send the due step for one person, then plan the next. Caller holds the lease. */
  async runOne(contactId: string, force = false): Promise<boolean> {
    const c = await this.prisma.whatsappContact.findUnique({ where: { id: contactId }, include: { visitor: true } });
    if (!c || !c.followupRuleId || (!force && (!c.nextFollowupAt || c.nextFollowupAt > new Date()))) return false;

    // They wrote and the worker has not answered yet: the answer comes first.
    const waiting = await this.prisma.whatsappMessage.count({ where: { contactId, direction: 'in', handledAt: null } });
    if (waiting) return false;

    const rule = (await this.activeRules()).find((r) => r.id === c.followupRuleId);
    // Their stage or score moved since planning: re-plan on the right rule instead of sending.
    if (!rule || !this.fits(rule, this.bot.stageOf(c), c.score)) {
      await this.plan(contactId);
      return false;
    }
    const stepNo = c.followupCount;
    const step = rule.steps[stepNo];
    if (!step) {
      await this.prisma.whatsappContact.update({ where: { id: contactId }, data: { nextFollowupAt: null } });
      return false;
    }

    const last = await this.bot.lastOutboundState(contactId);
    let sent = false;
    // A failed send means the number is not reachable this way: stop the ladder.
    if (last?.failed) {
      await this.prisma.whatsappContact.update({ where: { id: contactId }, data: { nextFollowupAt: null } });
      return false;
    }
    const whenOk = step.when === 'always' || (step.when === 'read_no_reply' ? !!last?.read : !last?.read);
    const tag = { ruleId: rule.id, step: stepNo + 1 };

    if (whenOk && step.action === 'ai') {
      if (this.bot.windowOpen(c.lastInboundAt)) {
        await this.bot.sendFollowupAi(contactId, this.instruction(rule, step, stepNo, !!last?.read), tag);
        sent = true;
      } else {
        this.logger.log(`${c.waId}: step ${stepNo + 1} of "${rule.name}" skipped, their 24h window is closed (AI steps need it).`);
      }
    } else if (whenOk && step.action === 'template' && step.template) {
      const approved = (await this.mcube.listTemplates()).data.find((t) => t.name === step.template!.name && t.language === step.template!.language);
      if (approved) {
        const tokens = await this.bot.templateTokens(contactId);
        const params = step.template.params.map((p) => ((PARAM_TOKENS as readonly string[]).includes(p) ? tokens[p] : p)).slice(0, approved.bodyVariables);
        if (params.length === approved.bodyVariables && params.every((p) => p.trim())) {
          await this.bot.sendFollowupTemplate(contactId, { ...approved, params }, tag);
          sent = true;
        } else this.logger.warn(`${c.waId}: template ${approved.name} needs ${approved.bodyVariables} non-empty values; skipped.`);
      } else this.logger.warn(`${c.waId}: template ${step.template.name} is not approved; step skipped.`);
    }

    // Next step (skipped or sent, the ladder moves on), timed from the same anchor.
    await this.prisma.whatsappContact.update({ where: { id: contactId }, data: { followupCount: stepNo + 1 } });
    // Silence after a nudge is itself a signal, so the score moves before the next step is planned.
    await this.scores.rescore(contactId);
    await this.plan(contactId);
    return sent;
  }

  /** The instruction Tara writes a follow-up from. */
  private instruction(rule: Rule, step: FollowupStep, stepNo: number, lastRead: boolean): string {
    return [
      `[FOLLOW-UP ${stepNo + 1} of "${rule.name}". They have not replied since your last message${lastRead ? ', which they read' : ''}.]`,
      `Goal: ${step.goal}`,
      'Write ONE short WhatsApp message toward that goal: one concrete, useful thing tied to what you know about them, then one easy question.',
      'Never mention the silence ("still there", "just checking in", "following up", "no pressure" are banned). Two short lines at most. Buttons only if the question has obvious short answers.',
    ].join('\n');
  }

  /** Every 5 minutes: re-read the CRM status of people on (or eligible for) a ladder. */
  private async sweepCrmStages() {
    if (Date.now() - this.lastCrmSweep < 5 * 60_000) return;
    this.lastCrmSweep = Date.now();
    const stale = await this.prisma.whatsappContact.findMany({
      where: {
        simulated: false,
        optedOutAt: null,
        followupAnchorAt: { gte: new Date(Date.now() - 14 * 24 * HOUR) },
        OR: [{ crmCheckedAt: null }, { crmCheckedAt: { lt: new Date(Date.now() - CRM_REFRESH_MS) } }],
      },
      select: { id: true },
      take: 50,
    });
    for (const { id } of stale) {
      if (await this.bot.refreshCrmStatus(id)) {
        // A new stage: restart the ladder from now on whatever rule fits it.
        await this.prisma.whatsappContact.update({ where: { id }, data: { followupCount: 0, followupAnchorAt: new Date() } });
        await this.plan(id);
      }
    }
  }

  /**
   * Is this the ladder for someone at `stage` with this conversion score?
   * A lead with no score yet is treated as unscored and only matches rules
   * that do not ask for one.
   */
  private fits(rule: Rule, stage: string, score: number | null): boolean {
    if (!rule.stages.includes(stage)) return false;
    if (rule.minScore === null && rule.maxScore === null) return true;
    if (score === null) return false;
    if (rule.minScore !== null && score < rule.minScore) return false;
    if (rule.maxScore !== null && score > rule.maxScore) return false;
    return true;
  }

  private async activeRules(): Promise<Rule[]> {
    const rows = await this.prisma.whatsappFollowupRule.findMany({ where: { active: true }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((r) => ({ ...r, steps: r.steps as unknown as FollowupStep[] }));
  }

  private toData(rule: FollowupRuleInput) {
    return {
      name: rule.name,
      description: rule.description ?? null,
      active: rule.active,
      priority: rule.priority,
      stages: rule.stages,
      minScore: rule.minScore ?? null,
      maxScore: rule.maxScore ?? null,
      steps: rule.steps as object[],
      quietStart: rule.quietStart,
      quietEnd: rule.quietEnd,
    };
  }
}

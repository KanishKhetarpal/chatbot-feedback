import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GuidedFlowSchema,
  type GuidedFlow,
  type GuidedFlowNode,
} from './schemas/guided-flow.schema';

export type StepMode = 'guided' | 'ai' | 'handoff';

export interface StepResult {
  mode: StepMode;
  /** The bot reply for this step. Interpolated + safe to render. */
  answer: string;
  /** The chips to offer next. Empty on `ai` / `handoff` modes and on leaf nodes. */
  next: Array<{ id: string; label: string }>;
  /** The new position in the flow (null once escape_ai fires). */
  currentNodeId: string | null;
  /** Kept for API compatibility with the CRM widget — this app creates no tasks. */
  callbackTaskCreated: boolean;
}

interface VisitorForStep {
  id: string;
  agentId: string;
  handoffAt: Date | null;
  guidedFlowExitedAt: Date | null;
  custom: unknown;
  fieldSources: unknown;
  timezone: string | null;
  name: string | null;
  phone?: string | null;
}

interface AgentForStep {
  id: string;
  name: string;
  guidedFlow: unknown;
  handoffMessage: string | null;
}

/**
 * The guided-flow runtime — one call per chip click. No AI call happens here:
 * a chip resolves against the admin's own tree, writes two transcript rows and
 * moves the visitor's cursor.
 */
@Injectable()
export class GuidedFlowRuntimeService {
  private readonly logger = new Logger(GuidedFlowRuntimeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveStep(input: {
    agent: AgentForStep;
    visitor: VisitorForStep;
    nodeId: string;
  }): Promise<StepResult> {
    const { agent, visitor, nodeId } = input;

    if (nodeId === 'escape_ai') {
      if (this.parseFlow(agent)?.noAi) {
        throw new BadRequestException({ error: 'unknown_node', message: 'This chatbot answers from its menu only.' });
      }
      return this.handleEscapeAi(visitor);
    }
    if (nodeId === 'escape_human') return this.handleEscapeHuman(agent, visitor);

    const flow = this.parseFlow(agent);
    if (!flow) {
      throw new BadRequestException({
        error: 'guided_flow_unavailable',
        message: 'This chatbot has no active guided flow.',
      });
    }

    if (nodeId === 'mark_intl_yes' || nodeId === 'mark_intl_no') {
      return this.handleMarkIntl(flow, visitor, nodeId);
    }

    const node = flow.nodes[nodeId];
    if (!node) {
      throw new BadRequestException({
        error: 'unknown_node',
        message: `Node "${nodeId}" is not part of this chatbot's flow.`,
      });
    }

    let answer = interpolate(pickVariant(node.answer), this.buildFacts(visitor));

    // Rule-based lead capture: every so often, while no number has been left,
    // the answer carries the lead form (with a "not now" way to keep going).
    const custom = { ...(((visitor.custom ?? {}) as Record<string, unknown>) || {}) };
    const answered = (Number(custom.guidedAnswers) || 0) + 1;
    custom.guidedAnswers = answered;
    const capture = flow.capture;
    const gated = Boolean(capture?.gateAfter && capture.gatePrompt && !visitor.phone && answered >= capture.gateAfter);
    if (gated) {
      answer = `${answer}\n\n${interpolate(capture!.gatePrompt!, this.buildFacts(visitor))}`;
    } else if (capture && !visitor.phone) {
      const shown = Number(custom.captureShown) || 0;
      if (typeof custom.captureAt !== 'number') {
        const lo = Math.min(capture.afterMin, capture.afterMax);
        const hi = Math.max(capture.afterMin, capture.afterMax);
        custom.captureAt = lo + Math.floor(Math.random() * (hi - lo + 1));
      }
      if (answered >= (custom.captureAt as number) && shown < capture.maxTimes) {
        if (/<ui>/.test(answer)) {
          // This answer already asks for something; try again on the next one.
          custom.captureAt = answered + 1;
        } else {
          const prompt = capture.prompts[shown % capture.prompts.length];
          answer = `${answer}\n\n${interpolate(prompt, this.buildFacts(visitor))}`;
          custom.captureShown = shown + 1;
          custom.captureAt = answered + capture.repeatEvery;
        }
      }
    }

    await this.prisma.$transaction([
      this.prisma.chatWidgetMessage.create({
        data: { visitorId: visitor.id, role: 'user', content: node.label, chipNodeId: node.id },
      }),
      this.prisma.chatWidgetMessage.create({
        data: { visitorId: visitor.id, role: 'assistant', content: answer, chipNodeId: node.id },
      }),
      this.prisma.chatWidgetVisitor.update({
        where: { id: visitor.id },
        data: {
          currentNodeId: node.id,
          lastSeenAt: new Date(),
          messageCount: { increment: 2 },
          custom: custom as unknown as object,
        },
      }),
    ]);

    // A node with nowhere to go hands back the topic menu, so nobody is stuck.
    const next = this.materialiseNext(flow, node);
    return {
      mode: 'guided',
      answer,
      // Details are compulsory from here: the form is the only way forward.
      next: gated ? [] : next.length ? next : this.rootChips(flow),
      currentNodeId: node.id,
      callbackTaskCreated: false,
    };
  }

  private async handleEscapeAi(visitor: VisitorForStep): Promise<StepResult> {
    const marker = 'Sure. Type your question below and I will answer it.';
    await this.prisma.$transaction([
      this.prisma.chatWidgetMessage.create({
        data: { visitorId: visitor.id, role: 'assistant', content: marker, chipNodeId: 'escape_ai' },
      }),
      this.prisma.chatWidgetVisitor.update({
        where: { id: visitor.id },
        data: {
          currentNodeId: null,
          guidedFlowExitedAt: new Date(),
          lastSeenAt: new Date(),
          messageCount: { increment: 1 },
        },
      }),
    ]);
    return { mode: 'ai', answer: marker, next: [], currentNodeId: null, callbackTaskCreated: false };
  }

  private async handleEscapeHuman(agent: AgentForStep, visitor: VisitorForStep): Promise<StepResult> {
    const message =
      agent.handoffMessage?.trim() ||
      'Someone from our team will get in touch with you shortly. Feel free to keep chatting in the meantime.';

    await this.prisma.$transaction([
      this.prisma.chatWidgetMessage.create({
        data: { visitorId: visitor.id, role: 'assistant', content: message, chipNodeId: 'escape_human' },
      }),
      this.prisma.chatWidgetVisitor.update({
        where: { id: visitor.id },
        data: { handoffAt: new Date(), currentNodeId: null, lastSeenAt: new Date(), messageCount: { increment: 1 } },
      }),
    ]);

    return { mode: 'handoff', answer: message, next: [], currentNodeId: null, callbackTaskCreated: false };
  }

  /**
   * The international-detection chips. Both write `custom.isIntl`; `mark_intl_no`
   * also implies `custom.country = "India"` unless a stronger source set it.
   * (The CRM derives the country from the timezone against its ERP list — this
   * app has no ERP, so `mark_intl_yes` records the fact and lets the bot ask.)
   */
  private async handleMarkIntl(
    flow: GuidedFlow,
    visitor: VisitorForStep,
    nodeId: 'mark_intl_yes' | 'mark_intl_no',
  ): Promise<StepResult> {
    const isYes = nodeId === 'mark_intl_yes';
    const chipLabel = isYes ? flow.markIntlYesLabel : flow.markIntlNoLabel;
    const ackMessage = isYes ? flow.markIntlYesAck : flow.markIntlNoAck;

    const currentCustom = ((visitor.custom ?? {}) as Record<string, unknown>) || {};
    const currentSources = ((visitor.fieldSources ?? {}) as Record<string, string>) || {};
    const nextCustom: Record<string, unknown> = { ...currentCustom, isIntl: isYes };
    const nextSources: Record<string, string> = { ...currentSources, 'custom.isIntl': 'implied' };

    if (!isYes) {
      const currentCountry = typeof currentCustom.country === 'string' ? currentCustom.country : null;
      const currentCountrySource = currentSources['custom.country'];
      if (!currentCountry || currentCountrySource === 'derived' || !currentCountrySource) {
        nextCustom.country = 'India';
        nextSources['custom.country'] = 'implied';
      }
    }

    await this.prisma.$transaction([
      this.prisma.chatWidgetMessage.create({
        data: { visitorId: visitor.id, role: 'user', content: chipLabel, chipNodeId: nodeId },
      }),
      this.prisma.chatWidgetMessage.create({
        data: { visitorId: visitor.id, role: 'assistant', content: ackMessage, chipNodeId: nodeId },
      }),
      this.prisma.chatWidgetVisitor.update({
        where: { id: visitor.id },
        data: {
          custom: nextCustom as unknown as object,
          fieldSources: nextSources as unknown as object,
          currentNodeId: nodeId,
          lastSeenAt: new Date(),
          messageCount: { increment: 2 },
        },
      }),
    ]);

    return {
      mode: 'guided',
      answer: ackMessage,
      next: this.rootChips(flow),
      currentNodeId: nodeId,
      callbackTaskCreated: false,
    };
  }

  private parseFlow(agent: AgentForStep): GuidedFlow | null {
    if (!agent.guidedFlow) return null;
    const parsed = GuidedFlowSchema.safeParse(agent.guidedFlow);
    if (!parsed.success) {
      this.logger.warn(`Agent ${agent.id} has a corrupt guidedFlow — falling back`);
      return null;
    }
    return parsed.data;
  }

  private chipFor(flow: GuidedFlow, id: string) {
    if (id === 'escape_ai') return { id, label: flow.escapeToAiLabel };
    if (id === 'escape_human') return { id, label: flow.escapeToHumanLabel };
    if (id === 'mark_intl_yes') return { id, label: flow.markIntlYesLabel };
    if (id === 'mark_intl_no') return { id, label: flow.markIntlNoLabel };
    const target = flow.nodes[id];
    return target ? { id: target.id, label: target.label } : null;
  }

  private rootChips(flow: GuidedFlow) {
    return flow.rootIds
      .map((id) => this.chipFor(flow, id))
      .filter((chip): chip is { id: string; label: string } => chip !== null);
  }

  private materialiseNext(flow: GuidedFlow, node: GuidedFlowNode) {
    return node.next
      .map((id) => this.chipFor(flow, id))
      .filter((chip): chip is { id: string; label: string } => chip !== null);
  }

  /** Facts available for merge tokens in a node's answer. */
  private buildFacts(visitor: VisitorForStep): Record<string, unknown> {
    const custom = ((visitor.custom ?? {}) as Record<string, unknown>) || {};
    const firstName = visitor.name ? visitor.name.trim().split(/\s+/)[0] : undefined;
    return { ...(firstName ? { firstName, name: visitor.name } : {}), ...custom };
  }
}

/**
 * An answer may hold several wordings separated by a line containing only
 * `~~~`; one is picked at random so repeat visitors do not see a script.
 */
export function pickVariant(answer: string): string {
  const variants = answer.split(/\n\s*~~~\s*\n/).map((v) => v.trim()).filter(Boolean);
  return variants.length ? variants[Math.floor(Math.random() * variants.length)] : answer;
}

/**
 * Answer merge-token interpolation: `{{fieldName}}` or `{{fieldName|fallback}}`.
 * A missing/blank field with no fallback resolves to an empty string.
 */
export function interpolate(template: string, facts: Record<string, unknown>): string {
  return template.replace(
    /\{\{([a-zA-Z][a-zA-Z0-9_]*)(?:\|([^}]*))?\}\}/g,
    (_match, key: string, fallback?: string) => {
      const value = facts[key];
      if (value === null || value === undefined) return fallback ?? '';
      if (typeof value === 'boolean') return value ? 'yes' : 'no';
      const str = String(value).trim();
      return str || (fallback ?? '');
    },
  );
}

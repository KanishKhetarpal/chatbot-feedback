import { timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import { IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { McubeClient } from './mcube.client';
import { WhatsappAnalyticsService } from './whatsapp-analytics.service';
import { WhatsappBotService } from './whatsapp-bot.service';
import { WhatsappFollowupService } from './whatsapp-followup.service';
import { captureTransport, liveTransport, WhatsappSenderService } from './whatsapp-sender.service';

class SimulateDto {
  @Matches(/^\d{8,15}$/) waId!: string;
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
  @IsOptional() @IsString() @MaxLength(80) optionId?: string;
  @IsOptional() @IsString() @MaxLength(80) profileName?: string;
  /** Send the replies to the real phone through Mcube. */
  @IsOptional() @IsBoolean() live?: boolean;
}

class SimulateStatusDto {
  @IsString() messageId!: string;
  @IsIn(['delivered', 'read', 'failed']) status!: 'delivered' | 'read' | 'failed';
}

class AnalyticsQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() includeSimulated?: boolean;
}

class StartConversationDto {
  @Matches(/^\d{10,15}$/) waId!: string;
  @IsString() @MaxLength(120) template!: string;
  @IsString() @MaxLength(20) language!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) params?: string[];
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  /** What they enquired about, for the opener. */
  @IsOptional() @IsString() @MaxLength(80) course?: string;
  /** false = simulator: stored and drawn, not sent. */
  @IsOptional() @IsBoolean() live?: boolean;
}

class StaffReplyDto {
  @IsString() @MaxLength(4000) text!: string;
}

/**
 * WhatsApp channel routes.
 *
 *   POST /whatsapp/webhook                      PUBLIC. Mcube posts here (x-webhook-secret)
 *   GET  /whatsapp/status                       readiness checks
 *   GET  /whatsapp/analytics                    receipts funnel, taps, handoffs
 *   GET  /whatsapp/contacts                     people on WhatsApp, newest first
 *   GET  /whatsapp/contacts/:id                 one contact with every message and its receipts
 *   GET  /whatsapp/templates                    approved templates that can open a conversation
 *   POST /whatsapp/contacts/start               open a conversation with an approved template
 *   POST /whatsapp/contacts/:id/reply           a counsellor answers in the thread
 *   POST /whatsapp/contacts/:id/release         hand the thread back to the bot
 *   POST /whatsapp/simulate                     run a turn without sending anything
 *   POST /whatsapp/simulate/status              fake a receipt on a simulated message
 *   POST /whatsapp/simulate/followup/:waId      send a simulated contact's next follow-up now
 */
@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly bot: WhatsappBotService,
    private readonly sender: WhatsappSenderService,
    private readonly analytics: WhatsappAnalyticsService,
    private readonly mcube: McubeClient,
    private readonly prisma: PrismaService,
    private readonly followups: WhatsappFollowupService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mcube inbound messages and delivery receipts' })
  webhook(@Body() body: unknown, @Headers('x-webhook-secret') secret?: string) {
    const expected = process.env.MCUBE_WEBHOOK_SECRET ?? '';
    if (expected) {
      const a = Buffer.from(secret ?? '');
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('bad webhook secret');
    } else if (process.env.NODE_ENV === 'production') {
      // An open webhook lets anyone make the bot message any number on the allowlist.
      throw new UnauthorizedException('MCUBE_WEBHOOK_SECRET is not set');
    }
    return this.bot.ingest(body);
  }

  @Roles(Role.ADMIN)
  @Get('status')
  async status() {
    const allowlist = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '').trim();
    const templates = await this.mcube.listTemplates();
    const agent = process.env.WHATSAPP_AGENT_ID
      ? await this.prisma.chatAgent.findUnique({ where: { id: process.env.WHATSAPP_AGENT_ID }, select: { id: true, name: true, activePackId: true } })
      : await this.prisma.chatAgent.findFirst({
          where: { name: { contains: 'WhatsApp', mode: 'insensitive' }, activePackId: { not: null } },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, name: true, activePackId: true },
        });
    const publicUrl = (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, '');
    return {
      checks: {
        mcubeConfigured: this.mcube.isConfigured(),
        mcubeReachable: templates.ok,
        webhookSecret: !!process.env.MCUBE_WEBHOOK_SECRET,
        agentTrained: !!agent?.activePackId,
        aiConfigured: !!process.env.ANTHROPIC_API_KEY,
        botEnabled: process.env.WHATSAPP_BOT_ENABLED !== 'false',
        followupsEnabled: process.env.WHATSAPP_FOLLOWUPS_ENABLED !== 'false',
      },
      agent: agent ? { id: agent.id, name: agent.name } : null,
      interactiveMode: this.mcube.interactiveMode(),
      allowlist: allowlist === '*' ? 'everyone' : allowlist ? allowlist.split(',').length + ' number(s)' : 'nobody (live sends blocked)',
      callbackUrl: publicUrl ? `${publicUrl}/api/v1/whatsapp/webhook` : null,
      approvedTemplates: templates.data.filter((t) => t.status === 'APPROVED').map((t) => ({ name: t.name, language: t.language, category: t.category })),
      templatesError: templates.error ?? null,
    };
  }

  @Roles(Role.ADMIN)
  @Get('templates')
  async templates() {
    const { data, error } = await this.mcube.listTemplates();
    return {
      error: error ?? null,
      templates: data
        .filter((t) => t.category !== 'AUTHENTICATION')
        .map((t) => ({
          ...t,
          // A media header needs a file on every send; the opener sends none.
          usable: !t.headerFormat || t.headerFormat === 'TEXT',
        })),
    };
  }

  @Roles(Role.ADMIN)
  @Post('contacts/start')
  @HttpCode(200)
  async start(@Body() dto: StartConversationDto) {
    const { data } = await this.mcube.listTemplates();
    const template = data.find((t) => t.name === dto.template && t.language === dto.language);
    if (!template) throw new BadRequestException({ message: 'No approved template with that name and language.', error: 'unknown_template' });
    const params = (dto.params ?? []).map((p) => p.trim());
    // Meta refuses a blank or a missing parameter, and Mcube reports that refusal as success.
    if (params.length !== template.bodyVariables || params.some((p) => !p)) {
      throw new BadRequestException({
        message: `${template.name} needs ${template.bodyVariables} non-empty value(s) for its {{n}} blanks.`,
        error: 'template_params',
      });
    }
    return this.bot.startConversation({
      waId: dto.waId,
      name: dto.name,
      course: dto.course,
      template,
      bodyParams: params,
      live: dto.live !== false,
    });
  }

  @Roles(Role.ADMIN)
  @Get('style-notes')
  styleNotes() {
    return this.prisma.whatsappStyleNote.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Roles(Role.ADMIN)
  @Post('style-notes/:id/toggle')
  @HttpCode(200)
  async toggleStyleNote(@Param('id') id: string) {
    const row = await this.prisma.whatsappStyleNote.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('No such note');
    return this.prisma.whatsappStyleNote.update({ where: { id }, data: { active: !row.active } });
  }

  // ── Follow-up rules (the admin page) ────────────────────────────────────

  @Roles(Role.ADMIN)
  @Get('followup-rules')
  followupRules() {
    return this.followups.listRules();
  }

  @Roles(Role.ADMIN)
  @Get('followup-stages')
  followupStages() {
    return this.followups.stages();
  }

  @Roles(Role.ADMIN)
  @Post('followup-rules')
  @HttpCode(200)
  async createFollowupRule(@Body() body: Record<string, unknown>) {
    try {
      return await this.followups.saveRule(null, body);
    } catch (err) {
      throw new BadRequestException({ message: (err as Error).message, error: 'invalid_rule' });
    }
  }

  @Roles(Role.ADMIN)
  @Post('followup-rules/:id')
  @HttpCode(200)
  async updateFollowupRule(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    try {
      return await this.followups.saveRule(id, body);
    } catch (err) {
      throw new BadRequestException({ message: (err as Error).message, error: 'invalid_rule' });
    }
  }

  @Roles(Role.ADMIN)
  @Post('followup-rules/:id/delete')
  @HttpCode(200)
  async deleteFollowupRule(@Param('id') id: string) {
    await this.followups.deleteRule(id);
    return { ok: true };
  }

  @Roles(Role.ADMIN)
  @Get('followups/upcoming')
  upcomingFollowups() {
    return this.followups.upcoming();
  }

  @Roles(Role.ADMIN)
  @Get('followups/stats')
  followupStats() {
    return this.followups.stats();
  }

  @Roles(Role.ADMIN)
  @Get('analytics')
  analyticsSummary(@Query() q: AnalyticsQueryDto) {
    return this.analytics.summary({
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      includeSimulated: q.includeSimulated,
    });
  }

  @Roles(Role.ADMIN)
  @Get('contacts')
  async contacts(@Query('simulated') simulated?: string) {
    const rows = await this.prisma.whatsappContact.findMany({
      where: simulated === 'true' ? {} : { simulated: false },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: { visitor: { select: { name: true, courseInterest: true, location: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      waId: c.waId,
      name: c.visitor.name ?? c.profileName,
      courseInterest: c.visitor.courseInterest,
      city: c.visitor.location,
      stage: c.stage,
      score: c.score,
      scoreBand: c.scoreBand,
      handoffReason: c.handoffReason,
      handoffAt: c.handoffAt,
      botPausedUntil: c.botPausedUntil,
      optedOutAt: c.optedOutAt,
      lastInboundAt: c.lastInboundAt,
      nextFollowupAt: c.nextFollowupAt,
      followupCount: c.followupCount,
      simulated: c.simulated,
      visitorId: c.visitorId,
    }));
  }

  @Roles(Role.ADMIN)
  @Get('contacts/:id')
  async contact(@Param('id') id: string) {
    const contact = await this.prisma.whatsappContact.findFirst({
      where: { OR: [{ id }, { waId: id }] },
      include: { visitor: true, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!contact) throw new NotFoundException('No such WhatsApp contact');
    return contact;
  }

  @Roles(Role.ADMIN)
  @Post('contacts/:id/reply')
  @HttpCode(200)
  async staffReply(@Param('id') id: string, @Body() dto: StaffReplyDto) {
    const contact = await this.prisma.whatsappContact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('No such WhatsApp contact');
    const transcript = await this.prisma.chatWidgetMessage.create({
      data: { visitorId: contact.visitorId, role: 'assistant', content: `[counsellor] ${dto.text}` },
      select: { id: true },
    });
    const transport = contact.simulated ? captureTransport() : liveTransport();
    const result = await this.sender.deliver(contact, [{ kind: 'text', body: dto.text }], 'system', transport, transcript.id);
    // A person answering keeps the bot out of the way for the rest of the day.
    await this.prisma.whatsappContact.update({
      where: { id },
      data: { botPausedUntil: new Date(Date.now() + 12 * 60 * 60 * 1000), nextFollowupAt: null },
    });
    return { ...result, outbound: transport.captured };
  }

  @Roles(Role.ADMIN)
  @Post('contacts/:id/restart')
  @HttpCode(200)
  async restart(@Param('id') id: string, @Body() body: { course?: string }) {
    try {
      return await this.bot.restartConversation(id, body?.course?.trim() || null);
    } catch (err) {
      throw new BadRequestException({ message: (err as Error).message, error: 'window_closed' });
    }
  }

  @Roles(Role.ADMIN)
  @Post('contacts/:id/release')
  @HttpCode(200)
  async release(@Param('id') id: string) {
    await this.prisma.whatsappContact.update({ where: { id }, data: { botPausedUntil: null } });
    return this.bot.sendMenu(id);
  }

  @Roles(Role.ADMIN)
  @Post('simulate')
  @HttpCode(200)
  simulate(@Body() dto: SimulateDto) {
    return this.bot.simulate(dto);
  }

  @Roles(Role.ADMIN)
  @Post('simulate/status')
  @HttpCode(200)
  async simulateStatus(@Body() dto: SimulateStatusDto) {
    const row = await this.prisma.whatsappMessage.findUnique({ where: { id: dto.messageId }, select: { providerMessageId: true, provider: true } });
    if (!row?.providerMessageId || row.provider !== 'simulator') throw new NotFoundException('Not a simulated message');
    const applied = await this.sender.applyStatus(
      { providerMessageId: row.providerMessageId, status: dto.status, timestamp: new Date(), error: dto.status === 'failed' ? 'simulated failure' : null },
      'simulator',
    );
    return { applied };
  }

  @Roles(Role.ADMIN)
  @Post('simulate/followup/:waId')
  @HttpCode(200)
  async simulateFollowup(@Param('waId') waId: string) {
    const contact = await this.prisma.whatsappContact.findUnique({ where: { waId } });
    if (!contact?.simulated) throw new NotFoundException('Not a simulated contact');
    const sent = await this.bot.withLease(contact.id, () => this.followups.runOne(contact.id, true), 30_000);
    const latest = await this.prisma.whatsappMessage.findMany({
      where: { contactId: contact.id, direction: 'out', source: 'followup' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    return sent ? { outbound: latest.map((m) => ({ ...(m.payload as object), messageId: m.id })) } : { outbound: [], skipped: true };
  }
}

import { Body, Controller, Get, Headers, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import {
  WidgetChatDto,
  WidgetConfigQueryDto,
  WidgetLeadDto,
  WidgetSessionDto,
  WidgetStepDto,
} from './dto/widget-chat.dto';
import { WidgetConversationFeedbackDto, WidgetMessageFeedbackDto } from './dto/widget-feedback.dto';
import { WidgetService, type RequestContext } from './widget.service';

/**
 * The visitor's environment, read from the request rather than the body.
 *
 * `userId` is present when the caller sent a valid Bearer token — the global
 * JwtAuthGuard validates it opportunistically on `@Public()` routes — which is
 * how an in-app conversation gets attributed to the signed-in tester.
 */
function readRequestContext(req: Request): RequestContext {
  const user = (req as Request & { user?: { userId?: string } }).user;
  return {
    ip: req.ip,
    forwardedFor: req.headers['x-forwarded-for'] as string | undefined,
    userAgent: req.headers['user-agent'],
    acceptLanguage: req.headers['accept-language'],
    userId: user?.userId,
  };
}

/**
 * The public face of a chatbot: share links, the in-app chat page and embedded
 * widgets all use these routes. `@Public()` — a share-link visitor has no
 * account. Gates: the app's own origin (or the bot's allowedOrigins), the signed
 * visitor token, per-visitor and per-bot rate limits, and the per-IP throttle.
 */
@ApiTags('widget')
@Public()
@UseGuards(ThrottlerGuard)
@Controller('widget')
export class WidgetController {
  constructor(private readonly widget: WidgetService) {}

  @Get('config')
  @ApiOperation({ summary: 'Fetch the chatbot’s appearance (no side effects)' })
  @ApiResponse({ status: 200, description: '{ agent, guidedFlow }' })
  config(@Query() query: WidgetConfigQueryDto, @Headers('origin') origin?: string) {
    return this.widget.config(query.publicKey, origin);
  }

  @Post('session')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start or resume a visitor session' })
  session(@Body() dto: WidgetSessionDto, @Req() req: Request, @Headers('origin') origin?: string) {
    return this.widget.session(dto, origin, readRequestContext(req));
  }

  @Post('step')
  @HttpCode(200)
  @ApiOperation({ summary: 'Visitor picked a chip in the guided flow (no AI cost)' })
  step(@Body() dto: WidgetStepDto, @Req() req: Request, @Headers('origin') origin?: string) {
    return this.widget.step(dto, origin, readRequestContext(req));
  }

  @Post('chat')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Ask the chatbot a question',
    description:
      'Send `publicKey` on the first message and `visitorToken` after that. The reply carries ' +
      '`assistantMessageId` so it can be rated with POST /widget/feedback/message.',
  })
  async chat(@Body() dto: WidgetChatDto, @Req() req: Request, @Headers('origin') origin?: string) {
    const result = await this.widget.chat(dto, origin, readRequestContext(req));
    const { reply, limited, retryAt, visitorToken, assistantMessageId } = result;
    // The lead form the server adds after some replies, as a second bot message.
    const followup = 'followup' in result ? (result.followup ?? null) : null;
    // `usage` stays server-side — it would tell an anonymous caller how large the knowledge base is.
    return { reply, limited, retryAt, visitorToken, assistantMessageId, followup };
  }

  @Post('lead')
  @HttpCode(200)
  @ApiOperation({ summary: 'Visitor left their name / phone / email' })
  lead(@Body() dto: WidgetLeadDto, @Req() req: Request, @Headers('origin') origin?: string) {
    return this.widget.captureLead(dto, origin, readRequestContext(req));
  }

  @Post('feedback/message')
  @HttpCode(200)
  @ApiOperation({ summary: 'Thumbs up / down on one reply (send rating null to clear)' })
  rateMessage(@Body() dto: WidgetMessageFeedbackDto) {
    return this.widget.rateMessage(dto);
  }

  @Post('feedback/conversation')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rate the whole conversation 1–5 with an optional comment' })
  rateConversation(@Body() dto: WidgetConversationFeedbackDto) {
    return this.widget.rateConversation(dto);
  }
}

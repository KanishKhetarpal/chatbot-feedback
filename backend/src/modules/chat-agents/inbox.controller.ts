import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CHAT_AGENT_ROLES } from './chat-agents.constants';
import { ListInboxQueryDto } from './dto/list-inbox-query.dto';
import { ReviewThreadDto } from './dto/review-thread.dto';
import { InboxService } from './inbox.service';

class AgentScopeQueryDto {
  @IsOptional()
  @IsUUID()
  agentId?: string;
}

/**
 * Admin-only read (and review) of the recorded conversations. Separate from
 * `WidgetController`, which is public.
 */
@ApiTags('widget-inbox')
@ApiBearerAuth()
@Roles(...CHAT_AGENT_ROLES)
@Controller('widget-inbox')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  @ApiOperation({ summary: 'Conversations, most recently active first' })
  list(@Query() query: ListInboxQueryDto) {
    return this.inbox.listThreads(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Feedback headline numbers (all chatbots or one)' })
  stats(@Query() query: AgentScopeQueryDto) {
    return this.inbox.stats(query.agentId);
  }

  @Get('export')
  @ApiOperation({ summary: 'Every conversation with its messages, as JSON (all chatbots or one)' })
  export(@Query() query: AgentScopeQueryDto) {
    return this.inbox.exportThreads(query.agentId);
  }

  @Get(':visitorId')
  @ApiParam({ name: 'visitorId' })
  @ApiOperation({ summary: 'One conversation in full, with per-message feedback and usage' })
  getOne(@Param('visitorId', ParseUUIDPipe) visitorId: string) {
    return this.inbox.getThread(visitorId);
  }

  @Patch(':visitorId/review')
  @ApiParam({ name: 'visitorId' })
  @ApiOperation({ summary: 'Mark a conversation reviewed / flagged and leave a note' })
  review(
    @Param('visitorId', ParseUUIDPipe) visitorId: string,
    @Body() dto: ReviewThreadDto,
    @CurrentUser('userId') reviewerId: string,
  ) {
    return this.inbox.review(visitorId, dto, reviewerId);
  }

  @Delete(':visitorId')
  @ApiParam({ name: 'visitorId' })
  @ApiOperation({ summary: 'Delete a conversation and its messages (permanent)' })
  remove(@Param('visitorId', ParseUUIDPipe) visitorId: string) {
    return this.inbox.remove(visitorId);
  }
}

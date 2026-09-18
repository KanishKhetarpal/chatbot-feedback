import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CHAT_AGENT_OPTIONS, CHAT_AGENT_ROLES, CHAT_USER_ROLES } from './chat-agents.constants';
import { ChatAgentsService } from './chat-agents.service';
import { CreateChatAgentDto } from './dto/create-chat-agent.dto';
import { TestChatAgentDto } from './dto/test-chat-agent.dto';
import { UpdateChatAgentDto } from './dto/update-chat-agent.dto';
import { UpdateGuidedFlowDto } from './dto/update-guided-flow.dto';
import { TrainingService } from './training.service';
import { WidgetService } from './widget.service';

@ApiTags('chat-agents')
@ApiBearerAuth()
@Roles(...CHAT_AGENT_ROLES)
@Controller('chat-agents')
export class ChatAgentsController {
  constructor(
    private readonly chatAgents: ChatAgentsService,
    private readonly training: TrainingService,
    // The staff "try it" route deliberately reuses the widget's answering code
    // so a passing test says something about the live path, not a parallel one.
    private readonly widget: WidgetService,
  ) {}

  @Get('options')
  @ApiOperation({
    summary: 'Form options',
    description:
      'Dropdown choices for the agent settings screen. Call this — do not hardcode model IDs.',
  })
  @ApiResponse({ status: 200, description: 'Models, tones, lead-capture modes, etc.' })
  options() {
    return CHAT_AGENT_OPTIONS;
  }

  @Get('available')
  @Roles(...CHAT_USER_ROLES)
  @ApiOperation({
    summary: 'Chatbots any signed-in account may talk to',
    description: 'Active chatbots only, presentation fields only — what the gallery draws for a tester.',
  })
  async available() {
    return { agents: await this.chatAgents.listAvailable() };
  }

  @Get()
  @ApiOperation({ summary: 'List chat agents' })
  @ApiResponse({ status: 200, description: '{ agents }' })
  async list() {
    return { agents: await this.chatAgents.list() };
  }

  @Post()
  @ApiOperation({ summary: 'Create a chat agent', description: 'Starts as draft. PATCH to configure.' })
  @ApiResponse({ status: 201, description: '{ agent }' })
  async create(@Body() dto: CreateChatAgentDto, @CurrentUser('userId') userId: string) {
    return { agent: await this.chatAgents.create(dto, userId) };
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Chat agent UUID' })
  @ApiOperation({ summary: 'Get one chat agent' })
  @ApiResponse({ status: 200, description: '{ agent }' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return { agent: await this.chatAgents.getOne(id) };
  }

  @Patch(':id')
  @ApiParam({ name: 'id', description: 'Chat agent UUID' })
  @ApiOperation({ summary: 'Update a chat agent', description: 'Partial — send only changed fields. Arrays replace wholesale. Optional strings accept null to clear.' })
  @ApiResponse({ status: 200, description: '{ agent }' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChatAgentDto) {
    return { agent: await this.chatAgents.update(id, dto) };
  }

  @Delete(':id')
  @ApiParam({ name: 'id', description: 'Chat agent UUID' })
  @ApiOperation({
    summary: 'Delete a chat agent',
    description:
      'Permanent, and it takes the whole knowledge base with it: every source, its chunks, every compiled ' +
      'pack, and the uploaded files behind them. Widget conversations go too — visitors and their messages. ' +
      'None of it is recoverable. Pause a live agent before deleting it.',
  })
  @ApiResponse({ status: 200, description: '{ id, name, deleted } — counts of what went with it' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiResponse({ status: 409, description: 'agent_active — pause it first' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.chatAgents.remove(id);
  }

  @Post(':id/train')
  @HttpCode(200)
  @ApiParam({ name: 'id', description: 'Chat agent UUID' })
  @ApiOperation({
    summary: 'Train the agent',
    description:
      'Compiles every enabled, ready knowledge source into the pack the agent answers from. ' +
      'Changes no model weights. Safe to call repeatedly — each run produces a new version.',
  })
  @ApiResponse({ status: 200, description: '{ pack, training }' })
  @ApiResponse({ status: 400, description: 'no_knowledge, or knowledge_too_large with a per-source breakdown' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiResponse({ status: 409, description: 'training_in_progress — a concurrent run won the race' })
  @ApiResponse({ status: 503, description: 'ai_not_configured — ANTHROPIC_API_KEY is unset' })
  train(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.training.train(id, userId);
  }

  @Post(':id/test')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiParam({ name: 'id', description: 'Chat agent UUID' })
  @ApiOperation({
    summary: 'Try the agent',
    description:
      'Ask the agent a question from the dashboard. Runs the same knowledge pack, prompt and model as the ' +
      'live widget, but works on draft and paused agents and does not touch the widget rate limits. ' +
      'Returns the diagnostics the public endpoint hides: token usage, cache behaviour, latency, and whether ' +
      'the pack that answered is already out of date.',
  })
  @ApiResponse({ status: 200, description: '{ reply, agent, pack, training, usage, latencyMs }' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiResponse({ status: 409, description: 'not_trained — train the agent first' })
  @ApiResponse({ status: 503, description: 'ai_not_configured' })
  test(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestChatAgentDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.widget.preview(id, dto, userId);
  }

  @Get(':id/pack')
  @ApiParam({ name: 'id', description: 'Chat agent UUID' })
  @ApiOperation({
    summary: 'The compiled knowledge pack',
    description:
      'Exactly what the agent knows, verbatim as sent to the model. The fastest way to debug a wrong answer.',
  })
  @ApiResponse({ status: 200, description: 'Pack metadata and content' })
  @ApiResponse({ status: 404, description: 'Agent not found, or not_trained' })
  getPack(@Param('id', ParseUUIDPipe) id: string) {
    return this.training.getPack(id);
  }

  @Put(':id/guided-flow')
  @ApiParam({ name: 'id', description: 'Chat agent UUID' })
  @ApiOperation({
    summary: 'Save the guided chip flow tree',
    description:
      'Replaces the full tree in one write. Send the body from the admin editor exactly as it edits — ' +
      'rootIds, escape labels, and the nodes dictionary. Server validates shape (zod) and semantics ' +
      '(cycles, orphans, missing refs, reserved-id misuse) and returns 400 with the FULL issue list on ' +
      'failure — the accordion editor renders every issue inline in one round-trip. Send the request ' +
      'body as `null` (or omit the body) to CLEAR the flow — the widget falls back to the legacy ' +
      'preset-chip behaviour, which is a supported off-state.',
  })
  @ApiResponse({ status: 200, description: '{ agentId, guidedFlow, cleared }' })
  @ApiResponse({ status: 400, description: 'validation_failed OR guided_flow_invalid — full issue list attached' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async updateGuidedFlow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGuidedFlowDto | null,
  ) {
    return this.chatAgents.updateGuidedFlow(id, dto);
  }
}

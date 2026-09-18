import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { AGENT_STATUSES } from '../chat-agent-models';
import { CreateChatAgentDto } from './create-chat-agent.dto';

export class UpdateChatAgentDto extends PartialType(CreateChatAgentDto) {
  @ApiPropertyOptional({ enum: AGENT_STATUSES })
  @IsOptional()
  @IsIn([...AGENT_STATUSES])
  status?: (typeof AGENT_STATUSES)[number];
}

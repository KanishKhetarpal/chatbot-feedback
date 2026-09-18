import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { WidgetChatMessageDto } from './widget-chat.dto';

export class TestChatAgentDto {
  @ApiProperty({ description: 'The question to try.', maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  /** Multi-turn behaviour is worth testing too — tone and follow-ups only show up after turn one. */
  @ApiPropertyOptional({ type: [WidgetChatMessageDto], maxItems: 40 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => WidgetChatMessageDto)
  history?: WidgetChatMessageDto[];

  /**
   * Return the compiled instructions alongside the reply.
   *
   * The knowledge itself is not included — it can be 60k tokens and already has
   * its own endpoint (`GET /chat-agents/:id/pack`). What this adds is the part
   * nothing else exposes: the preamble and the persona built from the agent's
   * settings, which is usually where a surprising answer comes from.
   */
  @ApiPropertyOptional({ description: 'Include the compiled system instructions in the response.' })
  @IsOptional()
  @IsBoolean()
  includePrompt?: boolean;
}

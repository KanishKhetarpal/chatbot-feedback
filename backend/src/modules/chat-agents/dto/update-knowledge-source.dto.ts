import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { KNOWLEDGE_DESCRIPTION_MAX_CHARS } from '../knowledge.constants';

export class UpdateKnowledgeSourceDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Use this source when answering.' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Text sources only — re-ingests the body.', maxLength: 500_000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500_000)
  content?: string;

  /**
   * Editable on every type, including files. The description is the one part of an
   * uploaded source an author can fix without re-uploading — and the part most
   * likely to need fixing, because its quality is only apparent once the agent
   * starts answering from it.
   */
  @ApiPropertyOptional({
    description: 'What this source is. Send an empty string to clear it.',
    maxLength: KNOWLEDGE_DESCRIPTION_MAX_CHARS,
  })
  @IsOptional()
  @IsString()
  @MaxLength(KNOWLEDGE_DESCRIPTION_MAX_CHARS)
  description?: string;
}

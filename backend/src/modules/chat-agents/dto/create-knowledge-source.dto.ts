import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import {
  KNOWLEDGE_DESCRIPTION_MAX_CHARS,
  KNOWLEDGE_SOURCE_TYPES,
  TEXT_KNOWLEDGE_TYPE,
} from '../knowledge.constants';

export class CreateKnowledgeSourceDto {
  @ApiProperty({ enum: KNOWLEDGE_SOURCE_TYPES })
  @IsIn([...KNOWLEDGE_SOURCE_TYPES])
  type: (typeof KNOWLEDGE_SOURCE_TYPES)[number];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  agentId: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @ValidateIf((dto: CreateKnowledgeSourceDto) => dto.type === TEXT_KNOWLEDGE_TYPE)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 500_000 })
  @ValidateIf((dto: CreateKnowledgeSourceDto) => dto.type === TEXT_KNOWLEDGE_TYPE)
  @IsString()
  @MinLength(1)
  @MaxLength(500_000)
  content?: string;

  @ApiPropertyOptional({
    description:
      'What this source is, in your words. Rendered into the prompt above the content. Optional for prose, required when uploading a file.',
    maxLength: KNOWLEDGE_DESCRIPTION_MAX_CHARS,
  })
  @IsOptional()
  @IsString()
  @MaxLength(KNOWLEDGE_DESCRIPTION_MAX_CHARS)
  description?: string;
}

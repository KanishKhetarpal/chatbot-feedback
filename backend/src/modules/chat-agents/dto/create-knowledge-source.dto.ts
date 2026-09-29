import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  KNOWLEDGE_DESCRIPTION_MAX_CHARS,
  KNOWLEDGE_LOAD_MODES,
  KNOWLEDGE_SOURCE_TYPES,
  KNOWLEDGE_TRIGGER_MAX_CHARS,
  KNOWLEDGE_TRIGGERS_MAX,
  TEXT_KNOWLEDGE_TYPE,
  type KnowledgeLoadMode,
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

  @ApiPropertyOptional({
    enum: KNOWLEDGE_LOAD_MODES,
    default: 'always',
    description:
      'always: part of the compiled pack sent on every message. on_demand: kept out of the pack and attached to a turn only when one of `triggers` appears in what the visitor wrote.',
  })
  @IsOptional()
  @IsIn([...KNOWLEDGE_LOAD_MODES])
  loadMode?: KnowledgeLoadMode;

  @ApiPropertyOptional({
    type: [String],
    maxItems: KNOWLEDGE_TRIGGERS_MAX,
    description: 'Words or phrases that pull an on_demand source into a turn. Case-insensitive, matched as whole words.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(KNOWLEDGE_TRIGGERS_MAX)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(KNOWLEDGE_TRIGGER_MAX_CHARS, { each: true })
  triggers?: string[];
}

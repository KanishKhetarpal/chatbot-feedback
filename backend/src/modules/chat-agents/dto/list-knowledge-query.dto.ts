import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { KNOWLEDGE_SOURCE_TYPES } from '../knowledge.constants';

export class ListKnowledgeQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  agentId: string;

  @ApiPropertyOptional({ enum: KNOWLEDGE_SOURCE_TYPES })
  @IsOptional()
  @IsIn([...KNOWLEDGE_SOURCE_TYPES])
  type?: (typeof KNOWLEDGE_SOURCE_TYPES)[number];
}

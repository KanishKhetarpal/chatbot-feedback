import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { KNOWLEDGE_DESCRIPTION_MAX_CHARS } from '../knowledge.constants';

/**
 * The multipart body beside the file itself.
 *
 * `description` is **required here and optional everywhere else**, and that is the
 * point of the whole upload feature. A pasted paragraph explains itself; a sheet
 * whose columns read `PRG`, `YR`, `AMT` does not, and no amount of table rendering
 * recovers what the author never wrote down. Making it required is the cheapest
 * possible guard against an agent that quotes numbers it cannot describe.
 */
export class UploadKnowledgeFileDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  agentId: string;

  @ApiPropertyOptional({
    description: 'Defaults to the uploaded file name without its extension.',
    minLength: 1,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiProperty({
    description:
      'What this spreadsheet contains and how to read it — units, what a row represents, what each unclear column means. Sent to the model above the table.',
    minLength: 10,
    maxLength: KNOWLEDGE_DESCRIPTION_MAX_CHARS,
    example:
      'Annual tuition for all UG programmes, 2026-27 intake. One row per programme per year of study. Amounts are in INR and exclude hostel and mess fees.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(KNOWLEDGE_DESCRIPTION_MAX_CHARS)
  description: string;
}

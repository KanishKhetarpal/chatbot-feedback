import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { WidgetThemeDto } from './widget-theme.dto';
import {
  DEFAULT_MODEL,
  EFFORT_LEVELS,
  KNOWLEDGE_MODES,
  LEAD_CAPTURE_MODES,
  LEAD_FIELDS,
  MODEL_IDS,
  RESPONSE_LENGTHS,
  TONES,
} from '../chat-agent-models';

export class CreateChatAgentDto {
  @ApiProperty({ example: 'Admissions assistant', minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Internal note — never sent to the model or widget.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 20_000 })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  instructions?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  avatarUrl?: string | null;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  heading?: string | null;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subheading?: string | null;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  greeting?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 4 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  messagePresets?: string[];

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  inputPlaceholder?: string | null;

  @ApiPropertyOptional({ enum: TONES, default: 'friendly' })
  @IsOptional()
  @IsIn([...TONES])
  tone?: (typeof TONES)[number];

  @ApiPropertyOptional({ enum: RESPONSE_LENGTHS, default: 'balanced' })
  @IsOptional()
  @IsIn([...RESPONSE_LENGTHS])
  responseLength?: (typeof RESPONSE_LENGTHS)[number];

  @ApiPropertyOptional({ default: 'auto' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  useEmoji?: boolean;

  @ApiPropertyOptional({ enum: KNOWLEDGE_MODES, default: 'strict' })
  @IsOptional()
  @IsIn([...KNOWLEDGE_MODES])
  knowledgeMode?: (typeof KNOWLEDGE_MODES)[number];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fallbackMessage?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  restrictedTopics?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(120, { each: true })
  handoffTriggers?: string[];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  handoffMessage?: string | null;

  @ApiPropertyOptional({ default: 2, minimum: 0, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  handoffOnFallback?: number;

  @ApiPropertyOptional({ enum: LEAD_CAPTURE_MODES, default: 'never' })
  @IsOptional()
  @IsIn([...LEAD_CAPTURE_MODES])
  leadCapture?: (typeof LEAD_CAPTURE_MODES)[number];

  @ApiPropertyOptional({ enum: LEAD_FIELDS, isArray: true, default: ['phone'] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsIn([...LEAD_FIELDS], { each: true })
  leadFields?: Array<(typeof LEAD_FIELDS)[number]>;

  @ApiPropertyOptional({
    default: true,
    description:
      'When true, the agent asks qualifying questions (programme, year, level, city…) as a counsellor would, weaved into its answers. False = pure Q&A behaviour.',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  qualificationEnabled?: boolean;

  @ApiPropertyOptional({ enum: MODEL_IDS, default: DEFAULT_MODEL })
  @IsOptional()
  @IsIn(MODEL_IDS)
  model?: string;

  @ApiPropertyOptional({ enum: EFFORT_LEVELS, default: 'medium' })
  @IsOptional()
  @IsIn([...EFFORT_LEVELS])
  effort?: (typeof EFFORT_LEVELS)[number];

  @ApiPropertyOptional({ default: 1024, minimum: 128, maximum: 8192 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(128)
  @Max(8192)
  maxTokens?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 20,
    description: 'Full origins with scheme, e.g. https://acharya.ac.in. Empty = any origin (dev only).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({ require_tld: false }, { each: true })
  allowedOrigins?: string[];

  /**
   * Appearance. Send only what you are changing — anything omitted follows the
   * product default for the chosen mode rather than being frozen into the row.
   *
   * `null` clears every override and returns the agent to defaults.
   */
  @ApiPropertyOptional({ type: WidgetThemeDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => WidgetThemeDto)
  theme?: WidgetThemeDto | null;
}

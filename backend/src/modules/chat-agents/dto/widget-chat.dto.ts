import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class WidgetConfigQueryDto {
  @ApiProperty({ description: 'The agent’s public embed key.' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  publicKey: string;
}

export class WidgetSessionDto {
  @ApiProperty({ description: 'The agent’s public embed key, from GET /chat-agents/:id/embed.' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  publicKey: string;

  /**
   * A token from a previous visit, if the browser kept one.
   *
   * Presenting a valid one continues that visitor rather than minting another,
   * which is what keeps a returning visitor's rate-limit counter and (later)
   * their conversation attached to them. An invalid or expired token is not an
   * error — the visitor simply starts fresh.
   */
  @ApiPropertyOptional({ description: 'Existing visitor token, to resume rather than start over.' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  visitorToken?: string;
}

export class WidgetChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty({ maxLength: 8000 })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content: string;
}

export class WidgetChatDto {
  /**
   * Identifies the visitor *and* the agent — the agent id is a signed claim
   * inside it, so no public key is needed alongside it. A token minted for one
   * agent cannot be pointed at another.
   *
   * **Optional, because the first message has none.** A visitor is created when
   * someone actually types, not when the widget opens, so the opening request
   * has nothing to identify yet. Send `publicKey` instead on that first turn and
   * the response carries the token to use from then on.
   */
  @ApiPropertyOptional({ description: 'Visitor token. Omit on the first message and send publicKey.' })
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(1024)
  visitorToken?: string;

  /**
   * The agent to talk to, when there is no token yet.
   *
   * Safe in public HTML — `allowedOrigins` is what actually gates embedding, not
   * the secrecy of this key. Ignored when `visitorToken` is present, since the
   * token already names the agent and is signed; trusting an unsigned field over
   * a signed one would let a caller move a visitor between agents.
   */
  @ApiPropertyOptional({ description: 'Agent public key. Required only when visitorToken is omitted.' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  publicKey?: string;

  /**
   * The three things only the browser can see, sent on the first message and
   * ignored after the visitor exists.
   *
   * Everything else about the visitor's environment — address, browser, OS,
   * language — is read from the request headers instead. A client cannot know
   * its own IP, and anything it claims about itself can be edited, so those are
   * never taken from the body.
   */
  @ApiPropertyOptional({ description: 'IANA timezone, e.g. Asia/Kolkata.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Page the widget is embedded on.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;

  @ApiPropertyOptional({ description: 'What referred the visitor to that page.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  referrer?: string;

  @ApiProperty({ description: 'What the visitor just typed.', maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  /**
   * Conversation so far, oldest first, excluding the current message.
   *
   * ⚠️ **Accepted and ignored.** Conversations are stored server-side now and the
   * prompt is built from those rows, so a client-supplied history would let a
   * caller invent what "had been said". Kept in the contract so an older embedded
   * widget keeps working mid-conversation rather than breaking on deploy.
   */
  @ApiPropertyOptional({ type: [WidgetChatMessageDto], maxItems: 40 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => WidgetChatMessageDto)
  history?: WidgetChatMessageDto[];
}

/**
 * A guided-flow chip click.
 *
 * Same identity shape as WidgetChatDto — token if known, publicKey on the very
 * first request. `nodeId` is either a real node id from the agent's guidedFlow
 * or a reserved id (`escape_ai`, `escape_human`).
 */
export class WidgetStepDto {
  @ApiPropertyOptional({ description: 'Visitor token. Omit on the first message and send publicKey.' })
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(1024)
  visitorToken?: string;

  @ApiPropertyOptional({ description: 'Agent public key. Required only when visitorToken is omitted.' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  publicKey?: string;

  @ApiPropertyOptional({ description: 'IANA timezone, e.g. Asia/Kolkata. Only used on first-visit creation.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Page the widget is embedded on. Only used on first-visit creation.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;

  @ApiPropertyOptional({ description: 'What referred the visitor to that page. First-visit only.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  referrer?: string;

  @ApiProperty({ description: 'The node the visitor picked. Reserved: escape_ai, escape_human.' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  nodeId!: string;
}

export class WidgetLeadDto {
  @ApiPropertyOptional({ description: 'Visitor token. Omit if the visitor has not chatted yet and send publicKey.' })
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(1024)
  visitorToken?: string;

  @ApiPropertyOptional({ description: 'Chatbot public key. Required only when visitorToken is omitted.' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  publicKey?: string;

  @ApiPropertyOptional({ description: 'IANA timezone, first-visit only.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Page the widget is on, first-visit only.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  /** Any dialable number, with or without a country code. Normalised server-side. */
  @ApiPropertyOptional({ example: '+91 98450 12345' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  @Matches(/^\+?[\d\s().-]{7,23}$/, { message: 'Enter a valid phone number' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ type: [WidgetChatMessageDto], maxItems: 40 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => WidgetChatMessageDto)
  history?: WidgetChatMessageDto[];
}

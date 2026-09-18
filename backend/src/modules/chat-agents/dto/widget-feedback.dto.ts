import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export const MESSAGE_RATINGS = ['up', 'down'] as const;

/** Thumbs up / down on one of the bot's replies. */
export class WidgetMessageFeedbackDto {
  @ApiProperty({ description: 'The visitor token this thread belongs to.' })
  @IsString()
  @MinLength(16)
  @MaxLength(1024)
  visitorToken: string;

  @ApiProperty({ format: 'uuid', description: 'The assistant message being rated.' })
  @IsUUID()
  messageId: string;

  @ApiPropertyOptional({ enum: MESSAGE_RATINGS, nullable: true, description: 'null clears the rating.' })
  @IsOptional()
  @IsIn([...MESSAGE_RATINGS])
  rating?: 'up' | 'down' | null;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

/** A star rating + comment on the whole conversation. */
export class WidgetConversationFeedbackDto {
  @ApiProperty({ description: 'The visitor token this thread belongs to.' })
  @IsString()
  @MinLength(16)
  @MaxLength(1024)
  visitorToken: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string | null;
}

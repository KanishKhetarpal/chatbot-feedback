import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const REVIEW_STATUSES = ['pending', 'reviewed', 'flagged'] as const;

/** An admin's verdict on a recorded conversation. */
export class ReviewThreadDto {
  @ApiPropertyOptional({ enum: REVIEW_STATUSES })
  @IsOptional()
  @IsIn([...REVIEW_STATUSES])
  reviewStatus?: (typeof REVIEW_STATUSES)[number];

  @ApiPropertyOptional({ maxLength: 4000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reviewNote?: string | null;
}

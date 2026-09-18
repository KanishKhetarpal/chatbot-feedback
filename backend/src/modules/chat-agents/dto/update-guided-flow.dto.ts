import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Body shape for `PUT /chat-agents/:id/guided-flow`.
 *
 * Loose class-validator here on purpose — the real contract is the zod schema
 * in `schemas/guided-flow.schema.ts` PLUS the semantic checks in
 * `guided-flow.validator.ts`. Both fire in `updateGuidedFlow` and return a
 * detailed 400 with per-issue reasons that the accordion editor renders
 * inline. Doing two-tier validation this way keeps the DTO tiny (Nest just
 * needs to know the body is JSON-shaped) while the deeper checks handle the
 * things zod cannot express — cycles, orphans, cross-node references.
 */
export class UpdateGuidedFlowDto {
  @ApiProperty({
    description:
      'The node ids offered as the opening chips, in the order they should render on the widget.',
    example: ['programmes', 'eligibility', 'apply', 'callback'],
  })
  @IsArray()
  @IsString({ each: true })
  rootIds!: string[];

  @ApiProperty({ example: 'Ask me something else', maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  escapeToAiLabel!: string;

  @ApiProperty({ example: 'Talk to a counsellor', maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  escapeToHumanLabel!: string;

  @ApiProperty({
    description: 'Node dictionary keyed by node id. See guided-flow.schema.ts for the exact shape.',
    example: {
      programmes: {
        id: 'programmes',
        label: 'What programmes do you offer?',
        answer: 'We offer B.Tech, MBA and 20+ more. Which area interests you?',
        next: ['btech', 'mba', 'escape_ai'],
      },
    },
  })
  @IsObject()
  @Type(() => Object)
  @ValidateNested()
  nodes!: Record<string, unknown>;
}

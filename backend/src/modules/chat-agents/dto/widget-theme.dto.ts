import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import {
  CORNER_STYLES,
  LAUNCHER_POSITIONS,
  LAUNCHER_SIZE_MAX,
  LAUNCHER_SIZE_MIN,
} from '../widget-theme';

/** `#rgb`, `#rrggbb` or `#rrggbbaa`. Not arbitrary CSS — this value is written into a style attribute. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const hexMessage = (field: string) => `${field} must be a hex colour such as #ea580c`;

/**
 * The appearance fields an author may set.
 *
 * Every field is optional: a theme is stored sparsely, holding only what was
 * actually changed, so unset values keep following the product defaults rather
 * than freezing today's palette into the row.
 *
 * Colours are pattern-checked rather than accepted as free strings. The values
 * end up inside a `style` attribute in the visitor's browser, so "any string the
 * dashboard sent" is not a safe contract — and a typo that silently renders
 * nothing is worse for the author than a rejection that names the field.
 */
export class WidgetThemeDto {
  @ApiPropertyOptional({ example: '#ea580c', description: 'Launcher, visitor bubbles, send button.' })
  @IsOptional()
  @IsString()
  @Matches(HEX, { message: hexMessage('primary') })
  primary?: string;

  @ApiPropertyOptional({ example: '#fff7ed', description: 'Text drawn on top of primary.' })
  @IsOptional()
  @IsString()
  @Matches(HEX, { message: hexMessage('primaryText') })
  primaryText?: string;

  @ApiPropertyOptional({ example: '#0a0a0a', description: 'Panel background.' })
  @IsOptional()
  @IsString()
  @Matches(HEX, { message: hexMessage('background') })
  background?: string;

  @ApiPropertyOptional({ example: '#fafafa', description: 'Body text.' })
  @IsOptional()
  @IsString()
  @Matches(HEX, { message: hexMessage('backgroundText') })
  backgroundText?: string;

  @ApiPropertyOptional({ example: '#171717', description: 'Agent bubbles and raised surfaces.' })
  @IsOptional()
  @IsString()
  @Matches(HEX, { message: hexMessage('muted') })
  muted?: string;

  @ApiPropertyOptional({ example: '#a3a3a3', description: 'Secondary text.' })
  @IsOptional()
  @IsString()
  @Matches(HEX, { message: hexMessage('mutedText') })
  mutedText?: string;

  @ApiPropertyOptional({ example: '#262626' })
  @IsOptional()
  @IsString()
  @Matches(HEX, { message: hexMessage('border') })
  border?: string;

  @ApiPropertyOptional({ enum: CORNER_STYLES })
  @IsOptional()
  @IsIn([...CORNER_STYLES])
  corners?: (typeof CORNER_STYLES)[number];

  @ApiPropertyOptional({ enum: LAUNCHER_POSITIONS })
  @IsOptional()
  @IsIn([...LAUNCHER_POSITIONS])
  launcherPosition?: (typeof LAUNCHER_POSITIONS)[number];

  @ApiPropertyOptional({
    minimum: LAUNCHER_SIZE_MIN,
    maximum: LAUNCHER_SIZE_MAX,
    description: 'Launcher diameter in px. The floor is a minimum touch target, not a style choice.',
  })
  @IsOptional()
  @IsInt()
  @Min(LAUNCHER_SIZE_MIN)
  @Max(LAUNCHER_SIZE_MAX)
  launcherSize?: number;

  @ApiPropertyOptional({ description: 'Entrance and open/close motion. prefers-reduced-motion always wins.' })
  @IsOptional()
  @IsBoolean()
  animations?: boolean;

  @ApiPropertyOptional({ description: 'Show the “Powered by” line under the composer.' })
  @IsOptional()
  @IsBoolean()
  showBranding?: boolean;
}

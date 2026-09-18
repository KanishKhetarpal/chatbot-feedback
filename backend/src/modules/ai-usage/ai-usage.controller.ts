import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { AiUsageService } from './ai-usage.service';
import { AiUsageQueryDto } from './dto/ai-usage-query.dto';

/** What Claude costs this app, in tokens and estimated dollars. Admin only. */
@ApiTags('ai-usage')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('ai-usage')
export class AiUsageController {
  constructor(private readonly usage: AiUsageService) {}

  @Get()
  @ApiOperation({
    summary: 'Token usage report',
    description:
      'Totals, per-day series, per-chatbot / per-model / per-operation breakdowns, the most recent calls, ' +
      'and the price table the cost estimates were computed from. All four token kinds are counted.',
  })
  report(@Query() query: AiUsageQueryDto) {
    return this.usage.report(query);
  }
}

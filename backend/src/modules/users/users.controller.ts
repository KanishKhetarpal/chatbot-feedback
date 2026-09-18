import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List accounts (admin)' })
  list() {
    return this.users.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create an account (admin)' })
  async create(@Body() dto: CreateUserDto) {
    return { user: await this.users.create(dto) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update role / name / active flag / password (admin)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('userId') actorId: string,
  ) {
    return { user: await this.users.update(id, dto, actorId) };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an account (admin). Their conversations are kept.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') actorId: string) {
    return this.users.remove(id, actorId);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { ListExpensesDto, CreateExpenseDto, UpdateExpenseDto } from './dto';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
@Roles(Role.ADMIN)
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter expenses' })
  list(@Query() query: ListExpensesDto) {
    return this.service.list(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get expenses totals and category breakdowns' })
  getStats() {
    return this.service.getStats();
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed historical expenses data' })
  seed() {
    return this.service.seedDemoExpenses();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get detailed single expense' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a new expense record' })
  create(@Body() dto: CreateExpenseDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update/Approve/Reject an expense record' })
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an expense record' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}

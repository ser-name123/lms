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
import { PayoutsService } from './payouts.service';
import { Roles } from '../auth/decorators';
import { Role, PayoutMethod } from '../generated/prisma/enums';
import { ListPayoutsDto, CreatePayoutDto, UpdatePayoutDto, BulkGeneratePayoutsDto } from './dto';

@ApiTags('payouts')
@ApiBearerAuth()
@Controller('payouts')
@Roles(Role.ADMIN)
export class PayoutsController {
  constructor(private readonly service: PayoutsService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter payouts with pagination' })
  list(@Query() query: ListPayoutsDto) {
    return this.service.list(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get payouts dashboard stats and monthly trends' })
  getStats() {
    return this.service.getStats();
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed historical payouts data' })
  seed() {
    return this.service.seedDemoPayouts();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single payout record' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an individual custom payout record' })
  create(@Body() dto: CreatePayoutDto) {
    return this.service.create(dto);
  }

  @Post('bulk-generate')
  @ApiOperation({ summary: 'Bulk generate payouts for all active staff members' })
  bulkGenerate(@Body() dto: BulkGeneratePayoutsDto) {
    return this.service.bulkGenerate(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update adjustments, bonus, notes, or payment method of a payout' })
  update(@Param('id') id: string, @Body() dto: UpdatePayoutDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/pay')
  @ApiOperation({ summary: 'Record payment of a payout with reference number' })
  pay(
    @Param('id') id: string,
    @Body() dto: { referenceNumber: string; notes?: string; paymentMethod?: PayoutMethod },
  ) {
    return this.service.processPayment(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a payout record' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}

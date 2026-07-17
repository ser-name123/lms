import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { BillingService } from './billing.service';
import { GenerateInvoiceDto, ListInvoicesDto, RecordPaymentDto } from './dto';

const actor = (u: AuthUser) => ({ id: u?.id, name: u?.email });

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance/invoices')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get()
  @ApiOperation({ summary: 'List invoices (with balances)' })
  list(@Query() query: ListInvoicesDto) {
    return this.service.list(query);
  }

  @Get('receipts')
  @ApiOperation({ summary: 'List receipts' })
  receipts(@Query('studentId') studentId?: string) {
    return this.service.receipts(studentId);
  }

  @Get('receipts/:id')
  @ApiOperation({ summary: 'Receipt detail (printable)' })
  receipt(@Param('id') id: string) {
    return this.service.receipt(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Invoice detail (items + payments + receipts)' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Generate an invoice (items or fee plan)' })
  generate(@Body() dto: GenerateInvoiceDto) {
    return this.service.generate(dto);
  }

  @Post(':id/payments')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Record a (partial) payment + issue a receipt' })
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.recordPayment(id, dto, actor(user));
  }

  @Post(':id/send')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Mark a draft invoice as sent + notify' })
  send(@Param('id') id: string) {
    return this.service.send(id);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cancel an invoice' })
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete an unpaid invoice' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

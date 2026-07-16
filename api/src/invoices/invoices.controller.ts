import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { CreateInvoiceDto, ListInvoicesDto, UpdateInvoiceDto } from './dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
@Roles(Role.ADMIN)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated, filtered billing invoices list' })
  list(@Query() query: ListInvoicesDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create new billing invoice' })
  async create(@Body() dto: CreateInvoiceDto) {
    try {
      return await this.service.create(dto);
    } catch (err) {
      console.error('Prisma Invoice Create Error:', err);
      throw err;
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update existing billing invoice' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete or void billing invoice' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(id);
  }
}

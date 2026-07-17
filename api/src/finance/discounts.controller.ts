import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { DiscountsService } from './discounts.service';
import { CreateDiscountDto, UpdateDiscountDto } from './dto';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance/discounts')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class DiscountsController {
  constructor(private readonly service: DiscountsService) {}

  @Get()
  @ApiOperation({ summary: 'List discounts' })
  list(@Query('search') search?: string, @Query('active') active?: string) {
    return this.service.list(search, active);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a discount' })
  create(@Body() dto: CreateDiscountDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a discount' })
  update(@Param('id') id: string, @Body() dto: UpdateDiscountDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate a discount' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

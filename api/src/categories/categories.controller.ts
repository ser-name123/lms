import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { Public } from '../auth/decorators';

@ApiTags('categories')
@Controller('categories')
@Public()
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all categories, optionally filtered by type' })
  list(@Query('type') type?: string) {
    return this.service.list(type);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new category' })
  create(@Body() dto: { name: string; type: string }) {
    return this.service.create(dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}

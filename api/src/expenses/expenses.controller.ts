import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Patch,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { Response } from 'express';
import { ExpensesService } from './expenses.service';
import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { ListExpensesDto, CreateExpenseDto, UpdateExpenseDto } from './dto';
import { CreateCategoryDto } from './categories/dto';

// Uploaded receipts live under <api>/uploads/receipts.
const UPLOAD_ROOT = join(process.cwd(), 'uploads');
const RECEIPT_DIR = join(UPLOAD_ROOT, 'receipts');

const receiptStorage = diskStorage({
  destination: (_req, _file, cb) => {
    mkdirSync(RECEIPT_DIR, { recursive: true });
    cb(null, RECEIPT_DIR);
  },
  filename: (_req, file, cb) => {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${stamp}${extname(file.originalname)}`);
  },
});

// Receipts are documents/images only — reject anything executable or scriptable.
const RECEIPT_EXTENSIONS = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp',
]);

const receiptFilter = (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const ext = extname(file.originalname).toLowerCase();
  if (!RECEIPT_EXTENSIONS.has(ext)) {
    cb(new ForbiddenException(`File type "${ext || 'unknown'}" is not allowed`), false);
    return;
  }
  cb(null, true);
};

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

  @Get('categories')
  @ApiOperation({ summary: 'Get list of dynamic expense categories' })
  listCategories() {
    return this.service.listCategories();
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a new custom expense category' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Post('receipt-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: receiptStorage,
      fileFilter: receiptFilter,
      limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB ceiling
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a receipt file, return its served reference' })
  uploadReceipt(@UploadedFile() file?: Express.Multer.File) {
    return this.service.storeReceiptFile(file);
  }

  // Receipts are financial documents — ADMIN only (class-level @Roles applies).
  // They are NOT served from the open /uploads static mount anymore; the client
  // fetches them here with its token and renders the response as a blob.
  @Get('receipt/:filename')
  @ApiOperation({ summary: 'Serve a stored receipt inline (admin only)' })
  serveReceipt(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    // Contain the resolved path inside the receipts dir: a crafted filename
    // like "../../.env" must never escape and stream an arbitrary server file.
    const receiptsRoot = resolve(RECEIPT_DIR);
    const filePath = resolve(RECEIPT_DIR, filename);
    if (!filePath.startsWith(receiptsRoot + sep)) {
      throw new ForbiddenException('Invalid file path');
    }
    if (!existsSync(filePath)) {
      throw new NotFoundException('Receipt not found');
    }
    const ext = extname(filePath).toLowerCase();
    const mime =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : 'image/jpeg';
    res.set({ 'Content-Type': mime, 'Content-Disposition': 'inline' });
    return new StreamableFile(createReadStream(filePath));
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

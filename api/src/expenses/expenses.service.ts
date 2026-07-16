import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseStatus, InvoiceStatus } from '../generated/prisma/enums';
import { ListExpensesDto, CreateExpenseDto, UpdateExpenseDto } from './dto';
import { CreateCategoryDto } from './categories/dto';
import type { Prisma } from '../generated/prisma/client';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  // Automatically seeds standard categories if the table is empty
  async ensureDefaultCategories() {
    const count = await this.prisma.expenseCategory.count();
    if (count > 0) return;

    const defaults = [
      'Salaries & Wages',
      'Office Rent',
      'Utilities & Bills',
      'Marketing & Ads',
      'Subscriptions & SaaS',
      'Office Supplies',
      'Travel & Training',
      'Miscellaneous',
    ];

    for (const name of defaults) {
      await this.prisma.expenseCategory.create({
        data: { name },
      }).catch(() => {});
    }
  }

  async listCategories() {
    await this.ensureDefaultCategories();
    return this.prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    const normalized = dto.name.trim();
    const existing = await this.prisma.expenseCategory.findUnique({
      where: { name: normalized },
    });
    if (existing) {
      throw new ConflictException(`Category "${normalized}" already exists.`);
    }

    return this.prisma.expenseCategory.create({
      data: { name: normalized },
    });
  }

  async list(dto: ListExpensesDto) {
    await this.ensureDefaultCategories();
    const { page = 1, limit = 20, search, categoryId, status, paymentMethod, sortBy } = dto;

    const where: Prisma.ExpenseWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(status ? { status } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { merchant: { contains: search, mode: 'insensitive' } },
              { referenceNo: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    let orderBy: Prisma.ExpenseOrderByWithRelationInput = { paymentDate: 'desc' };
    if (sortBy) {
      if (sortBy === 'amount_asc') orderBy = { amount: 'asc' };
      else if (sortBy === 'amount_desc') orderBy = { amount: 'desc' };
      else if (sortBy === 'date_asc') orderBy = { paymentDate: 'asc' };
      else if (sortBy === 'date_desc') orderBy = { paymentDate: 'desc' };
      else if (sortBy === 'title_asc') orderBy = { title: 'asc' };
      else if (sortBy === 'title_desc') orderBy = { title: 'desc' };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: { category: true },
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!expense) throw new NotFoundException(`Expense ID ${id} not found`);
    return expense;
  }

  async create(dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        title: dto.title,
        amount: Number(dto.amount),
        categoryId: dto.categoryId,
        paymentMethod: dto.paymentMethod,
        status: dto.status ?? ExpenseStatus.PENDING,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        merchant: dto.merchant || null,
        referenceNo: dto.referenceNo || null,
        receiptUrl: dto.receiptUrl || null,
        notes: dto.notes || null,
      },
      include: { category: true },
    });
  }

  async update(id: string, dto: UpdateExpenseDto) {
    await this.getOne(id);

    return this.prisma.expense.update({
      where: { id },
      data: {
        title: dto.title,
        amount: dto.amount !== undefined ? Number(dto.amount) : undefined,
        categoryId: dto.categoryId,
        paymentMethod: dto.paymentMethod,
        status: dto.status,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
        merchant: dto.merchant,
        referenceNo: dto.referenceNo,
        receiptUrl: dto.receiptUrl,
        notes: dto.notes,
      },
      include: { category: true },
    });
  }

  async delete(id: string) {
    await this.getOne(id);
    await this.prisma.expense.delete({ where: { id } });
    return { success: true };
  }

  async getStats() {
    await this.ensureDefaultCategories();

    // 1. Calculate Total Expense
    const totalExpensesAgg = await this.prisma.expense.aggregate({
      _sum: { amount: true },
    });
    const totalExpense = Number(totalExpensesAgg._sum.amount || 0);

    // 2. Calculate Pending Expense
    const pendingExpensesAgg = await this.prisma.expense.aggregate({
      where: { status: ExpenseStatus.PENDING },
      _sum: { amount: true },
    });
    const pendingExpense = Number(pendingExpensesAgg._sum.amount || 0);

    // 3. Calculate Revenue from Paid Invoices (real figure, no placeholder)
    const paidInvoicesAgg = await this.prisma.invoice.aggregate({
      where: { status: InvoiceStatus.PAID },
      _sum: { amount: true },
    });
    const revenue = Number(paidInvoicesAgg._sum.amount || 0);

    // 4. Balance
    const balance = revenue - totalExpense;

    // 5. Category-wise Breakdown (Dynamic categories)
    const categories = await this.prisma.expenseCategory.findMany({
      include: {
        expenses: {
          select: { amount: true },
        },
      },
    });

    const categoryBreakdown = categories.map((cat) => {
      const sum = cat.expenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
      return {
        id: cat.id,
        name: cat.name,
        value: sum,
        count: cat.expenses.length,
      };
    });

    // Filter categories that have actual expenses to render on charts nicely
    const filteredBreakdown = categoryBreakdown.filter((c) => c.value > 0);

    // 6. Monthly Trend Analysis (last 6 months)
    const trend: { month: string; revenue: number; expenses: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

      // Monthly expenses
      const mExpensesAgg = await this.prisma.expense.aggregate({
        where: {
          paymentDate: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { amount: true },
      });

      // Monthly invoices
      const mInvoicesAgg = await this.prisma.invoice.aggregate({
        where: {
          status: InvoiceStatus.PAID,
          issuedAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { amount: true },
      });

      const mRevenue = Number(mInvoicesAgg._sum.amount || 0);
      const mExpenses = Number(mExpensesAgg._sum.amount || 0);

      trend.push({
        month: targetDate.toLocaleString('en-US', { month: 'short' }),
        revenue: mRevenue, // real monthly revenue, no fabricated fallback
        expenses: mExpenses,
      });
    }

    // 7. Real month-over-month change % (this month vs previous month).
    // Returns null when there is no prior-month baseline to compare against.
    const changePct = (current: number, previous: number): number | null => {
      if (!previous) return null;
      return Math.round(((current - previous) / previous) * 100);
    };

    const thisMonth = trend[trend.length - 1];
    const lastMonth = trend[trend.length - 2] ?? { revenue: 0, expenses: 0 };

    // Pending is a live status snapshot, so compare pending logged this month
    // against pending logged last month (by payment date).
    const monthStart = (offset: number) =>
      new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const monthEnd = (offset: number) =>
      new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
    const [pendingThisAgg, pendingLastAgg] = await Promise.all([
      this.prisma.expense.aggregate({
        where: {
          status: ExpenseStatus.PENDING,
          paymentDate: { gte: monthStart(0), lte: monthEnd(0) },
        },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          status: ExpenseStatus.PENDING,
          paymentDate: { gte: monthStart(1), lte: monthEnd(1) },
        },
        _sum: { amount: true },
      }),
    ]);
    const pendingThis = Number(pendingThisAgg._sum.amount || 0);
    const pendingLast = Number(pendingLastAgg._sum.amount || 0);

    const expenseChangePct = changePct(thisMonth.expenses, lastMonth.expenses);
    const revenueChangePct = changePct(thisMonth.revenue, lastMonth.revenue);
    const pendingChangePct = changePct(pendingThis, pendingLast);
    const balanceChangePct = changePct(
      thisMonth.revenue - thisMonth.expenses,
      lastMonth.revenue - lastMonth.expenses,
    );

    return {
      totalExpense,
      pendingExpense,
      revenue,
      balance,
      expenseChangePct,
      pendingChangePct,
      revenueChangePct,
      balanceChangePct,
      categoryBreakdown: filteredBreakdown,
      trend,
    };
  }

  /** Stores an uploaded receipt file and returns its served reference. */
  storeReceiptFile(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file was uploaded');
    }
    return {
      // Served (inline) via GET /expenses/receipt/:filename below.
      url: `expenses/receipt/${file.filename}`,
      fileName: file.originalname,
    };
  }
}

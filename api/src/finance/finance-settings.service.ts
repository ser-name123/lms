import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_FINANCE_CONFIG,
  FINANCE_CONFIG_KEY,
  FinanceConfig,
} from './finance.config';
import { UpdateFinanceConfigDto } from './dto';

@Injectable()
export class FinanceSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<FinanceConfig> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: FINANCE_CONFIG_KEY },
    });
    if (!row) return { ...DEFAULT_FINANCE_CONFIG };
    try {
      const p = JSON.parse(row.value) as Partial<FinanceConfig>;
      return { ...DEFAULT_FINANCE_CONFIG, ...p };
    } catch {
      return { ...DEFAULT_FINANCE_CONFIG };
    }
  }

  async updateConfig(dto: UpdateFinanceConfigDto): Promise<FinanceConfig> {
    const current = await this.getConfig();
    const next: FinanceConfig = { ...current, ...dto };
    await this.prisma.systemSetting.upsert({
      where: { key: FINANCE_CONFIG_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: FINANCE_CONFIG_KEY, value: JSON.stringify(next) },
    });
    return next;
  }
}

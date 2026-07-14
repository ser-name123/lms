import { Injectable, Logger } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class SystemSettingsDto {
  @IsOptional()
  @IsString()
  logo: string | null;

  @IsOptional()
  @IsString()
  favicon: string | null;

  @IsString()
  websiteName: string;

  @IsString()
  defaultTheme: string;

  @IsOptional()
  @IsString()
  googleTags: string;

  @IsString()
  loaderEnabled: string;

  @IsOptional()
  @IsString()
  loaderUrl: string | null;

  // Primary Theme (Light Mode)
  @IsString()
  primaryColor: string;

  @IsString()
  accentTextLight: string;

  @IsString()
  pageBgLight: string;

  @IsString()
  surfaceBgLight: string;

  @IsString()
  textPrimaryLight: string;

  @IsString()
  textSecondaryLight: string;

  @IsString()
  textMutedLight: string;

  @IsString()
  sidebarBgLight: string;

  @IsString()
  sidebarTextLight: string;

  @IsString()
  sidebarActiveBgLight: string;

  @IsString()
  sidebarActiveTextLight: string;

  @IsString()
  topbarBgLight: string;

  @IsString()
  topbarBorderLight: string;

  // Secondary Theme (Dark Mode)
  @IsString()
  secondaryColor: string;

  @IsString()
  accentTextDark: string;

  @IsString()
  pageBgDark: string;

  @IsString()
  surfaceBgDark: string;

  @IsString()
  textPrimaryDark: string;

  @IsString()
  textSecondaryDark: string;

  @IsString()
  textMutedDark: string;

  @IsString()
  sidebarBgDark: string;

  @IsString()
  sidebarTextDark: string;

  @IsString()
  sidebarActiveBgDark: string;

  @IsString()
  sidebarActiveTextDark: string;

  @IsString()
  topbarBgDark: string;

  @IsString()
  topbarBorderDark: string;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<SystemSettingsDto> {
    const records = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            'WEBSITE_LOGO', 
            'WEBSITE_FAVICON', 
            'WEBSITE_THEME', 
            'GOOGLE_TAGS', 
            'WEBSITE_NAME',
            'WEBSITE_LOADER_ENABLED',
            'WEBSITE_LOADER_URL'
          ],
        },
      },
    });

    const settingsMap = new Map(records.map((r) => [r.key, r.value]));

    // Light Mode Defaults
    let primaryColor = '#5b73e8';
    let accentTextLight = '#ffffff';
    let pageBgLight = '#f8f9fa';
    let surfaceBgLight = '#ffffff';
    let textPrimaryLight = '#212529';
    let textSecondaryLight = '#495057';
    let textMutedLight = '#8898aa';
    let sidebarBgLight = '#ffffff';
    let sidebarTextLight = '#495057';
    let sidebarActiveBgLight = 'rgba(91, 115, 232, 0.08)';
    let sidebarActiveTextLight = '#5b73e8';
    let topbarBgLight = '#ffffff';
    let topbarBorderLight = 'rgba(33, 37, 41, 0.06)';

    // Dark Mode Defaults
    let secondaryColor = '#6366f1';
    let accentTextDark = '#ffffff';
    let pageBgDark = '#09090b';
    let surfaceBgDark = '#18181b';
    let textPrimaryDark = '#f4f4f5';
    let textSecondaryDark = '#d4d4d8';
    let textMutedDark = '#a1a1aa';
    let sidebarBgDark = '#18181b';
    let sidebarTextDark = '#d4d4d8';
    let sidebarActiveBgDark = 'rgba(99, 102, 241, 0.15)';
    let sidebarActiveTextDark = '#6366f1';
    let topbarBgDark = '#18181b';
    let topbarBorderDark = 'rgba(255, 255, 255, 0.08)';

    let defaultTheme = 'light';

    const themeStr = settingsMap.get('WEBSITE_THEME');
    if (themeStr) {
      try {
        const theme = JSON.parse(themeStr);
        primaryColor = theme.primaryColor || primaryColor;
        accentTextLight = theme.accentTextLight || accentTextLight;
        pageBgLight = theme.pageBgLight || pageBgLight;
        surfaceBgLight = theme.surfaceBgLight || surfaceBgLight;
        textPrimaryLight = theme.textPrimaryLight || textPrimaryLight;
        textSecondaryLight = theme.textSecondaryLight || textSecondaryLight;
        textMutedLight = theme.textMutedLight || textMutedLight;
        sidebarBgLight = theme.sidebarBgLight || sidebarBgLight;
        sidebarTextLight = theme.sidebarTextLight || sidebarTextLight;
        sidebarActiveBgLight = theme.sidebarActiveBgLight || sidebarActiveBgLight;
        sidebarActiveTextLight = theme.sidebarActiveTextLight || sidebarActiveTextLight;
        topbarBgLight = theme.topbarBgLight || topbarBgLight;
        topbarBorderLight = theme.topbarBorderLight || topbarBorderLight;

        secondaryColor = theme.secondaryColor || secondaryColor;
        accentTextDark = theme.accentTextDark || accentTextDark;
        pageBgDark = theme.pageBgDark || pageBgDark;
        surfaceBgDark = theme.surfaceBgDark || surfaceBgDark;
        textPrimaryDark = theme.textPrimaryDark || textPrimaryDark;
        textSecondaryDark = theme.textSecondaryDark || textSecondaryDark;
        textMutedDark = theme.textMutedDark || textMutedDark;
        sidebarBgDark = theme.sidebarBgDark || sidebarBgDark;
        sidebarTextDark = theme.sidebarTextDark || sidebarTextDark;
        sidebarActiveBgDark = theme.sidebarActiveBgDark || sidebarActiveBgDark;
        sidebarActiveTextDark = theme.sidebarActiveTextDark || sidebarActiveTextDark;
        topbarBgDark = theme.topbarBgDark || topbarBgDark;
        topbarBorderDark = theme.topbarBorderDark || topbarBorderDark;

        defaultTheme = theme.defaultTheme || defaultTheme;
      } catch (err) {
        this.logger.error('Failed to parse website theme options:', err);
      }
    }

    return {
      logo: settingsMap.get('WEBSITE_LOGO') || null,
      favicon: settingsMap.get('WEBSITE_FAVICON') || null,
      websiteName: settingsMap.get('WEBSITE_NAME') || 'Edumin LMS',
      defaultTheme,
      googleTags: settingsMap.get('GOOGLE_TAGS') || '',
      loaderEnabled: settingsMap.get('WEBSITE_LOADER_ENABLED') || 'true',
      loaderUrl: settingsMap.get('WEBSITE_LOADER_URL') || null,

      primaryColor,
      accentTextLight,
      pageBgLight,
      surfaceBgLight,
      textPrimaryLight,
      textSecondaryLight,
      textMutedLight,
      sidebarBgLight,
      sidebarTextLight,
      sidebarActiveBgLight,
      sidebarActiveTextLight,
      topbarBgLight,
      topbarBorderLight,

      secondaryColor,
      accentTextDark,
      pageBgDark,
      surfaceBgDark,
      textPrimaryDark,
      textSecondaryDark,
      textMutedDark,
      sidebarBgDark,
      sidebarTextDark,
      sidebarActiveBgDark,
      sidebarActiveTextDark,
      topbarBgDark,
      topbarBorderDark,
    };
  }

  async saveSettings(dto: SystemSettingsDto): Promise<{ success: boolean }> {
    const themeObj = {
      primaryColor: dto.primaryColor,
      accentTextLight: dto.accentTextLight,
      pageBgLight: dto.pageBgLight,
      surfaceBgLight: dto.surfaceBgLight,
      textPrimaryLight: dto.textPrimaryLight,
      textSecondaryLight: dto.textSecondaryLight,
      textMutedLight: dto.textMutedLight,
      sidebarBgLight: dto.sidebarBgLight,
      sidebarTextLight: dto.sidebarTextLight,
      sidebarActiveBgLight: dto.sidebarActiveBgLight,
      sidebarActiveTextLight: dto.sidebarActiveTextLight,
      topbarBgLight: dto.topbarBgLight,
      topbarBorderLight: dto.topbarBorderLight,

      secondaryColor: dto.secondaryColor,
      accentTextDark: dto.accentTextDark,
      pageBgDark: dto.pageBgDark,
      surfaceBgDark: dto.surfaceBgDark,
      textPrimaryDark: dto.textPrimaryDark,
      textSecondaryDark: dto.textSecondaryDark,
      textMutedDark: dto.textMutedDark,
      sidebarBgDark: dto.sidebarBgDark,
      sidebarTextDark: dto.sidebarTextDark,
      sidebarActiveBgDark: dto.sidebarActiveBgDark,
      sidebarActiveTextDark: dto.sidebarActiveTextDark,
      topbarBgDark: dto.topbarBgDark,
      topbarBorderDark: dto.topbarBorderDark,
      
      defaultTheme: dto.defaultTheme,
    };

    const updates = [
      { key: 'WEBSITE_LOGO', value: dto.logo || '' },
      { key: 'WEBSITE_FAVICON', value: dto.favicon || '' },
      { key: 'WEBSITE_THEME', value: JSON.stringify(themeObj) },
      { key: 'GOOGLE_TAGS', value: dto.googleTags || '' },
      { key: 'WEBSITE_NAME', value: dto.websiteName || 'Edumin LMS' },
      { key: 'WEBSITE_LOADER_ENABLED', value: dto.loaderEnabled || 'true' },
      { key: 'WEBSITE_LOADER_URL', value: dto.loaderUrl || '' },
    ];

    for (const update of updates) {
      await this.prisma.systemSetting.upsert({
        where: { key: update.key },
        update: { value: update.value },
        create: { key: update.key, value: update.value },
      });
    }

    return { success: true };
  }
}

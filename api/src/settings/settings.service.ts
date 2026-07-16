import { Injectable, Logger } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class SystemSettingsDto {
  @IsOptional()
  @IsString()
  logo: string | null;

  @IsOptional()
  @IsString()
  logoDark: string | null;

  @IsOptional()
  @IsString()
  adminConsoleTitle: string;

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

  // Typography Settings
  @IsOptional()
  @IsString()
  primaryFontFamily?: string;

  @IsOptional()
  @IsString()
  secondaryFontFamily?: string;

  // H1
  @IsOptional()
  @IsString()
  h1FontSize?: string;

  @IsOptional()
  @IsString()
  h1FontWeight?: string;

  @IsOptional()
  @IsString()
  h1FontFamily?: string;

  // H2
  @IsOptional()
  @IsString()
  h2FontSize?: string;

  @IsOptional()
  @IsString()
  h2FontWeight?: string;

  @IsOptional()
  @IsString()
  h2FontFamily?: string;

  // H3
  @IsOptional()
  @IsString()
  h3FontSize?: string;

  @IsOptional()
  @IsString()
  h3FontWeight?: string;

  @IsOptional()
  @IsString()
  h3FontFamily?: string;

  // H4
  @IsOptional()
  @IsString()
  h4FontSize?: string;

  @IsOptional()
  @IsString()
  h4FontWeight?: string;

  @IsOptional()
  @IsString()
  h4FontFamily?: string;

  // H5
  @IsOptional()
  @IsString()
  h5FontSize?: string;

  @IsOptional()
  @IsString()
  h5FontWeight?: string;

  @IsOptional()
  @IsString()
  h5FontFamily?: string;

  // P
  @IsOptional()
  @IsString()
  pFontSize?: string;

  @IsOptional()
  @IsString()
  pFontWeight?: string;

  @IsOptional()
  @IsString()
  pFontFamily?: string;
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
            'WEBSITE_LOGO_DARK',
            'ADMIN_CONSOLE_TITLE',
            'WEBSITE_FAVICON',
            'WEBSITE_THEME',
            'GOOGLE_TAGS',
            'WEBSITE_NAME',
            'WEBSITE_LOADER_ENABLED',
            'WEBSITE_LOADER_URL',
          ],
        },
      },
    });

    const settingsMap = new Map(records.map((r) => [r.key, r.value]));

    // Light Mode Defaults
    let primaryColor = '#133C55';
    let accentTextLight = '#ffffff';
    let pageBgLight = '#f5f8fb';
    let surfaceBgLight = '#ffffff';
    let textPrimaryLight = '#13222e';
    let textSecondaryLight = '#2c4251';
    let textMutedLight = '#5c7b90';
    let sidebarBgLight = '#133C55';
    let sidebarTextLight = '#91E5F6';
    let sidebarActiveBgLight = 'rgba(56, 111, 164, 0.35)';
    let sidebarActiveTextLight = '#ffffff';
    let topbarBgLight = '#ffffff';
    let topbarBorderLight = 'rgba(19, 60, 85, 0.08)';

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

    // Typography Defaults
    let primaryFontFamily = 'Outfit';
    let secondaryFontFamily = 'Inter';
    let h1FontSize = '32px';
    let h1FontWeight = '700';
    let h1FontFamily = 'primary';
    let h2FontSize = '24px';
    let h2FontWeight = '700';
    let h2FontFamily = 'primary';
    let h3FontSize = '20px';
    let h3FontWeight = '600';
    let h3FontFamily = 'primary';
    let h4FontSize = '18px';
    let h4FontWeight = '600';
    let h4FontFamily = 'primary';
    let h5FontSize = '16px';
    let h5FontWeight = '600';
    let h5FontFamily = 'primary';
    let pFontSize = '14px';
    let pFontWeight = '400';
    let pFontFamily = 'secondary';

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
        sidebarActiveBgLight =
          theme.sidebarActiveBgLight || sidebarActiveBgLight;
        sidebarActiveTextLight =
          theme.sidebarActiveTextLight || sidebarActiveTextLight;
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
        sidebarActiveTextDark =
          theme.sidebarActiveTextDark || sidebarActiveTextDark;
        topbarBgDark = theme.topbarBgDark || topbarBgDark;
        topbarBorderDark = theme.topbarBorderDark || topbarBorderDark;

        defaultTheme = theme.defaultTheme || defaultTheme;

        // Load typography parameters
        primaryFontFamily = theme.primaryFontFamily || primaryFontFamily;
        secondaryFontFamily = theme.secondaryFontFamily || secondaryFontFamily;
        h1FontSize = theme.h1FontSize || h1FontSize;
        h1FontWeight = theme.h1FontWeight || h1FontWeight;
        h1FontFamily = theme.h1FontFamily || h1FontFamily;
        h2FontSize = theme.h2FontSize || h2FontSize;
        h2FontWeight = theme.h2FontWeight || h2FontWeight;
        h2FontFamily = theme.h2FontFamily || h2FontFamily;
        h3FontSize = theme.h3FontSize || h3FontSize;
        h3FontWeight = theme.h3FontWeight || h3FontWeight;
        h3FontFamily = theme.h3FontFamily || h3FontFamily;
        h4FontSize = theme.h4FontSize || h4FontSize;
        h4FontWeight = theme.h4FontWeight || h4FontWeight;
        h4FontFamily = theme.h4FontFamily || h4FontFamily;
        h5FontSize = theme.h5FontSize || h5FontSize;
        h5FontWeight = theme.h5FontWeight || h5FontWeight;
        h5FontFamily = theme.h5FontFamily || h5FontFamily;
        pFontSize = theme.pFontSize || pFontSize;
        pFontWeight = theme.pFontWeight || pFontWeight;
        pFontFamily = theme.pFontFamily || pFontFamily;
      } catch (err) {
        this.logger.error('Failed to parse website theme options:', err);
      }
    }

    return {
      logo: settingsMap.get('WEBSITE_LOGO') || null,
      logoDark: settingsMap.get('WEBSITE_LOGO_DARK') || null,
      adminConsoleTitle:
        settingsMap.get('ADMIN_CONSOLE_TITLE') || 'Admin console',
      favicon: settingsMap.get('WEBSITE_FAVICON') || null,
      websiteName: settingsMap.get('WEBSITE_NAME') || 'AL FURQAN',
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

      // Typography
      primaryFontFamily,
      secondaryFontFamily,
      h1FontSize,
      h1FontWeight,
      h1FontFamily,
      h2FontSize,
      h2FontWeight,
      h2FontFamily,
      h3FontSize,
      h3FontWeight,
      h3FontFamily,
      h4FontSize,
      h4FontWeight,
      h4FontFamily,
      h5FontSize,
      h5FontWeight,
      h5FontFamily,
      pFontSize,
      pFontWeight,
      pFontFamily,
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

      // Save typography config
      primaryFontFamily: dto.primaryFontFamily,
      secondaryFontFamily: dto.secondaryFontFamily,
      h1FontSize: dto.h1FontSize,
      h1FontWeight: dto.h1FontWeight,
      h1FontFamily: dto.h1FontFamily,
      h2FontSize: dto.h2FontSize,
      h2FontWeight: dto.h2FontWeight,
      h2FontFamily: dto.h2FontFamily,
      h3FontSize: dto.h3FontSize,
      h3FontWeight: dto.h3FontWeight,
      h3FontFamily: dto.h3FontFamily,
      h4FontSize: dto.h4FontSize,
      h4FontWeight: dto.h4FontWeight,
      h4FontFamily: dto.h4FontFamily,
      h5FontSize: dto.h5FontSize,
      h5FontWeight: dto.h5FontWeight,
      h5FontFamily: dto.h5FontFamily,
      pFontSize: dto.pFontSize,
      pFontWeight: dto.pFontWeight,
      pFontFamily: dto.pFontFamily,
    };

    const updates = [
      { key: 'WEBSITE_LOGO', value: dto.logo || '' },
      { key: 'WEBSITE_LOGO_DARK', value: dto.logoDark || '' },
      {
        key: 'ADMIN_CONSOLE_TITLE',
        value: dto.adminConsoleTitle || 'Admin console',
      },
      { key: 'WEBSITE_FAVICON', value: dto.favicon || '' },
      { key: 'WEBSITE_THEME', value: JSON.stringify(themeObj) },
      { key: 'GOOGLE_TAGS', value: dto.googleTags || '' },
      { key: 'WEBSITE_NAME', value: dto.websiteName || 'AL FURQAN' },
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

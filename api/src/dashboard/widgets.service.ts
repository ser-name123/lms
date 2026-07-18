import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';

/*
 * Widget system.
 *
 * Three layers, resolved in order:
 *   1. DashboardWidget   — the registry. `roles` says which role dashboards a
 *                          widget is eligible for at all. Seeded by migration.
 *   2. RoleWidgetSetting — admin turns a widget on/off for a whole role.
 *                          Absent row = enabled (registry default).
 *   3. UserWidgetLayout  — the individual's own order / size / hidden flag.
 *
 * A user can never see a widget their role is not eligible for, and can never
 * re-enable one an admin disabled for the role — personalisation only ever
 * narrows, never widens.
 */

export interface ResolvedWidget {
  key: string;
  title: string;
  description: string | null;
  category: string;
  size: string;
  order: number;
  hidden: boolean;
}

@Injectable()
export class WidgetsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The full registry, for the admin widget-management screen. */
  async registry() {
    const widgets = await this.prisma.dashboardWidget.findMany({
      orderBy: [{ order: 'asc' }, { key: 'asc' }],
    });
    return widgets.map((w) => ({
      key: w.key,
      title: w.title,
      description: w.description,
      category: w.category,
      defaultSize: w.defaultSize,
      roles: w.roles,
      order: w.order,
    }));
  }

  /** Registry + per-role enabled flags, for the admin toggle matrix. */
  async roleMatrix(role: Role) {
    const [widgets, settings] = await Promise.all([
      this.prisma.dashboardWidget.findMany({
        where: { roles: { has: role } },
        orderBy: [{ order: 'asc' }, { key: 'asc' }],
      }),
      this.prisma.roleWidgetSetting.findMany({ where: { role } }),
    ]);
    const byKey = new Map(settings.map((s) => [s.widgetKey, s]));
    return widgets.map((w) => {
      const setting = byKey.get(w.key);
      return {
        key: w.key,
        title: w.title,
        description: w.description,
        category: w.category,
        defaultSize: w.defaultSize,
        enabled: setting?.enabled ?? true,
        order: setting?.order ?? w.order,
      };
    });
  }

  /** Admin: enable/disable + reorder widgets for a role. */
  async updateRoleWidgets(role: Role, items: { key: string; enabled?: boolean; order?: number }[]) {
    const known = await this.prisma.dashboardWidget.findMany({
      where: { key: { in: items.map((i) => i.key) } },
      select: { key: true, roles: true, order: true },
    });
    const knownByKey = new Map(known.map((k) => [k.key, k]));

    for (const item of items) {
      const widget = knownByKey.get(item.key);
      if (!widget) throw new NotFoundException(`Unknown widget: ${item.key}`);
      if (!widget.roles.includes(role)) {
        throw new NotFoundException(`Widget ${item.key} is not available for ${role}`);
      }
      await this.prisma.roleWidgetSetting.upsert({
        where: { role_widgetKey: { role, widgetKey: item.key } },
        create: {
          role,
          widgetKey: item.key,
          enabled: item.enabled ?? true,
          order: item.order ?? widget.order,
        },
        update: {
          ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
          ...(item.order === undefined ? {} : { order: item.order }),
        },
      });
    }
    return this.roleMatrix(role);
  }

  /**
   * What this specific user's dashboard should render, in order.
   * This is the single source of truth the frontend shell reads.
   */
  async forUser(userId: string, role: Role): Promise<ResolvedWidget[]> {
    const [widgets, roleSettings, layouts] = await Promise.all([
      this.prisma.dashboardWidget.findMany({
        where: { roles: { has: role } },
        orderBy: [{ order: 'asc' }, { key: 'asc' }],
      }),
      this.prisma.roleWidgetSetting.findMany({ where: { role } }),
      this.prisma.userWidgetLayout.findMany({ where: { userId } }),
    ]);

    const roleByKey = new Map(roleSettings.map((s) => [s.widgetKey, s]));
    const layoutByKey = new Map(layouts.map((l) => [l.widgetKey, l]));

    return widgets
      // An admin-disabled widget disappears entirely — the user cannot opt back in.
      .filter((w) => roleByKey.get(w.key)?.enabled !== false)
      .map((w) => {
        const layout = layoutByKey.get(w.key);
        const roleSetting = roleByKey.get(w.key);
        return {
          key: w.key,
          title: w.title,
          description: w.description,
          category: w.category,
          size: layout?.size ?? w.defaultSize,
          order: layout?.order ?? roleSetting?.order ?? w.order,
          hidden: layout?.hidden ?? false,
        };
      })
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  }

  /** The user's own reorder / resize / hide. */
  async saveUserLayout(
    userId: string,
    role: Role,
    items: { key: string; order?: number; size?: string; hidden?: boolean }[],
  ) {
    // Only widgets the role is eligible for may be personalised.
    const eligible = await this.prisma.dashboardWidget.findMany({
      where: { key: { in: items.map((i) => i.key) }, roles: { has: role } },
      select: { key: true },
    });
    const eligibleKeys = new Set(eligible.map((e) => e.key));

    for (const item of items) {
      if (!eligibleKeys.has(item.key)) continue; // silently skip anything not theirs
      await this.prisma.userWidgetLayout.upsert({
        where: { userId_widgetKey: { userId, widgetKey: item.key } },
        create: {
          userId,
          widgetKey: item.key,
          order: item.order ?? 0,
          size: item.size ?? null,
          hidden: item.hidden ?? false,
        },
        update: {
          ...(item.order === undefined ? {} : { order: item.order }),
          ...(item.size === undefined ? {} : { size: item.size }),
          ...(item.hidden === undefined ? {} : { hidden: item.hidden }),
        },
      });
    }
    return this.forUser(userId, role);
  }

  /** Drop every personalisation and fall back to the role defaults. */
  async resetUserLayout(userId: string, role: Role) {
    await this.prisma.userWidgetLayout.deleteMany({ where: { userId } });
    return this.forUser(userId, role);
  }
}

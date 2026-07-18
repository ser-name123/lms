import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto';

/*
 * Admin-editable message templates.
 *
 * Rendering is deliberately tiny — `{{var}}` substitution plus `{{#var}}…{{/var}}`
 * conditional sections. No expression language, no partials, no loops. A
 * template is content an admin types, so the renderer must not be able to
 * execute anything; anything unresolved is dropped rather than left as literal
 * `{{name}}` text in a message a parent reads.
 */

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const SECTION = /\{\{#\s*([a-zA-Z0-9_.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g;

export function renderTemplate(text: string, vars: Record<string, unknown> = {}): string {
  const value = (key: string) => {
    const found = key.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object' && part in (acc as object)) {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, vars);
    return found === null || found === undefined ? '' : String(found);
  };

  // Sections first: an empty variable removes the whole block, so
  // "{{#dueAt}} and is due {{dueAt}}{{/dueAt}}" collapses cleanly.
  return text
    .replace(SECTION, (_m, key: string, inner: string) => (value(key) ? inner : ''))
    .replace(PLACEHOLDER, (_m, key: string) => value(key));
}

/** Placeholders a template references — shown to the admin while editing. */
export function extractPlaceholders(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(PLACEHOLDER)) found.add(m[1]);
    for (const m of text.matchAll(SECTION)) found.add(m[1]);
  }
  return [...found].sort();
}

@Injectable()
export class NotificationTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.notificationTemplate.findMany({
      orderBy: [{ isSystem: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
    return rows.map((t) => ({
      ...t,
      placeholders: extractPlaceholders(t.subject, t.bodyText, t.bodyHtml),
    }));
  }

  async get(code: string) {
    const t = await this.prisma.notificationTemplate.findUnique({ where: { code } });
    if (!t) throw new NotFoundException(`No template with code ${code}`);
    return { ...t, placeholders: extractPlaceholders(t.subject, t.bodyText, t.bodyHtml) };
  }

  async create(dto: CreateTemplateDto) {
    const code = dto.code.trim().toUpperCase().replace(/\s+/g, '_');
    const clash = await this.prisma.notificationTemplate.findUnique({ where: { code } });
    if (clash) throw new BadRequestException(`A template with code ${code} already exists`);

    return this.prisma.notificationTemplate.create({
      data: {
        code,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category,
        priority: dto.priority ?? 'MEDIUM',
        channels: dto.channels ?? ['IN_APP'],
        subject: dto.subject,
        bodyText: dto.bodyText,
        bodyHtml: dto.bodyHtml ?? null,
        link: dto.link ?? null,
        active: dto.active ?? true,
        isSystem: false,
      },
    });
  }

  async update(code: string, dto: UpdateTemplateDto) {
    await this.get(code);
    return this.prisma.notificationTemplate.update({
      where: { code },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        category: dto.category ?? undefined,
        priority: dto.priority ?? undefined,
        channels: dto.channels ?? undefined,
        subject: dto.subject ?? undefined,
        bodyText: dto.bodyText ?? undefined,
        bodyHtml: dto.bodyHtml ?? undefined,
        link: dto.link ?? undefined,
        active: dto.active ?? undefined,
      },
    });
  }

  async remove(code: string) {
    const t = await this.get(code);
    // System templates are looked up by code by the engine, so deleting one
    // would break a send path. They stay editable.
    if (t.isSystem) {
      throw new BadRequestException(
        'System templates cannot be deleted. Deactivate it instead if you do not want it used.',
      );
    }
    await this.prisma.notificationTemplate.delete({ where: { code } });
    return { success: true };
  }

  /** Render with sample or supplied values so the admin sees the real output. */
  async preview(code: string, vars: Record<string, string> = {}) {
    const t = await this.get(code);
    // Any placeholder the caller did not supply gets a visible stand-in rather
    // than vanishing, so the admin can tell what a real send would include.
    const filled: Record<string, string> = { ...vars };
    for (const p of t.placeholders) if (!(p in filled)) filled[p] = `[${p}]`;

    return {
      code: t.code,
      subject: renderTemplate(t.subject, filled),
      bodyText: renderTemplate(t.bodyText, filled),
      bodyHtml: t.bodyHtml ? renderTemplate(t.bodyHtml, filled) : null,
      link: t.link,
      placeholders: t.placeholders,
      usedVars: filled,
    };
  }
}

/*
 * One way to turn a course code into the Course a student is enrolled in.
 *
 * Five call sites had grown their own copy of this, all of the same shape:
 *
 *   const course = await tx.course.upsert({
 *     where: { slug: code.toLowerCase() },
 *     update: {},
 *     create: { title, slug, price: 0, status: PUBLISHED },
 *   });
 *
 * Two things are wrong with keying on the slug. It invents a Course with a
 * fresh id when one already exists under a different slug — and the catalogue
 * does fall back to a suffixed slug when a name is taken — so the student ends
 * up enrolled in a course that does not appear in the admin panel at all.
 * And it makes up a price of 0 and a status of PUBLISHED rather than using
 * what the academy actually set, which then shows on invoices and reports.
 *
 * Keying on the id cannot do either: the catalogue entry and the relational
 * Course share one id by construction.
 */
import { CourseStatus } from '../generated/prisma/enums';

/** The catalogue's words for a course's state, and the enum's. */
const TO_ENUM: Record<string, CourseStatus> = {
  Active: CourseStatus.PUBLISHED,
  Draft: CourseStatus.DRAFT,
  Archived: CourseStatus.ARCHIVED,
};

type Tx = {
  lmsCourse: { findUnique: (a: any) => Promise<any> };
  course: {
    upsert: (a: any) => Promise<any>;
    findFirst: (a: any) => Promise<any>;
  };
};

/**
 * The Course behind a catalogue code, creating it if this row predates the
 * two lists being joined. Returns null when no such code is catalogued —
 * callers decide whether that is an error or a shrug.
 */
export async function courseForCode(
  tx: Tx,
  code: string,
): Promise<{ id: string; title: string } | null> {
  const lms = await tx.lmsCourse.findUnique({ where: { code } });
  if (!lms) return null;

  const fields = {
    title: lms.title,
    description: lms.description ?? null,
    price: lms.price ?? 0,
    durationWeeks: lms.durationWeeks ?? 12,
    status: TO_ENUM[lms.status] ?? CourseStatus.DRAFT,
  };

  /*
   * The slug is only set on create. Renaming a course must not move its slug
   * out from under links and bookmarks that already point at it, and the
   * catalogue's own update path owns that decision.
   */
  const course = await tx.course.upsert({
    where: { id: lms.id },
    update: fields,
    create: { id: lms.id, slug: await freeSlug(tx, lms.code, lms.id), ...fields },
  });
  return { id: course.id, title: course.title };
}

/**
 * The same slug the catalogue would pick, and the same fallback when the plain
 * one is taken by an unrelated Course. Only consulted on create, which after
 * the two lists were joined means a row inserted straight into LmsCourse.
 */
async function freeSlug(tx: Tx, code: string, id: string) {
  const base =
    String(code)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'course';
  const taken = await tx.course.findFirst({
    where: { slug: base, id: { not: id } },
    select: { id: true },
  });
  return taken ? `${base}-${id.slice(0, 8)}` : base;
}

/*
 * Raw-SQL migration for the Dashboard Management module.
 * DIRECT_URL (5432) is unreachable, so we apply plain DDL over the pooler
 * (DATABASE_URL), then run `npx prisma generate`. Fully idempotent.
 *
 * Adds:
 *   - Role enum value 'PARENT' (parent login)
 *   - ParentLink            (parent User <-> StudentProfile, many-to-many)
 *   - DashboardWidget       (widget registry, seeded below)
 *   - RoleWidgetSetting     (admin enables/disables widgets per role)
 *   - UserWidgetLayout      (per-user order / size / hidden)
 *   - Announcement + AnnouncementRead
 *
 * ALTER TYPE ... ADD VALUE cannot share a transaction with usage of the value,
 * so the enum statement runs first, on its own, outside the DDL batch.
 */
require('dotenv/config');
const { Client } = require('pg');

const ENUM_STATEMENTS = [`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PARENT'`];

const DDL = `
CREATE TABLE IF NOT EXISTS "ParentLink" (
  "id"           TEXT NOT NULL,
  "parentUserId" TEXT NOT NULL,
  "studentId"    TEXT NOT NULL,
  "relationship" TEXT,
  "isPrimary"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ParentLink_parentUserId_studentId_key" ON "ParentLink" ("parentUserId","studentId");
CREATE INDEX IF NOT EXISTS "ParentLink_parentUserId_idx" ON "ParentLink" ("parentUserId");
CREATE INDEX IF NOT EXISTS "ParentLink_studentId_idx" ON "ParentLink" ("studentId");

CREATE TABLE IF NOT EXISTS "DashboardWidget" (
  "key"         TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT NOT NULL DEFAULT 'KPI',
  "defaultSize" TEXT NOT NULL DEFAULT 'MD',
  "roles"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "RoleWidgetSetting" (
  "id"        TEXT NOT NULL,
  "role"      "Role" NOT NULL,
  "widgetKey" TEXT NOT NULL,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "order"     INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoleWidgetSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RoleWidgetSetting_role_widgetKey_key" ON "RoleWidgetSetting" ("role","widgetKey");
CREATE INDEX IF NOT EXISTS "RoleWidgetSetting_role_idx" ON "RoleWidgetSetting" ("role");

CREATE TABLE IF NOT EXISTS "UserWidgetLayout" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "widgetKey" TEXT NOT NULL,
  "order"     INTEGER NOT NULL DEFAULT 0,
  "size"      TEXT,
  "hidden"    BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserWidgetLayout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserWidgetLayout_userId_widgetKey_key" ON "UserWidgetLayout" ("userId","widgetKey");
CREATE INDEX IF NOT EXISTS "UserWidgetLayout_userId_idx" ON "UserWidgetLayout" ("userId");

CREATE TABLE IF NOT EXISTS "Announcement" (
  "id"           TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "body"         TEXT NOT NULL,
  "type"         TEXT NOT NULL DEFAULT 'GENERAL',
  "audience"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "pinned"       BOOLEAN NOT NULL DEFAULT false,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "link"         TEXT,
  "publishedAt"  TIMESTAMP(3),
  "expiresAt"    TIMESTAMP(3),
  "createdById"  TEXT,
  "createdByName" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Announcement_active_publishedAt_idx" ON "Announcement" ("active","publishedAt");

CREATE TABLE IF NOT EXISTS "AnnouncementRead" (
  "id"             TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "readAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead" ("announcementId","userId");
CREATE INDEX IF NOT EXISTS "AnnouncementRead_userId_idx" ON "AnnouncementRead" ("userId");

-- Earlier runs of this script created RoleWidgetSetting.role as TEXT, which
-- Prisma (declaring it as the Role enum) cannot compare against. Promote it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='RoleWidgetSetting' AND column_name='role' AND data_type='text'
  ) THEN
    ALTER TABLE "RoleWidgetSetting" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ParentLink_parentUserId_fkey') THEN
    ALTER TABLE "ParentLink" ADD CONSTRAINT "ParentLink_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ParentLink_studentId_fkey') THEN
    ALTER TABLE "ParentLink" ADD CONSTRAINT "ParentLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='RoleWidgetSetting_widgetKey_fkey') THEN
    ALTER TABLE "RoleWidgetSetting" ADD CONSTRAINT "RoleWidgetSetting_widgetKey_fkey" FOREIGN KEY ("widgetKey") REFERENCES "DashboardWidget"("key") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='UserWidgetLayout_userId_fkey') THEN
    ALTER TABLE "UserWidgetLayout" ADD CONSTRAINT "UserWidgetLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='UserWidgetLayout_widgetKey_fkey') THEN
    ALTER TABLE "UserWidgetLayout" ADD CONSTRAINT "UserWidgetLayout_widgetKey_fkey" FOREIGN KEY ("widgetKey") REFERENCES "DashboardWidget"("key") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AnnouncementRead_announcementId_fkey') THEN
    ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AnnouncementRead_userId_fkey') THEN
    ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
`;

/*
 * Widget registry seed. `roles` lists which role dashboards may show the widget.
 * ADMIN = Super Admin console, SUPERVISOR = day-to-day Admin console.
 */
const A = 'ADMIN', S = 'SUPERVISOR', C = 'ACADEMIC_COACH', T = 'TEACHER', ST = 'STUDENT', P = 'PARENT';
const WIDGETS = [
  // --- Super Admin (ADMIN) ---
  ['sa.kpis',              'Academy KPIs',              'Students, teachers, courses, batches, revenue, profit', 'KPI',   'FULL', [A],        10],
  ['sa.live',              'Live Statistics',           'Online students, running classes, today rates',         'KPI',   'FULL', [A],        20],
  ['sa.chart.growth',      'Student Growth',            'Monthly student growth trend',                          'CHART', 'MD',   [A],        30],
  ['sa.chart.revenue',     'Revenue Trend',             'Revenue vs expenses over time',                         'CHART', 'MD',   [A],        40],
  ['sa.chart.admissions',  'Monthly Admissions',        'Admissions per month',                                  'CHART', 'MD',   [A],        50],
  ['sa.chart.attendance',  'Attendance Trend',          'Academy-wide attendance rate',                          'CHART', 'MD',   [A],        60],
  ['sa.chart.assessment',  'Assessment Performance',    'Average assessment scores',                             'CHART', 'MD',   [A],        70],
  ['sa.chart.assignment',  'Assignment Completion',     'Assignment completion rate',                            'CHART', 'MD',   [A],        80],
  ['sa.chart.teacher',     'Teacher Performance',       'Top teachers by rating and load',                       'CHART', 'MD',   [A],        90],
  ['sa.chart.batch',       'Batch Utilization',         'Seat utilization per batch',                            'CHART', 'MD',   [A],       100],
  ['sa.chart.country',     'Country Wise Students',     'Student distribution by country',                       'CHART', 'MD',   [A],       110],
  ['sa.chart.course',      'Course Wise Students',      'Student distribution by course',                        'CHART', 'MD',   [A],       120],
  ['sa.actions',           'Quick Actions',             'Add student, teacher, course, batch, fee',              'ACTION','MD',   [A],       130],

  // --- Admin (SUPERVISOR) ---
  ['ad.kpis',              'Today Overview',            "Today's admissions, trials, classes, attendance",        'KPI',   'FULL', [S],        10],
  ['ad.pending',           'Pending Queue',             'Assignments, assessments, fees, approvals',             'KPI',   'FULL', [S],        20],
  // Only SUPERVISOR: these render in admin-ops-panel, which ADMIN never loads.
  // Granting them to ADMIN leaves two empty slots on the Super Admin grid.
  ['ad.upcoming',          'Upcoming Classes',          'Time / course / teacher / students',                    'TABLE', 'LG',   [S],        30],
  ['ad.tasks',             'Pending Tasks',             'Approvals, batch assignment, parent requests',          'TABLE', 'LG',   [S],        40],
  ['ad.chart.admissions',  'Admissions Chart',          'Admissions trend',                                      'CHART', 'MD',   [S],        50],
  ['ad.chart.attendance',  'Attendance Chart',          'Attendance trend',                                      'CHART', 'MD',   [S],        60],
  ['ad.chart.assignment',  'Assignment Status',         'Assignment status split',                               'CHART', 'MD',   [S],        70],
  ['ad.chart.fees',        'Fees Collection',           'Collected vs outstanding',                              'CHART', 'MD',   [S],        80],
  ['ad.actions',           'Quick Actions',             'Register student, assign teacher, schedule trial',      'ACTION','MD',   [S],        90],

  // --- Academic Coach ---
  ['co.kpis',              'Coach KPIs',                'Assigned, at-risk, reviews, meetings, goals',           'KPI',   'FULL', [C],        10],
  ['co.performance',       'Student Performance',       'Top performers, need attention, weak, new',             'TABLE', 'LG',   [C],        20],
  ['co.chart.progress',    'Progress Trend',            'Average progress over time',                            'CHART', 'MD',   [C],        30],
  ['co.chart.assessment',  'Assessment Trend',          'Assessment score trend',                                'CHART', 'MD',   [C],        40],
  ['co.chart.assignment',  'Assignment Completion',     'Completion rate trend',                                 'CHART', 'MD',   [C],        50],
  ['co.chart.attendance',  'Attendance Trend',          'Attendance rate trend',                                 'CHART', 'MD',   [C],        60],
  ['co.tasks',             'Upcoming Tasks',            'Meetings, reviews, trial evaluations, counseling',      'LIST',  'MD',   [C],        70],
  ['co.actions',           'Quick Actions',             'Add review, schedule meeting, update goal',             'ACTION','MD',   [C],        80],

  // --- Teacher ---
  ['te.kpis',              'Teacher KPIs',              'Classes, students, pending reviews, attendance',        'KPI',   'FULL', [T],        10],
  ['te.schedule',          "Today's Schedule",          'Time / course / batch / join',                          'TABLE', 'LG',   [T],        20],
  ['te.pending',           'Pending Work',              'Check assignments, evaluate tests, take attendance',    'LIST',  'MD',   [T],        30],
  ['te.students',          'Student Summary',           'Highest performer, low attendance, weak students',      'TABLE', 'LG',   [T],        40],
  ['te.chart.completion',  'Class Completion',          'Completed vs scheduled classes',                        'CHART', 'MD',   [T],        50],
  ['te.chart.attendance',  'Student Attendance',        'Attendance trend for my students',                      'CHART', 'MD',   [T],        60],
  ['te.chart.assignment',  'Assignment Status',         'Assignment status split',                               'CHART', 'MD',   [T],        70],
  ['te.chart.assessment',  'Assessment Average',        'Average assessment score trend',                        'CHART', 'MD',   [T],        80],
  ['te.actions',           'Quick Actions',             'Start class, create assignment, take attendance',       'ACTION','MD',   [T],        90],

  // --- Student ---
  ['st.kpis',              'My Overview',               'Classes, attendance, assignments, tests, progress',     'KPI',   'FULL', [ST],       10],
  ['st.schedule',          "Today's Schedule",          'Time / subject / teacher / join',                       'TABLE', 'LG',   [ST],       20],
  ['st.pending',           'Pending Work',              'Assignments due, tests tomorrow, feedback',             'LIST',  'MD',   [ST],       30],
  ['st.progress',          'My Progress',               'Attendance, assignments, assessment, skills',           'CHART', 'MD',   [ST],       40],
  ['st.achievements',      'Achievements',              'Certificates, completed courses, badges',               'LIST',  'MD',   [ST],       50],
  ['st.actions',           'Quick Actions',             'Join class, submit assignment, start assessment',       'ACTION','MD',   [ST],       60],

  // --- Parent ---
  ['pa.kpis',              'Child Overview',            'Attendance, assignments, results, fees, progress',      'KPI',   'FULL', [P],        10],
  ['pa.timeline',          'Child Timeline',            "Today's class, homework, upcoming test, remarks",        'LIST',  'LG',   [P],        20],
  ['pa.chart.attendance',  'Attendance Trend',          'Child attendance over time',                            'CHART', 'MD',   [P],        30],
  ['pa.chart.marks',       'Marks Trend',               'Assessment marks over time',                            'CHART', 'MD',   [P],        40],
  ['pa.chart.progress',    'Progress Trend',            'Overall progress over time',                            'CHART', 'MD',   [P],        50],
  ['pa.fees',              'Fee Summary',               'Outstanding, last payment, next due, receipts',         'TABLE', 'MD',   [P],        60],
  ['pa.actions',           'Quick Actions',             'Pay fee, contact teacher or coach, report card',        'ACTION','MD',   [P],        70],

  // --- Common (every role) ---
  ['cm.notifications',     'Notifications',             'Real-time notification feed',                           'LIST',  'MD',   [A,S,C,T,ST,P], 200],
  ['cm.calendar',          'Calendar',                  'Classes, assignments, assessments, meetings, holidays', 'LIST',  'MD',   [A,S,C,T,ST,P], 210],
  ['cm.activity',          'Recent Activity',           'Latest academy activity feed',                          'LIST',  'MD',   [A,S,C,T],      220],
  ['cm.announcements',     'Announcements',             'Published academy announcements',                       'LIST',  'MD',   [A,S,C,T,ST,P], 230],
  ['cm.reports',           'Quick Reports',             'One-click report downloads',                            'ACTION','MD',   [A,C],          240],
];

(async () => {
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    // Enum values must be added outside the DDL batch (auto-commit, one per call).
    for (const stmt of ENUM_STATEMENTS) await client.query(stmt);

    await client.query(DDL);

    // Seed / refresh the widget registry. Titles and roles are authoritative here;
    // admin's per-role enable/disable lives in RoleWidgetSetting and is preserved.
    for (const [key, title, description, category, defaultSize, roles, order] of WIDGETS) {
      await client.query(
        `INSERT INTO "DashboardWidget" ("key","title","description","category","defaultSize","roles","order")
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT ("key") DO UPDATE SET
           "title"=EXCLUDED."title", "description"=EXCLUDED."description",
           "category"=EXCLUDED."category", "defaultSize"=EXCLUDED."defaultSize",
           "roles"=EXCLUDED."roles", "order"=EXCLUDED."order"`,
        [key, title, description, category, defaultSize, roles, order],
      );
    }

    const { rows } = await client.query(
      `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_name IN
         ('ParentLink','DashboardWidget','RoleWidgetSetting','UserWidgetLayout','Announcement','AnnouncementRead'))::int AS tables,
        (SELECT count(*) FROM "DashboardWidget")::int AS widgets,
        (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
          WHERE t.typname='Role' AND e.enumlabel='PARENT')::int AS parent_role`,
    );
    console.log(
      `OK: ${rows[0].tables}/6 dashboard tables · ${rows[0].widgets} widgets seeded · PARENT role ${rows[0].parent_role ? 'present' : 'MISSING'}`,
    );
  } finally {
    await client.end();
  }
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });

/*
 * Raw-SQL migration for the Notification Management module.
 *
 * DIRECT_URL (5432) is unreachable, so plain DDL goes over the pooler
 * (DATABASE_URL); run `npx prisma generate` afterwards. Fully idempotent —
 * safe to re-run, and the template seed is authoritative for the system
 * templates while admin edits to non-system rows are never touched.
 *
 * CREATE TYPE has no IF NOT EXISTS, so each enum is created inside a guarded
 * DO block, one statement at a time and BEFORE the DDL batch — a type created
 * in the same transaction that uses it will fail.
 */
require('dotenv/config');
const { Client } = require('pg');

const ENUM_STATEMENTS = [
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='NotificationCategory') THEN
       CREATE TYPE "NotificationCategory" AS ENUM
         ('ACADEMIC','ATTENDANCE','ASSIGNMENT','ASSESSMENT','FINANCE','PROGRESS','SYSTEM');
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='NotificationPriority') THEN
       CREATE TYPE "NotificationPriority" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='NotificationStatus') THEN
       CREATE TYPE "NotificationStatus" AS ENUM
         ('DRAFT','SCHEDULED','QUEUED','SENT','DELIVERED','READ','FAILED','ARCHIVED');
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='NotificationChannel') THEN
       CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP','EMAIL','PUSH','WHATSAPP','SMS');
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='BroadcastAudience') THEN
       CREATE TYPE "BroadcastAudience" AS ENUM ('ALL','ROLE','COURSE','BATCH','STUDENTS');
     END IF;
   END $$;`,
];

const DDL = `
-- ── Broadcast (declared first: Notification references it) ──────────────────
CREATE TABLE IF NOT EXISTS "NotificationBroadcast" (
  "id"             TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "link"           TEXT,
  "templateCode"   TEXT,
  "category"       "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
  "priority"       "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
  "channels"       "NotificationChannel"[] NOT NULL DEFAULT ARRAY[]::"NotificationChannel"[],
  "audience"       "BroadcastAudience" NOT NULL DEFAULT 'ALL',
  "roles"          "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[],
  "courseId"       TEXT,
  "batchId"        TEXT,
  "studentIds"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "scheduledAt"    TIMESTAMP(3),
  "status"         "NotificationStatus" NOT NULL DEFAULT 'DRAFT',
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount"      INTEGER NOT NULL DEFAULT 0,
  "failedCount"    INTEGER NOT NULL DEFAULT 0,
  "sentAt"         TIMESTAMP(3),
  "cancelledAt"    TIMESTAMP(3),
  "createdById"    TEXT,
  "createdByName"  TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationBroadcast_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NotificationBroadcast_status_scheduledAt_idx"
  ON "NotificationBroadcast" ("status","scheduledAt");

-- ── Notification: new columns on the existing table ─────────────────────────
ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "category"     "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN IF NOT EXISTS "priority"     "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "status"       "NotificationStatus" NOT NULL DEFAULT 'SENT',
  ADD COLUMN IF NOT EXISTS "readAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actorId"      TEXT,
  ADD COLUMN IF NOT EXISTS "actorName"    TEXT,
  ADD COLUMN IF NOT EXISTS "broadcastId"  TEXT,
  ADD COLUMN IF NOT EXISTS "templateCode" TEXT,
  ADD COLUMN IF NOT EXISTS "meta"         JSONB;

CREATE INDEX IF NOT EXISTS "Notification_userId_archivedAt_createdAt_idx"
  ON "Notification" ("userId","archivedAt","createdAt");
CREATE INDEX IF NOT EXISTS "Notification_category_idx"    ON "Notification" ("category");
CREATE INDEX IF NOT EXISTS "Notification_status_idx"      ON "Notification" ("status");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx"   ON "Notification" ("createdAt");
CREATE INDEX IF NOT EXISTS "Notification_broadcastId_idx" ON "Notification" ("broadcastId");

-- Rows that predate the module are already-delivered in-app messages; give the
-- read ones a readAt so read-rate reports are not skewed by a null column.
UPDATE "Notification" SET "status"='READ' WHERE "read" = true AND "status" = 'SENT';
UPDATE "Notification" SET "readAt" = "createdAt" WHERE "read" = true AND "readAt" IS NULL;

-- ── Delivery log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
  "id"             TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "channel"        "NotificationChannel" NOT NULL,
  "status"         "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "lastError"      TEXT,
  "skippedReason"  TEXT,
  "target"         TEXT,
  "providerRef"    TEXT,
  "queuedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"         TIMESTAMP(3),
  "deliveredAt"    TIMESTAMP(3),
  "failedAt"       TIMESTAMP(3),
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_notificationId_channel_key"
  ON "NotificationDelivery" ("notificationId","channel");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_status_channel_idx"
  ON "NotificationDelivery" ("status","channel");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_queuedAt_idx" ON "NotificationDelivery" ("queuedAt");

-- ── Per-user preferences ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "inApp"           BOOLEAN NOT NULL DEFAULT true,
  "email"           BOOLEAN NOT NULL DEFAULT true,
  "push"            BOOLEAN NOT NULL DEFAULT true,
  "whatsapp"        BOOLEAN NOT NULL DEFAULT false,
  "sms"             BOOLEAN NOT NULL DEFAULT false,
  "muteMarketing"   BOOLEAN NOT NULL DEFAULT false,
  "mutedCategories" "NotificationCategory"[] NOT NULL DEFAULT ARRAY[]::"NotificationCategory"[],
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key"
  ON "NotificationPreference" ("userId");

-- ── Templates ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "NotificationTemplate" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "category"    "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
  "priority"    "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
  "channels"    "NotificationChannel"[] NOT NULL DEFAULT ARRAY[]::"NotificationChannel"[],
  "subject"     TEXT NOT NULL,
  "bodyText"    TEXT NOT NULL,
  "bodyHtml"    TEXT,
  "link"        TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "isSystem"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationTemplate_code_key" ON "NotificationTemplate" ("code");
CREATE INDEX IF NOT EXISTS "NotificationTemplate_category_idx" ON "NotificationTemplate" ("category");

-- ── Web Push subscriptions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "endpoint"   TEXT NOT NULL,
  "p256dh"     TEXT NOT NULL,
  "auth"       TEXT NOT NULL,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription" ("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription" ("userId");

-- ── Foreign keys (no IF NOT EXISTS — guard on pg_constraint) ────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Notification_broadcastId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_broadcastId_fkey"
      FOREIGN KEY ("broadcastId") REFERENCES "NotificationBroadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NotificationDelivery_notificationId_fkey') THEN
    ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey"
      FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NotificationPreference_userId_fkey') THEN
    ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PushSubscription_userId_fkey') THEN
    ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
`;

/*
 * System templates. `isSystem = true` means the engine may look them up by
 * code, so they can be edited but not deleted. Placeholders are {{name}}-style
 * and rendered by NotificationRenderer.
 */
const IN_APP = 'IN_APP', EMAIL = 'EMAIL', PUSH = 'PUSH';
const TEMPLATES = [
  // code, name, category, priority, channels, subject, bodyText, link
  ['WELCOME', 'Welcome', 'SYSTEM', 'MEDIUM', [IN_APP, EMAIL],
    'Welcome to {{academy}}, {{name}}',
    'Hi {{name}}, your account is ready. Sign in to see your classes, assignments and progress.', '/dashboard'],
  ['ASSIGNMENT_PUBLISHED', 'Assignment published', 'ASSIGNMENT', 'MEDIUM', [IN_APP, EMAIL, PUSH],
    'New assignment: {{title}}',
    '{{title}} has been published{{#dueAt}} and is due {{dueAt}}{{/dueAt}}.', '/student/assignments'],
  ['ASSIGNMENT_DUE', 'Assignment reminder', 'ASSIGNMENT', 'HIGH', [IN_APP, EMAIL, PUSH],
    'Assignment due: {{title}}',
    '{{title}} is due {{dueAt}}. Submit before the deadline to avoid a late penalty.', '/student/assignments'],
  ['ASSESSMENT_PUBLISHED', 'Assessment published', 'ASSESSMENT', 'MEDIUM', [IN_APP, EMAIL, PUSH],
    'New assessment: {{title}}',
    '{{title}} is now available. It starts {{startAt}}.', '/student/assessments'],
  ['ASSESSMENT_RESULT', 'Assessment result', 'ASSESSMENT', 'HIGH', [IN_APP, EMAIL],
    'Result published: {{title}}',
    'You scored {{score}} out of {{total}} ({{percentage}}%) in {{title}}.', '/student/assessments'],
  ['ATTENDANCE_ALERT', 'Attendance alert', 'ATTENDANCE', 'HIGH', [IN_APP, EMAIL, PUSH],
    'Attendance alert for {{name}}',
    "{{name}}'s attendance is {{percentage}}%, below the required {{threshold}}%.", '/attendance'],
  ['CLASS_REMINDER', 'Class reminder', 'ACADEMIC', 'HIGH', [IN_APP, PUSH],
    'Class starting soon: {{title}}',
    '{{title}} starts at {{time}}. Join on time.', '/student/classes'],
  ['FEE_REMINDER', 'Fee reminder', 'FINANCE', 'HIGH', [IN_APP, EMAIL],
    'Fee due: invoice {{number}}',
    'Invoice {{number}} for {{amount}} is due on {{dueAt}}.', '/student/fees'],
  ['PAYMENT_SUCCESS', 'Payment received', 'FINANCE', 'MEDIUM', [IN_APP, EMAIL],
    'Payment received — {{amount}}',
    'We have received {{amount}} against invoice {{number}}. Thank you.', '/student/invoices'],
  ['PAYMENT_FAILED', 'Payment failed', 'FINANCE', 'CRITICAL', [IN_APP, EMAIL, PUSH],
    'Payment failed for invoice {{number}}',
    'The payment of {{amount}} against invoice {{number}} did not go through. Please try again.', '/student/fees'],
  ['PROGRESS_REPORT', 'Monthly progress report', 'PROGRESS', 'MEDIUM', [IN_APP, EMAIL],
    "{{name}}'s progress report for {{month}}",
    'Overall progress {{progress}}%, attendance {{attendance}}%. Open the dashboard for the full report.', '/parent/dashboard'],
  ['TEACHER_FEEDBACK', 'Teacher feedback', 'PROGRESS', 'MEDIUM', [IN_APP, EMAIL],
    'New feedback from {{teacher}}',
    '{{teacher}} left feedback on {{name}}: {{remarks}}', '/student/progress'],
  ['CERTIFICATE_AVAILABLE', 'Certificate available', 'PROGRESS', 'MEDIUM', [IN_APP, EMAIL],
    'Your certificate for {{course}} is ready',
    'Congratulations — your certificate for {{course}} is ready to download.', '/student/dashboard'],
  ['LEAVE_APPROVAL', 'Leave decision', 'SYSTEM', 'HIGH', [IN_APP, EMAIL],
    'Your leave request was {{decision}}',
    'Your {{leaveType}} leave from {{from}} to {{to}} was {{decision}}.', '/leaves'],
  ['PASSWORD_RESET', 'Password changed', 'SYSTEM', 'CRITICAL', [IN_APP, EMAIL],
    'Your password was changed',
    'Your password was changed on {{at}}. If this was not you, contact the academy immediately.', '/profile'],
  ['LOGIN_ALERT', 'New sign-in', 'SYSTEM', 'CRITICAL', [IN_APP, EMAIL],
    'New sign-in to your account',
    'A new sign-in was recorded on {{at}}{{#device}} from {{device}}{{/device}}.', '/profile'],
  ['ANNOUNCEMENT', 'General announcement', 'SYSTEM', 'MEDIUM', [IN_APP, EMAIL, PUSH],
    '{{title}}',
    '{{body}}', '/dashboard'],
];

(async () => {
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    // One per call, outside the DDL batch: a type cannot be created and used
    // in the same transaction.
    for (const stmt of ENUM_STATEMENTS) await client.query(stmt);

    await client.query(DDL);

    /*
     * Seed / refresh system templates. Subject and body are authoritative on
     * first insert only — an admin who edits the wording must not have it
     * reverted by the next deploy, so DO UPDATE touches only the structural
     * columns (category/priority/channels/name).
     */
    for (const [code, name, category, priority, channels, subject, bodyText, link] of TEMPLATES) {
      await client.query(
        `INSERT INTO "NotificationTemplate"
           ("id","code","name","description","category","priority","channels","subject","bodyText","link","isSystem")
         VALUES (gen_random_uuid(),$1,$2,NULL,$3,$4,$5,$6,$7,$8,true)
         ON CONFLICT ("code") DO UPDATE SET
           "name"=EXCLUDED."name", "category"=EXCLUDED."category",
           "priority"=EXCLUDED."priority", "channels"=EXCLUDED."channels",
           "isSystem"=true, "updatedAt"=CURRENT_TIMESTAMP`,
        [code, name, category, priority, channels, subject, bodyText, link],
      );
    }

    const { rows } = await client.query(
      `SELECT
         (SELECT count(*) FROM information_schema.tables WHERE table_name IN
           ('NotificationDelivery','NotificationPreference','NotificationTemplate',
            'NotificationBroadcast','PushSubscription'))::int AS tables,
         (SELECT count(*) FROM pg_type WHERE typname IN
           ('NotificationCategory','NotificationPriority','NotificationStatus',
            'NotificationChannel','BroadcastAudience'))::int AS enums,
         (SELECT count(*) FROM "NotificationTemplate")::int AS templates,
         (SELECT count(*) FROM information_schema.columns
           WHERE table_name='Notification' AND column_name IN
             ('category','priority','status','readAt','archivedAt','scheduledAt',
              'actorId','actorName','broadcastId','templateCode','meta'))::int AS cols`,
    );
    console.log(
      `OK: ${rows[0].tables}/5 tables · ${rows[0].enums}/5 enums · ` +
        `${rows[0].cols}/11 Notification columns · ${rows[0].templates} templates seeded`,
    );
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});

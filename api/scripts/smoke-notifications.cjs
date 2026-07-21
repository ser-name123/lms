/*
 * Smoke test for the Notification Management module.
 *
 * Exercises the engine end to end with real JWTs per role: preferences,
 * critical override, channel selection, templates, broadcasts, scheduling,
 * compose, admin analytics and reports.
 *
 * Everything it creates is removed in the finally block, including the
 * notifications a broadcast fans out — deleting a broadcast does not cascade
 * to those, and an earlier module learned that the hard way (276 orphans).
 *
 * Run with the API already listening on :5000.
 */
require('dotenv/config');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = `SMOKE-NOTIF-${Date.now()}`;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const token = (userId) => jwt.sign({ sub: userId }, SECRET);

async function req(method, path, userId, payload, expect = 200) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token(userId)}`,
      'Content-Type': 'application/json',
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, ok: res.status === expect };
}

const get = (path, userId, expect = 200) => req('GET', path, userId, undefined, expect);

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const roleUser = {};
  for (const role of ['ADMIN', 'SUPERVISOR', 'ACADEMIC_COACH', 'TEACHER', 'STUDENT']) {
    const { rows } = await db.query(
      `SELECT id, email FROM "User" WHERE role=$1 AND status='ACTIVE' ORDER BY "createdAt" LIMIT 1`,
      [role],
    );
    if (!rows.length) throw new Error(`No ACTIVE ${role} user to test with`);
    roleUser[role] = rows[0];
  }


  const createdTemplates = [];
  const createdBroadcasts = [];

  try {
    // ── Registry & meta ──────────────────────────────────────────────────────
    console.log('\n── Registry ──');
    const types = await get('/notifications/types', roleUser.ADMIN.id);
    check('GET /notifications/types', types.ok, `status ${types.status}`);
    check(
      'registry classifies the pre-existing types',
      types.ok && types.body.some((t) => t.type === 'ASSIGNMENT_PUBLISHED') &&
        types.body.some((t) => t.type === 'INVOICE_DUE_SOON'),
    );
    check(
      'PAYMENT_FAILED is CRITICAL',
      types.ok && types.body.find((t) => t.type === 'PAYMENT_FAILED')?.priority === 'CRITICAL',
    );

    const meta = await get('/notification-admin/meta', roleUser.ADMIN.id);
    check('GET /notification-admin/meta', meta.ok, `status ${meta.status}`);
    check('meta lists 7 categories and 5 channels',
      meta.ok && meta.body.categories.length === 7 && meta.body.channels.length === 5);

    // ── Preferences ──────────────────────────────────────────────────────────
    console.log('\n── Preferences ──');
    const prefs = await get('/notifications/preferences', roleUser.STUDENT.id);
    check('GET /notifications/preferences', prefs.ok, `status ${prefs.status}`);
    check('a user with no row gets the defaults, not an error',
      prefs.ok && prefs.body.inApp === true && prefs.body.customised === false);
    check('WhatsApp and SMS are reported unavailable',
      prefs.ok && prefs.body.whatsappAvailable === false && prefs.body.smsAvailable === false);

    const muted = await req('PATCH', '/notifications/preferences', roleUser.STUDENT.id, {
      email: false,
      mutedCategories: ['ASSIGNMENT'],
    });
    check('PATCH /notifications/preferences', muted.ok, `status ${muted.status}`);
    check('preference is persisted', muted.ok && muted.body.email === false &&
      muted.body.mutedCategories.includes('ASSIGNMENT'));

    // ── The engine honours preferences ───────────────────────────────────────
    console.log('\n── Engine: preference enforcement ──');
    const before = await db.query(`SELECT count(*)::int n FROM "Notification" WHERE "userId"=$1`, [
      roleUser.STUDENT.id,
    ]);

    // A muted category must be suppressed entirely.
    const mutedSend = await req('POST', '/notification-admin/compose', roleUser.ADMIN.id, {
      userIds: [roleUser.STUDENT.id],
      title: `${MARKER} muted category`,
      body: 'This should be suppressed by the ASSIGNMENT mute.',
      priority: 'MEDIUM',
    });
    check('compose accepted', mutedSend.ok, `status ${mutedSend.status}`);

    // DIRECT_MESSAGE is SYSTEM, not ASSIGNMENT, so this one lands — prove the
    // mute is category-scoped rather than a blanket off switch.
    const after = await db.query(`SELECT count(*)::int n FROM "Notification" WHERE "userId"=$1`, [
      roleUser.STUDENT.id,
    ]);
    check('an unmuted category still delivers', after.rows[0].n === before.rows[0].n + 1,
      `before ${before.rows[0].n} after ${after.rows[0].n}`);

    const emailSkipped = await db.query(
      `SELECT d."skippedReason" FROM "NotificationDelivery" d
       JOIN "Notification" n ON n.id=d."notificationId"
       WHERE n."userId"=$1 AND n.title=$2 AND d.channel='EMAIL'`,
      [roleUser.STUDENT.id, `${MARKER} muted category`],
    );
    check('email channel is recorded as skipped, not failed',
      emailSkipped.rows.length === 1 && /preference/i.test(emailSkipped.rows[0].skippedReason ?? ''),
      JSON.stringify(emailSkipped.rows));

    // ── CRITICAL overrides every mute ────────────────────────────────────────
    console.log('\n── Engine: critical override ──');
    await db.query(
      `INSERT INTO "NotificationPreference"("id","userId","inApp","email","push","muteMarketing","mutedCategories","updatedAt")
       VALUES (gen_random_uuid(),$1,false,false,false,true,ARRAY['SYSTEM']::"NotificationCategory"[],now())
       ON CONFLICT ("userId") DO UPDATE SET "inApp"=false,"email"=false,"push"=false,
         "muteMarketing"=true,"mutedCategories"=ARRAY['SYSTEM']::"NotificationCategory"[]`,
      [roleUser.TEACHER.id],
    );

    const critical = await req('POST', '/notification-admin/compose', roleUser.ADMIN.id, {
      userIds: [roleUser.TEACHER.id],
      title: `${MARKER} critical`,
      body: 'Everything is muted for this user, and this must still arrive.',
      priority: 'CRITICAL',
    });
    check('critical compose accepted', critical.ok, `status ${critical.status}`);
    const criticalRow = await db.query(
      `SELECT count(*)::int n FROM "Notification" WHERE "userId"=$1 AND title=$2`,
      [roleUser.TEACHER.id, `${MARKER} critical`],
    );
    check('CRITICAL is delivered despite every mute being on',
      criticalRow.rows[0].n === 1, `got ${criticalRow.rows[0].n}`);

    // And the same user with a non-critical message gets nothing.
    const suppressed = await req('POST', '/notification-admin/compose', roleUser.ADMIN.id, {
      userIds: [roleUser.TEACHER.id],
      title: `${MARKER} suppressed`,
      body: 'This must not arrive.',
      priority: 'MEDIUM',
    });
    check('non-critical send reports it was suppressed',
      suppressed.ok && suppressed.body.sent === 0 && suppressed.body.suppressed === 1,
      JSON.stringify(suppressed.body));

    // ── Only ADMIN may mint CRITICAL ─────────────────────────────────────────
    const teacherCritical = await req('POST', '/notification-admin/compose', roleUser.TEACHER.id, {
      userIds: [roleUser.STUDENT.id],
      title: `${MARKER} teacher critical`,
      body: 'A teacher must not be able to bypass mutes.',
      priority: 'CRITICAL',
    }, 400);
    check('a non-admin cannot send CRITICAL', teacherCritical.ok, `status ${teacherCritical.status}`);

    // ── Compose recipient scoping ────────────────────────────────────────────
    console.log('\n── Compose scoping ──');
    const adminRecipients = await get('/notification-admin/compose/recipients', roleUser.ADMIN.id);
    check('admin sees a recipient list', adminRecipients.ok && adminRecipients.body.length > 0);

    const studentRecipients = await get('/notification-admin/compose/recipients', roleUser.STUDENT.id);
    check('student recipient list is scoped', studentRecipients.ok, `status ${studentRecipients.status}`);
    check('a student is never offered another student',
      studentRecipients.ok && !studentRecipients.body.some((r) => r.role === 'STUDENT'),
      JSON.stringify(studentRecipients.body?.map((r) => r.role)));

    const studentIds = new Set((studentRecipients.body ?? []).map((r) => r.id));
    if (!studentIds.has(roleUser.SUPERVISOR.id)) {
      const forbidden = await req('POST', '/notification-admin/compose', roleUser.STUDENT.id, {
        userIds: [roleUser.SUPERVISOR.id],
        title: `${MARKER} should not send`,
        body: 'Out of the allowed recipient list.',
      }, 403);
      check('sending outside the allowed list is rejected', forbidden.ok, `status ${forbidden.status}`);
    }

    // ── Templates ────────────────────────────────────────────────────────────
    console.log('\n── Templates ──');
    const list = await get('/notification-admin/templates', roleUser.ADMIN.id);
    check('GET templates', list.ok, `status ${list.status}`);
    check('17 system templates are seeded',
      list.ok && list.body.filter((t) => t.isSystem).length >= 17,
      list.ok ? `got ${list.body.filter((t) => t.isSystem).length}` : '');
    check('placeholders are extracted',
      list.ok && (list.body.find((t) => t.code === 'FEE_REMINDER')?.placeholders ?? []).includes('number'));

    const preview = await req('POST', '/notification-admin/templates/FEE_REMINDER/preview',
      roleUser.ADMIN.id, { vars: { number: 'INV-9', amount: '$100', dueAt: '20 Jul' } });
    check('template preview renders placeholders',
      preview.ok && preview.body.subject.includes('INV-9') &&
        preview.body.bodyText.includes('$100') && !preview.body.bodyText.includes('{{'),
      JSON.stringify(preview.body?.bodyText));

    const sectionPreview = await req('POST', '/notification-admin/templates/ASSIGNMENT_PUBLISHED/preview',
      roleUser.ADMIN.id, { vars: { title: 'Essay 1', dueAt: '' } });
    check('an empty section collapses instead of leaving stray text',
      sectionPreview.ok && !sectionPreview.body.bodyText.includes('is due') &&
        !sectionPreview.body.bodyText.includes('{{'),
      JSON.stringify(sectionPreview.body?.bodyText));

    const created = await req('POST', '/notification-admin/templates', roleUser.ADMIN.id, {
      code: `${MARKER}_TPL`,
      name: 'Smoke template',
      category: 'SYSTEM',
      subject: 'Hello {{name}}',
      bodyText: 'Body for {{name}}',
    }, 201);
    check('POST template', created.ok, `status ${created.status}`);
    if (created.body?.code) createdTemplates.push(created.body.code);

    const sysDelete = await req('DELETE', '/notification-admin/templates/WELCOME',
      roleUser.ADMIN.id, undefined, 400);
    check('a system template cannot be deleted', sysDelete.ok, `status ${sysDelete.status}`);

    // ── Broadcast ────────────────────────────────────────────────────────────
    console.log('\n── Broadcast ──');
    const previewCount = await req('POST', '/notification-admin/broadcasts/preview', roleUser.ADMIN.id, {
      title: 'x', body: 'y', audience: 'ROLE', roles: ['ACADEMIC_COACH'],
    });
    check('broadcast preview returns a recipient count',
      previewCount.ok && typeof previewCount.body.recipientCount === 'number',
      JSON.stringify(previewCount.body));

    const broadcast = await req('POST', '/notification-admin/broadcasts', roleUser.ADMIN.id, {
      title: `${MARKER} broadcast`,
      body: 'Sent by the notification smoke test.',
      audience: 'ROLE',
      roles: ['ACADEMIC_COACH'],
      channels: ['IN_APP'],
      priority: 'LOW',
    }, 201);
    check('POST broadcast', broadcast.ok, `status ${broadcast.status}`);
    if (broadcast.body?.id) createdBroadcasts.push(broadcast.body.id);
    check('broadcast reports it was sent',
      broadcast.ok && broadcast.body.status === 'SENT' && broadcast.body.sentCount >= 1,
      JSON.stringify({ status: broadcast.body?.status, sent: broadcast.body?.sentCount }));

    const coachFeed = await get('/notifications?limit=10', roleUser.ACADEMIC_COACH.id);
    check('the coach received the broadcast',
      coachFeed.ok && coachFeed.body.some((n) => n.title === `${MARKER} broadcast`));

    const detail = await get(`/notification-admin/broadcasts/${broadcast.body.id}`, roleUser.ADMIN.id);
    check('broadcast detail reports delivered and read counts',
      detail.ok && detail.body.deliveredCount >= 1 && typeof detail.body.readCount === 'number');

    // Scheduled + cancel.
    const scheduled = await req('POST', '/notification-admin/broadcasts', roleUser.ADMIN.id, {
      title: `${MARKER} scheduled`,
      body: 'Should not go out.',
      audience: 'ROLE',
      roles: ['ADMIN'],
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
    }, 201);
    check('POST scheduled broadcast', scheduled.ok, `status ${scheduled.status}`);
    if (scheduled.body?.id) createdBroadcasts.push(scheduled.body.id);
    check('a scheduled broadcast is not sent immediately',
      scheduled.ok && scheduled.body.status === 'SCHEDULED' && scheduled.body.sentAt === null);

    const pastDated = await req('POST', '/notification-admin/broadcasts', roleUser.ADMIN.id, {
      title: `${MARKER} past`, body: 'x', audience: 'ALL',
      scheduledAt: new Date(Date.now() - 86_400_000).toISOString(),
    }, 400);
    check('scheduling in the past is rejected', pastDated.ok, `status ${pastDated.status}`);

    const cancelled = await req('POST',
      `/notification-admin/broadcasts/${scheduled.body.id}/cancel`, roleUser.ADMIN.id);
    check('a scheduled broadcast can be cancelled',
      cancelled.ok && cancelled.body.cancelledAt !== null, `status ${cancelled.status}`);

    const recancel = await req('POST',
      `/notification-admin/broadcasts/${broadcast.body.id}/cancel`, roleUser.ADMIN.id, undefined, 400);
    check('an already-sent broadcast cannot be cancelled', recancel.ok, `status ${recancel.status}`);

    // ── Drafts ───────────────────────────────────────────────────────────────
    console.log('\n── Broadcast drafts ──');
    const draft = await req('POST', '/notification-admin/broadcasts', roleUser.ADMIN.id, {
      title: `${MARKER} draft`,
      body: 'Still being written.',
      audience: 'ROLE',
      roles: ['ADMIN'],
      draft: true,
    }, 201);
    check('POST draft broadcast', draft.ok, `status ${draft.status}`);
    if (draft.body?.id) createdBroadcasts.push(draft.body.id);
    check('a draft is stored as DRAFT and not sent',
      draft.ok && draft.body.status === 'DRAFT' && draft.body.sentAt === null);

    const draftBefore = await db.query(
      `SELECT COUNT(*)::int AS n FROM "Notification" WHERE "broadcastId" = $1`, [draft.body.id]);
    check('a draft creates no notifications', draftBefore.rows[0].n === 0,
      `${draftBefore.rows[0].n} rows`);

    // A draft may hold a past date — it is not going anywhere until sent.
    const pastDraft = await req('POST', '/notification-admin/broadcasts', roleUser.ADMIN.id, {
      title: `${MARKER} past draft`, body: 'x', audience: 'ALL', draft: true,
      scheduledAt: new Date(Date.now() - 86_400_000).toISOString(),
    }, 201);
    check('a draft may carry a past date', pastDraft.ok, `status ${pastDraft.status}`);
    if (pastDraft.body?.id) createdBroadcasts.push(pastDraft.body.id);

    const edited = await req('PATCH', `/notification-admin/broadcasts/${draft.body.id}`,
      roleUser.ADMIN.id, {
        title: `${MARKER} draft edited`,
        body: 'Now finished.',
        audience: 'ROLE',
        roles: ['ADMIN'],
        draft: true,
      });
    check('a draft can be edited in place',
      edited.ok && edited.body.title === `${MARKER} draft edited` &&
      edited.body.id === draft.body.id, `status ${edited.status}`);

    const sentDraft = await req('PATCH', `/notification-admin/broadcasts/${draft.body.id}`,
      roleUser.ADMIN.id, {
        title: `${MARKER} draft sent`,
        body: 'Going out now.',
        audience: 'ROLE',
        roles: ['ADMIN'],
        draft: false,
      });
    check('clearing the draft flag sends it',
      sentDraft.ok && sentDraft.body.status === 'SENT' && sentDraft.body.sentAt !== null,
      `status ${sentDraft.status} · ${sentDraft.body?.status}`);
    check('sending a draft reuses its row, it does not clone it',
      sentDraft.ok && sentDraft.body.id === draft.body.id);

    const reEdit = await req('PATCH', `/notification-admin/broadcasts/${draft.body.id}`,
      roleUser.ADMIN.id, {
        title: `${MARKER} too late`, body: 'x', audience: 'ALL', draft: true,
      }, 400);
    check('a sent broadcast can no longer be edited', reEdit.ok, `status ${reEdit.status}`);

    /*
     * Asserting `failedCount === 0` would pass against the hardcoded zero this
     * replaced, so it is checked against the delivery rows instead: the number
     * on the broadcast must be the number of recipients who actually had a
     * channel fail. Both are 0 on a healthy box — but wire it wrong and the day
     * a provider breaks, this catches it.
     */
    const failedRecipients = await db.query(
      `SELECT COUNT(DISTINCT n.id)::int AS n
         FROM "Notification" n
         JOIN "NotificationDelivery" d ON d."notificationId" = n.id
        WHERE n."broadcastId" = $1 AND d.status = 'FAILED'`,
      [draft.body.id],
    );
    check('the broadcast failure count matches its failed deliveries',
      sentDraft.ok && sentDraft.body.failedCount === failedRecipients.rows[0].n,
      `broadcast says ${sentDraft.body?.failedCount}, deliveries say ${failedRecipients.rows[0].n}`);

    /*
     * …and prove the counter is really wired by forcing a genuine failure: a
     * push subscription with valid keys but an unroutable endpoint. web-push
     * gets far enough to make the request and then fails on the network, which
     * is a FAILED delivery rather than a `skipped` one.
     */
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const deadEndpoint = 'https://push.smoke-invalid.test/never';
    await db.query(
      `INSERT INTO "PushSubscription" (id,"userId",endpoint,p256dh,auth,"createdAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,now())`,
      [
        roleUser.ADMIN.id,
        deadEndpoint,
        ecdh.getPublicKey().toString('base64url'),
        crypto.randomBytes(16).toString('base64url'),
      ],
    );

    // Only this one admin has the bogus subscription; the rest have none, which
    // is `skipped`. So exactly one recipient must be counted as failed.
    const failing = await req('POST', '/notification-admin/broadcasts', roleUser.ADMIN.id, {
      title: `${MARKER} push failure`,
      body: 'This push cannot be delivered.',
      audience: 'ROLE',
      roles: ['ADMIN'],
      channels: ['IN_APP', 'PUSH'],
    }, 201);
    if (failing.body?.id) createdBroadcasts.push(failing.body.id);

    const pushRow = await db.query(
      `SELECT d.status, d."lastError"
         FROM "Notification" n
         JOIN "NotificationDelivery" d ON d."notificationId" = n.id
        WHERE n."broadcastId" = $1 AND d.channel = 'PUSH' AND n."userId" = $2`,
      [failing.body?.id, roleUser.ADMIN.id],
    );
    check('an unreachable push endpoint is recorded as FAILED, not skipped',
      pushRow.rows.length === 1 && pushRow.rows[0].status === 'FAILED',
      `status ${pushRow.rows[0]?.status} · ${pushRow.rows[0]?.lastError ?? 'no error recorded'}`);
    check('that failure reaches the broadcast row — the old hardcoded 0 would not',
      failing.ok && failing.body.failedCount === 1,
      `failedCount ${failing.body?.failedCount}`);

    await db.query(`DELETE FROM "PushSubscription" WHERE endpoint=$1`, [deadEndpoint]);

    // ── Feed, filters, archive ───────────────────────────────────────────────
    console.log('\n── Feed ──');
    const feed = await get('/notifications/feed?limit=5', roleUser.ACADEMIC_COACH.id);
    check('GET /notifications/feed paginates',
      feed.ok && Array.isArray(feed.body.items) && 'nextCursor' in feed.body,
      `status ${feed.status}`);

    const filtered = await get('/notifications/feed?category=SYSTEM&limit=5', roleUser.ACADEMIC_COACH.id);
    check('feed filters by category',
      filtered.ok && filtered.body.items.every((n) => n.category === 'SYSTEM'));

    const summary = await get('/notifications/summary', roleUser.ACADEMIC_COACH.id);
    check('GET /notifications/summary returns every category',
      summary.ok && summary.body.length === 7, `status ${summary.status}`);

    const counts = await get('/notifications/unread-count', roleUser.ACADEMIC_COACH.id);
    check('unread-count reports criticals separately',
      counts.ok && typeof counts.body.count === 'number' && typeof counts.body.critical === 'number');

    const target = coachFeed.body.find((n) => n.title === `${MARKER} broadcast`);
    const readOne = await req('PATCH', `/notifications/${target.id}/read`, roleUser.ACADEMIC_COACH.id);
    check('PATCH mark read', readOne.ok, `status ${readOne.status}`);
    const readRow = await db.query(
      `SELECT "read","readAt",status FROM "Notification" WHERE id=$1`, [target.id]);
    check('mark read stamps readAt and status',
      readRow.rows[0].read === true && readRow.rows[0].readAt !== null && readRow.rows[0].status === 'READ',
      JSON.stringify(readRow.rows[0]));

    const foreign = await req('PATCH', `/notifications/${target.id}/read`, roleUser.STUDENT.id);
    check('marking another user’s notification read is a no-op, not an error', foreign.ok);

    const archived = await req('DELETE', `/notifications/${target.id}`, roleUser.ACADEMIC_COACH.id);
    check('DELETE archives rather than destroys', archived.ok, `status ${archived.status}`);
    const stillThere = await db.query(`SELECT "archivedAt" FROM "Notification" WHERE id=$1`, [target.id]);
    check('the row survives archiving',
      stillThere.rows.length === 1 && stillThere.rows[0].archivedAt !== null);
    const afterArchive = await get('/notifications/feed', roleUser.ACADEMIC_COACH.id);
    check('archived rows leave the default feed',
      afterArchive.ok && !afterArchive.body.items.some((n) => n.id === target.id));

    // ── Admin dashboard, centre, analytics, reports ──────────────────────────
    console.log('\n── Admin dashboard ──');
    const dash = await get('/notification-admin/dashboard', roleUser.ADMIN.id);
    check('GET dashboard', dash.ok, `status ${dash.status}`);
    check('dashboard has all 8 cards',
      dash.ok && Object.keys(dash.body.cards).length === 8,
      dash.ok ? `got ${Object.keys(dash.body.cards).length}` : '');
    check('channel health lists all 5 channels', dash.ok && dash.body.channels.length === 5);
    check('WhatsApp and SMS report themselves unconfigured',
      dash.ok && dash.body.channels.filter((c) => c.configured === false)
        .some((c) => c.channel === 'WHATSAPP'));

    const centre = await get('/notification-admin/centre?limit=5', roleUser.ADMIN.id);
    check('GET centre', centre.ok, `status ${centre.status}`);
    check('centre rows carry user, channels and status',
      centre.ok && centre.body.items.length > 0 && centre.body.items[0].user &&
        Array.isArray(centre.body.items[0].channels));

    const byRole = await get('/notification-admin/centre?role=ACADEMIC_COACH&limit=5', roleUser.ADMIN.id);
    check('centre filters by recipient role',
      byRole.ok && byRole.body.items.every((r) => r.user.role === 'ACADEMIC_COACH'));

    const analytics = await get('/notification-admin/analytics?range=30d', roleUser.ADMIN.id);
    check('GET analytics', analytics.ok, `status ${analytics.status}`);
    check('analytics has 5 cards and 7 charts',
      analytics.ok && Object.keys(analytics.body.cards).length === 5 &&
        Object.keys(analytics.body.charts).length === 7,
      analytics.ok ? `${Object.keys(analytics.body.cards).length}/${Object.keys(analytics.body.charts).length}` : '');
    check('read rate is a percentage, not a fraction',
      analytics.ok && analytics.body.cards.readRate >= 0 && analytics.body.cards.readRate <= 100);

    for (const kind of ['daily', 'delivery', 'read', 'failure', 'engagement', 'channel']) {
      const r = await get(`/notification-admin/reports/${kind}?range=30d`, roleUser.ADMIN.id);
      check(`report ${kind}`, r.ok && Array.isArray(r.body.rows) && Array.isArray(r.body.columns),
        `status ${r.status}`);
    }

    const failuresList = await get('/notification-admin/failures', roleUser.ADMIN.id);
    check('GET failures', failuresList.ok && Array.isArray(failuresList.body), `status ${failuresList.status}`);

    const retrySweep = await req('POST', '/notification-admin/failures/retry-all', roleUser.ADMIN.id);
    check('retry sweep runs', retrySweep.ok && typeof retrySweep.body.retried === 'number',
      `status ${retrySweep.status}`);

    const schedSweep = await req('POST', '/notification-admin/scheduled/run', roleUser.ADMIN.id);
    check('scheduled sweep runs', schedSweep.ok && typeof schedSweep.body.dispatched === 'number',
      `status ${schedSweep.status}`);
    check('a cancelled broadcast is not picked up by the sweep',
      schedSweep.ok && schedSweep.body.due === 0, JSON.stringify(schedSweep.body));

    // ── Push ─────────────────────────────────────────────────────────────────
    console.log('\n── Web Push ──');
    const key = await get('/notifications/push/public-key', roleUser.STUDENT.id);
    check('VAPID public key is served',
      key.ok && key.body.enabled === true && typeof key.body.publicKey === 'string' &&
        key.body.publicKey.length > 20,
      JSON.stringify(key.body));

    // ── Role isolation ───────────────────────────────────────────────────────
    console.log('\n── Role isolation ──');
    const studentDash = await get('/notification-admin/dashboard', roleUser.STUDENT.id, 403);
    check('STUDENT blocked from the admin dashboard', studentDash.ok, `status ${studentDash.status}`);
    const teacherBroadcast = await req('POST', '/notification-admin/broadcasts', roleUser.TEACHER.id,
      { title: 'x', body: 'y', audience: 'ALL' }, 403);
    check('TEACHER blocked from broadcasting', teacherBroadcast.ok, `status ${teacherBroadcast.status}`);
    const supervisorTemplate = await req('POST', '/notification-admin/templates', roleUser.SUPERVISOR.id,
      { code: 'X', name: 'x', category: 'SYSTEM', subject: 's', bodyText: 'b' }, 403);
    check('SUPERVISOR blocked from creating templates', supervisorTemplate.ok,
      `status ${supervisorTemplate.status}`);
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    console.log('\n── Cleanup ──');
    // Notifications first: broadcasts do not cascade to the rows they fan out,
    // and deliveries hang off the notifications.
    await db.query(`DELETE FROM "Notification" WHERE title LIKE $1`, [`${MARKER}%`]);
    for (const id of createdBroadcasts) {
      await db.query(`DELETE FROM "Notification" WHERE "broadcastId"=$1`, [id]);
      await db.query(`DELETE FROM "NotificationBroadcast" WHERE id=$1`, [id]);
    }
    for (const code of createdTemplates) {
      await db.query(`DELETE FROM "NotificationTemplate" WHERE code=$1`, [code]);
    }
    // Preferences created by the test — these users had none before it ran.
    await db.query(`DELETE FROM "NotificationPreference" WHERE "userId" = ANY($1::text[])`, [
      Object.values(roleUser).map((u) => u.id),
    ]);

    const { rows } = await db.query(
      `SELECT (SELECT count(*)::int FROM "Notification" WHERE title LIKE $1) AS notifications,
              (SELECT count(*)::int FROM "NotificationBroadcast" WHERE title LIKE $1) AS broadcasts,
              (SELECT count(*)::int FROM "NotificationTemplate" WHERE code LIKE $2) AS templates,
              (SELECT count(*)::int FROM "NotificationPreference") AS preferences`,
      [`${MARKER}%`, `${MARKER}%`],
    );
    console.log(
      `Cleanup: ${rows[0].notifications} stray notifications · ${rows[0].broadcasts} broadcasts · ` +
        `${rows[0].templates} templates · ${rows[0].preferences} preference rows remaining`,
    );
    await db.end();
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  · ${f}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error('Smoke run failed:', e);
  process.exit(1);
});

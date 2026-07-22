/* Smoke test for Finance & Reporting.
 * Reads every panel, runs a full invoice→partial-payment→paid flow end-to-end,
 * then deletes everything it created so the DB is left clean. */
require('dotenv/config');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const users = {};
  for (const role of ['ADMIN', 'TEACHER', 'STUDENT', 'ACADEMIC_COACH']) {
    const { rows } = await db.query(`SELECT id FROM "User" WHERE role=$1 LIMIT 1`, [role]);
    if (rows.length) users[role] = rows[0].id;
  }
  const { rows: sp } = await db.query(`SELECT id FROM "StudentProfile" LIMIT 1`);
  const studentProfileId = sp[0]?.id ?? null;

  const tok = (uid) => jwt.sign({ sub: uid }, process.env.JWT_ACCESS_SECRET);
  const req = async (uid, method, p, body) => {
    const r = await fetch(`${BASE}${p}`, {
      method,
      headers: {
        Authorization: `Bearer ${tok(uid)}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${(await r.text()).slice(0, 250)}`);
    return r.status === 204 ? null : r.json();
  };
  const get = (uid, p) => req(uid, 'GET', p);

  let pass = 0;
  const ok = (cond, label) => {
    if (cond) { pass++; console.log(`  ✓ ${label}`); }
    else throw new Error(`FAIL: ${label}`);
  };

  const created = { invoiceId: null, discountId: null, planId: null };
  /*
   * Taking a payment notifies people, and those notifications outlive the
   * invoice they came from. Every run left a few behind, and once enough had
   * piled up they pushed smoke-notifications' marker broadcast off the first
   * page of the coach's feed and failed a suite that had nothing to do with
   * finance. A smoke test has to leave the database as it found it.
   */
  const runStart = new Date();
  try {
    console.log('ADMIN reads:');
    const dash = await get(users.ADMIN, '/finance/dashboard');
    ok(dash.cards && dash.charts && 'netProfit' in dash.cards, 'finance dashboard (cards+charts)');
    ok((await get(users.ADMIN, '/finance/analytics')).methodDist !== undefined, 'analytics');
    const cfg = await get(users.ADMIN, '/finance/config');
    ok(typeof cfg.currency === 'string', 'config');
    const pnl = await get(users.ADMIN, '/finance/reports?type=pnl');
    ok(Array.isArray(pnl.rows) && pnl.columns.includes('profit'), 'P&L report');
    ok(Array.isArray((await get(users.ADMIN, '/finance/fee-plans')).items), 'fee-plans list');
    ok(Array.isArray((await get(users.ADMIN, '/finance/invoices')).items), 'invoices list');
    ok(Array.isArray((await get(users.ADMIN, '/finance/discounts')).items), 'discounts list');
    ok(Array.isArray((await get(users.ADMIN, '/finance/scholarships')).items), 'scholarships list');
    ok(Array.isArray((await get(users.ADMIN, '/finance/refunds')).items), 'refunds list');
    ok(Array.isArray((await get(users.ADMIN, '/finance/payroll/config')).items), 'payroll configs');

    console.log('ADMIN write flow:');
    const disc = await req(users.ADMIN, 'POST', '/finance/discounts', {
      name: 'SMOKE 10%', type: 'PERCENTAGE', value: 10, reason: 'PROMOTIONAL',
    });
    created.discountId = disc.id;
    ok(disc.id, 'create discount');

    const plan = await req(users.ADMIN, 'POST', '/finance/fee-plans', {
      name: 'SMOKE Plan', cycle: 'MONTHLY',
      // Priced in all three: a plan no longer names one currency, and a family
      // billed in a currency it lacks cannot be invoiced from it.
      components: [{ type: 'COURSE', label: 'Course Fee', amountUSD: 100, amountAED: 400, amountGBP: 80 }],
    });
    created.planId = plan.id;
    ok(plan.components.length === 1, 'create fee plan');

    if (studentProfileId) {
      const inv = await req(users.ADMIN, 'POST', '/finance/invoices', {
        studentId: studentProfileId,
        items: [{ type: 'COURSE', label: 'Course Fee', amount: 100 }],
        discountId: created.discountId,
        status: 'DRAFT',
      });
      created.invoiceId = inv.id;
      // 100 − 10% discount = 90
      ok(Number(inv.amount) === 90, `invoice total after discount = 90 (got ${inv.amount})`);

      const pay1 = await req(users.ADMIN, 'POST', `/finance/invoices/${inv.id}/payments`, {
        amount: 40, method: 'CASH',
      });
      ok(pay1.receipt && pay1.receipt.number && Number(pay1.balance) === 50, 'partial payment + receipt (balance 50)');

      const midway = await get(users.ADMIN, `/finance/invoices/${inv.id}`);
      ok(midway.status === 'PARTIALLY_PAID', 'status PARTIALLY_PAID');

      const pay2 = await req(users.ADMIN, 'POST', `/finance/invoices/${inv.id}/payments`, {
        amount: 50, method: 'BANK_TRANSFER',
      });
      ok(Number(pay2.balance) === 0, 'final payment clears balance');
      const done = await get(users.ADMIN, `/finance/invoices/${inv.id}`);
      ok(done.status === 'PAID' && done.receipts.length === 2, 'status PAID + 2 receipts');
    } else {
      console.log('  (no StudentProfile — invoice flow skipped)');
    }

    /*
     * Currencies are never added together.
     *
     * Revenue used to be summed across every invoice regardless of currency, so
     * an AED 1000 payment moved a dollar-labelled total by 1000 — about 3.7x the
     * real amount — and net profit then subtracted USD payroll from it. The sum
     * was arithmetically fine; only the units were wrong, so nothing complained.
     */
    if (studentProfileId) {
      console.log('MULTI-CURRENCY:');
      const before = (await get(users.ADMIN, '/finance/dashboard')).cards.totalRevenue;
      let aedInvoiceId = null;
      try {
        const aed = await req(users.ADMIN, 'POST', '/finance/invoices', {
          studentId: studentProfileId,
          currency: 'AED',
          items: [{ type: 'COURSE', label: 'AED probe', amount: 1000 }],
          status: 'DRAFT',
        });
        aedInvoiceId = aed.id;
        ok(aed.currency === 'AED', 'invoice can be raised in AED');
        await req(users.ADMIN, 'POST', `/finance/invoices/${aed.id}/payments`, {
          amount: 1000, method: 'CASH',
        });

        const dash = await get(users.ADMIN, '/finance/dashboard');
        ok(dash.cards.totalRevenue === before,
          `AED payment left the ${dash.currency} total alone (${before} → ${dash.cards.totalRevenue})`);

        const line = (dash.byCurrency || []).find((l) => l.currency === 'AED');
        ok(line && line.totalRevenue === 1000,
          `AED revenue is reported on its own line (${line ? line.totalRevenue : 'missing'})`);
        ok((dash.byCurrency || []).every((l) => typeof l.currency === 'string'),
          'every currency line names its currency');
      } finally {
        if (aedInvoiceId) await db.query(`DELETE FROM "Invoice" WHERE id=$1`, [aedInvoiceId]);
      }
    }

    if (users.STUDENT) {
      console.log('STUDENT:');
      const sd = await get(users.STUDENT, '/finance/student/dashboard');
      ok(sd.cards && Array.isArray(sd.invoices), 'student fee dashboard');
    }
    if (users.TEACHER) {
      console.log('TEACHER:');
      const td = await get(users.TEACHER, '/finance/teacher/dashboard');
      ok(td.cards && Array.isArray(td.payslips), 'teacher payroll dashboard');

      /*
       * Staff are paid in USD wherever they live. Payroll used to stamp the
       * payout with the employee's country currency, so a teacher in the UAE
       * got a row saying AED while every screen printed a dollar sign — the
       * same figure read two ways, with nothing converted.
       *
       * Park the teacher in the UAE (the exact input that produced AED) and
       * assert the generated payout still says USD.
       */
      const prevCountry = (
        await db.query(`SELECT country FROM "User" WHERE id=$1`, [users.TEACHER])
      ).rows[0]?.country ?? null;
      try {
        await db.query(`UPDATE "User" SET country='United Arab Emirates' WHERE id=$1`, [
          users.TEACHER,
        ]);
        // A period far enough back that a real payroll run cannot collide.
        // Matched as a range, not an equality: the API stores the period start
        // in server-local time, so '2019-01-01' lands before UTC midnight
        // anywhere east of Greenwich and an `= $1::date` never matches.
        const start = '2019-01-01', end = '2019-01-31';
        const within = [users.TEACHER, '2018-12-30', '2019-01-02'];
        await req(users.ADMIN, 'POST', '/finance/payroll/generate', {
          billingPeriodStart: start, billingPeriodEnd: end,
        });
        const row = (
          await db.query(
            `SELECT currency FROM "Payout"
              WHERE "userId"=$1 AND "billingPeriodStart" BETWEEN $2::date AND $3::date`,
            within,
          )
        ).rows[0];
        ok(row, 'payroll run generated a payout for the UAE teacher');
        ok(row && row.currency === 'USD',
          `UAE teacher is paid in USD (got ${row ? row.currency : 'no row'})`);
        // Every staff member gets a row from a run, not just this teacher.
        await db.query(
          `DELETE FROM "Payout" WHERE "billingPeriodStart" BETWEEN $1::date AND $2::date`,
          [within[1], within[2]],
        );
      } finally {
        await db.query(`UPDATE "User" SET country=$2 WHERE id=$1`, [
          users.TEACHER, prevCountry,
        ]);
      }
    }

    /*
     * A student cannot settle their own invoice.
     *
     * POST /student-portal/invoices/:id/pay used to set it PAID and write a
     * Payment row with an invented Stripe reference — no money, no Receipt, no
     * paidAmount, and the finance dashboard counted it as revenue. It is gone;
     * this proves it stays gone, and that the invoice does not move.
     */
    if (studentProfileId && users.STUDENT) {
      console.log('SELF-PAY:');
      let probeId = null;
      try {
        const probe = await req(users.ADMIN, 'POST', '/finance/invoices', {
          studentId: studentProfileId,
          items: [{ type: 'COURSE', label: 'self-pay probe', amount: 50 }],
          status: 'SENT',
        });
        probeId = probe.id;
        const r = await fetch(`${BASE}/student-portal/invoices/${probe.id}/pay`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok(users.STUDENT)}` },
        });
        ok(r.status === 404, `the self-pay endpoint is gone (got ${r.status})`);
        const after = (
          await db.query(`SELECT status, "paidAmount" FROM "Invoice" WHERE id=$1`, [probe.id])
        ).rows[0];
        ok(after.status === 'SENT' && Number(after.paidAmount) === 0,
          `the invoice did not move (${after.status}, paid ${after.paidAmount})`);
      } finally {
        if (probeId) await db.query(`DELETE FROM "Invoice" WHERE id=$1`, [probeId]);
      }
    }

    console.log('RBAC:');
    if (users.STUDENT) {
      const r = await fetch(`${BASE}/finance/dashboard`, { headers: { Authorization: `Bearer ${tok(users.STUDENT)}` } });
      ok(r.status === 403, 'student blocked from finance dashboard (403)');
    }
    if (users.TEACHER) {
      const r = await fetch(`${BASE}/finance/invoices`, { headers: { Authorization: `Bearer ${tok(users.TEACHER)}` } });
      ok(r.status === 403, 'teacher blocked from admin invoices (403)');
    }
  } finally {
    // Cleanup — delete created rows directly (cascades items/payments/receipts).
    if (created.invoiceId) await db.query(`DELETE FROM "Invoice" WHERE id=$1`, [created.invoiceId]);
    if (created.planId) await db.query(`DELETE FROM "FeePlan" WHERE id=$1`, [created.planId]);
    if (created.discountId) await db.query(`DELETE FROM "Discount" WHERE id=$1`, [created.discountId]);
    const swept = await db.query(
      `DELETE FROM "Notification"
        WHERE "createdAt" >= $1
          AND type IN ('PAYMENT_RECEIVED','INVOICE_ISSUED','INVOICE_DUE','PAYSLIP_ISSUED')`,
      [runStart],
    );
    if (swept.rowCount) console.log(`  (cleaned ${swept.rowCount} notification(s) this run created)`);
    await db.end();
  }

  console.log(`\nSMOKE OK: ${pass} checks passed.`);
}

main().catch((e) => { console.error('SMOKE FAILED:', e.message); process.exit(1); });

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

    if (users.STUDENT) {
      console.log('STUDENT:');
      const sd = await get(users.STUDENT, '/finance/student/dashboard');
      ok(sd.cards && Array.isArray(sd.invoices), 'student fee dashboard');
    }
    if (users.TEACHER) {
      console.log('TEACHER:');
      const td = await get(users.TEACHER, '/finance/teacher/dashboard');
      ok(td.cards && Array.isArray(td.payslips), 'teacher payroll dashboard');
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
    await db.end();
  }

  console.log(`\nSMOKE OK: ${pass} checks passed.`);
}

main().catch((e) => { console.error('SMOKE FAILED:', e.message); process.exit(1); });

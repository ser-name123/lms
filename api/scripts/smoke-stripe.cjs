/*
 * Smoke test for the Stripe payment path.
 *
 * The half that matters most can be tested with no Stripe account at all: the
 * webhook. Its signature is an HMAC over the raw body using the webhook secret,
 * so this signs its own events with the same scheme and posts them. That covers
 * everything on our side of the wire — signature checking, idempotency, and the
 * write into BillingService.recordPayment.
 *
 * What it cannot cover without real keys is PaymentIntent creation, which is a
 * call out to Stripe. Those checks assert the server refuses cleanly instead of
 * pretending, and are marked so nobody mistakes this for full coverage.
 */
require('dotenv/config');
const crypto = require('crypto');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;

let pass = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else throw new Error(`FAIL: ${label}`);
};

/** Exactly how Stripe signs: t=<ts>,v1=HMAC_SHA256(`<ts>.<body>`, secret). */
function signature(body, secret, timestamp) {
  const v1 = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

const postWebhook = (body, sig) =>
  fetch(`${BASE}/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sig ? { 'stripe-signature': sig } : {}),
    },
    body,
  });

function intentEvent({ eventId, intentId, invoiceId, amountMinor, type }) {
  return JSON.stringify({
    id: eventId,
    object: 'event',
    type: type || 'payment_intent.succeeded',
    data: {
      object: {
        id: intentId,
        object: 'payment_intent',
        amount: amountMinor,
        amount_received: amountMinor,
        currency: 'usd',
        status: 'succeeded',
        metadata: { invoiceId },
      },
    },
  });
}

async function main() {
  if (!SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is not set — cannot sign test events');

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const users = {};
  for (const role of ['ADMIN', 'STUDENT']) {
    const { rows } = await db.query(`SELECT id FROM "User" WHERE role=$1 LIMIT 1`, [role]);
    if (rows.length) users[role] = rows[0].id;
  }
  const { rows: sp } = await db.query(`SELECT id FROM "StudentProfile" LIMIT 1`);
  const studentProfileId = sp[0]?.id ?? null;
  if (!studentProfileId) throw new Error('No StudentProfile to invoice');

  const tok = (uid) => jwt.sign({ sub: uid }, process.env.JWT_ACCESS_SECRET);
  const req = async (uid, method, p, body, expect) => {
    const r = await fetch(`${BASE}${p}`, {
      method,
      headers: { Authorization: `Bearer ${tok(uid)}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (expect && r.status !== expect) {
      throw new Error(`${method} ${p} → ${r.status}, expected ${expect}: ${(await r.text()).slice(0, 200)}`);
    }
    return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) };
  };

  const runStart = new Date();
  const invoices = [];
  try {
    console.log('CONFIG:');
    const cfg = await req(users.ADMIN, 'GET', '/payments/config');
    ok(cfg.status === 200 && typeof cfg.body.configured === 'boolean', 'GET /payments/config');
    ok(cfg.body.webhooksConfigured === true, 'the webhook secret is loaded');

    // ── Signature ────────────────────────────────────────────────────────────
    console.log('\nSIGNATURE:');
    const junk = JSON.stringify({ id: 'evt_junk', type: 'payment_intent.succeeded', data: { object: {} } });

    ok((await postWebhook(junk, undefined)).status === 400, 'an unsigned event is rejected');
    ok((await postWebhook(junk, 't=1,v1=deadbeef')).status === 400, 'a wrongly signed event is rejected');

    // Right secret, but the body altered after signing — the classic tamper.
    const ts = Math.floor(Date.now() / 1000);
    const goodSig = signature(junk, SECRET, ts);
    const tampered = junk.replace('evt_junk', 'evt_swapped');
    ok((await postWebhook(tampered, goodSig)).status === 400,
      'a body altered after signing is rejected');

    // ── The real thing ───────────────────────────────────────────────────────
    console.log('\nPAYMENT:');
    const inv = await req(users.ADMIN, 'POST', '/finance/invoices', {
      studentId: studentProfileId,
      items: [{ type: 'COURSE', label: 'stripe smoke', amount: 120 }],
      status: 'SENT',
    }, 201);
    invoices.push(inv.body.id);
    ok(Number(inv.body.amount) === 120, 'invoice raised for 120');

    const evtId = `evt_smoke_${Date.now()}`;
    const intentId = `pi_smoke_${Date.now()}`;
    const body = intentEvent({ eventId: evtId, intentId, invoiceId: inv.body.id, amountMinor: 12000 });
    const sig = signature(body, SECRET, Math.floor(Date.now() / 1000));

    const first = await postWebhook(body, sig);
    ok(first.status === 200, `a correctly signed event is accepted (${first.status})`);

    const paid = (await db.query(
      `SELECT status, "paidAmount" FROM "Invoice" WHERE id=$1`, [inv.body.id])).rows[0];
    ok(paid.status === 'PAID' && Number(paid.paidAmount) === 120,
      `the invoice is PAID with paidAmount 120 (${paid.status}, ${paid.paidAmount})`);

    /*
     * The fake checkout this replaced set status PAID and nothing else. Going
     * through recordPayment is what produces a numbered Receipt and a Payment
     * row carrying the Stripe reference, so assert those rather than the status
     * alone — the status is the one thing the old bug also got right.
     */
    const payment = (await db.query(
      `SELECT method, reference, provider, status FROM "Payment" WHERE "invoiceId"=$1`,
      [inv.body.id])).rows[0];
    ok(payment && payment.method === 'STRIPE' && payment.reference === intentId,
      `a Payment row records the Stripe reference (${payment ? payment.reference : 'none'})`);

    const receipt = (await db.query(
      `SELECT number FROM "Receipt" WHERE "invoiceId"=$1`, [inv.body.id])).rows[0];
    ok(receipt && receipt.number, `a numbered Receipt was issued (${receipt ? receipt.number : 'none'})`);

    // ── Idempotency ──────────────────────────────────────────────────────────
    console.log('\nIDEMPOTENCY:');
    const replay = await postWebhook(body, signature(body, SECRET, Math.floor(Date.now() / 1000)));
    ok(replay.status === 200, 'a redelivery is accepted, not errored');
    ok((await replay.json()).status === 'duplicate', 'and is recognised as a duplicate');

    const after = (await db.query(
      `SELECT "paidAmount" FROM "Invoice" WHERE id=$1`, [inv.body.id])).rows[0];
    ok(Number(after.paidAmount) === 120,
      `the redelivery did not take the money twice (still ${after.paidAmount})`);
    const payCount = (await db.query(
      `SELECT count(*)::int n FROM "Payment" WHERE "invoiceId"=$1`, [inv.body.id])).rows[0].n;
    ok(payCount === 1, `exactly one Payment row exists (${payCount})`);

    // ── Refusing when Stripe is absent ───────────────────────────────────────
    console.log('\nWITHOUT KEYS:');
    const inv2 = await req(users.ADMIN, 'POST', '/finance/invoices', {
      studentId: studentProfileId,
      items: [{ type: 'COURSE', label: 'stripe smoke 2', amount: 30 }],
      status: 'SENT',
    }, 201);
    invoices.push(inv2.body.id);

    const intent = await req(users.ADMIN, 'POST', `/payments/invoices/${inv2.body.id}/intent`);
    if (cfg.body.configured) {
      ok(intent.status === 201 && intent.body.clientSecret, 'a PaymentIntent was created');
    } else {
      // No secret key on this machine. The point is that it says so rather than
      // returning something a checkout screen would treat as success.
      ok(intent.status === 503,
        `it refuses with 503 rather than pretending (got ${intent.status})`);
      console.log('    (PaymentIntent creation itself is untested here — no STRIPE_SECRET_KEY)');
    }

    // An invoice with nothing owing cannot be charged again.
    const settled = await req(users.ADMIN, 'POST', `/payments/invoices/${invoices[0]}/intent`);
    ok(settled.status === 400 || settled.status === 503,
      `a settled invoice is not chargeable (got ${settled.status})`);
  } finally {
    for (const id of invoices) {
      await db.query(`DELETE FROM "Invoice" WHERE id=$1`, [id]).catch(() => undefined);
    }
    await db.query(`DELETE FROM "StripeWebhookEvent" WHERE "receivedAt" >= $1`, [runStart]);
    await db.query(
      `DELETE FROM "Notification"
        WHERE "createdAt" >= $1 AND type IN ('PAYMENT_RECEIVED','INVOICE_ISSUED')`,
      [runStart],
    );
    await db.end();
  }

  console.log(`\nSMOKE OK: ${pass} checks passed.`);
}

main().catch((e) => { console.error('SMOKE FAILED:', e.message); process.exit(1); });

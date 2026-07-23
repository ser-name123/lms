require('dotenv').config();
const { Client } = require('pg');

async function main() {
  console.log('Connecting to database...');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  console.log('Connected.');

  console.log('\n--- INVOICES ---');
  const resInvoices = await client.query('SELECT * FROM "Invoice" LIMIT 5;');
  console.log(JSON.stringify(resInvoices.rows, null, 2));

  console.log('\n--- STRIPE WEBHOOK EVENTS ---');
  const resEvents = await client.query('SELECT * FROM "StripeWebhookEvent" LIMIT 10;');
  console.log(JSON.stringify(resEvents.rows, null, 2));
  
  await client.end();
}

main().catch(console.error);
